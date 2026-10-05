import type { OcrEngine, OcrResult, OcrWord } from "./ocrTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */
// PaddleOCR (versión web). La BIBLIOTECA y los MODELOS se sirven desde NUESTRO origen
// (public/ocr/paddle), nunca de un CDN. Se cargan solo al elegir este motor (carga
// diferida mediante inyección de <script>).
//
// IMPORTANTE: NO importamos el paquete con `import("@paddlejs-models/ocr")`. Ese paquete
// es un bundle UMD de webpack; cuando Vite/esbuild lo transforma de CommonJS a ESM deja
// referencias libres a variables de Node (`module`, `global`, ...). En iOS Safari eso
// provoca "Can't find variable: module". El bundle UMD está pensado para ejecutarse como
// <script> clásico (detecta el navegador vía `this`), así que lo cargamos así y leemos
// `window.paddlejs.ocr`. Es exactamente el camino que sí funciona.
let paddle: any = null;

const MODELS_BASE = `${import.meta.env.BASE_URL}ocr/paddle/`;
const PADDLE_SRC = `${MODELS_BASE}paddle-ocr.umd.js`;

// Carga diferida del bundle UMD mediante <script>. Reutiliza el que ya exista.
let scriptPromise: Promise<void> | null = null;
function loadPaddleScript(): Promise<void> {
  if ((window as any).paddlejs?.ocr) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PADDLE_SRC;
    s.async = true;
    s.dataset.ocr = "paddle";
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error(`no se pudo descargar la librería (${PADDLE_SRC})`));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// PaddleJS trae las URLs de los modelos fijas a un CDN (bcebos). Interceptamos fetch
// durante init/recognize y las redirigimos a nuestros ficheros locales.
async function withLocalModels<T>(fn: () => Promise<T>): Promise<T> {
  const orig = window.fetch.bind(window);
  const remap = (s: string): string | null => {
    const det = s.indexOf("ch_PP-OCRv2_det_fuse_activation/");
    if (det >= 0) return MODELS_BASE + "det/" + s.slice(det + "ch_PP-OCRv2_det_fuse_activation/".length);
    const rec = s.indexOf("ch_PP-OCRv2_rec_fuse_activation/");
    if (rec >= 0) return MODELS_BASE + "rec/" + s.slice(rec + "ch_PP-OCRv2_rec_fuse_activation/".length);
    return null;
  };
  window.fetch = ((input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const local = remap(String(url));
    return orig(local ?? input, init);
  }) as typeof window.fetch;
  try {
    return await fn();
  } finally {
    window.fetch = orig;
  }
}

async function loadPaddle(): Promise<any> {
  if (paddle) return paddle;
  try {
    await loadPaddleScript();
  } catch (e: any) {
    throw new Error(`No se pudo cargar PaddleOCR: ${e?.message || e}`);
  }
  const ns = (window as any).paddlejs?.ocr ?? (window as any).paddlejs;
  const ocr = ns?.default ?? ns;
  if (!ocr || typeof ocr.init !== "function") {
    throw new Error("No se pudo cargar PaddleOCR: la librería no expuso el módulo de OCR.");
  }
  try {
    await withLocalModels(() => ocr.init());
  } catch (e: any) {
    throw new Error(`PaddleOCR no pudo iniciar (modelos/WebGL): ${e?.message || e}`);
  }
  paddle = ocr;
  return ocr;
}

function splitLineToWords(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const total = tokens.reduce((s, t) => s + t.length, 0) || 1;
  const words: OcrWord[] = [];
  let acc = 0;
  for (const t of tokens) {
    const start = x0 + ((x1 - x0) * acc) / total;
    acc += t.length;
    const end = x0 + ((x1 - x0) * acc) / total;
    words.push({ text: t, x0: start, y0, x1: end, y1 });
  }
  return words;
}

export const paddleEngine: OcrEngine = {
  id: "paddle",
  label: "PaddleOCR (gratuito, en el móvil)",
  async recognize(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<OcrResult> {
    const ocr = await loadPaddle();
    onProgress?.(0.3);
    let res: any;
    try {
      res = await withLocalModels(() => ocr.recognize(canvas));
    } catch (e: any) {
      throw new Error(`PaddleOCR falló al leer la imagen (WebGL): ${e?.message || e}`);
    }
    onProgress?.(0.9);
    const words: OcrWord[] = [];
    const texts: string[] = res?.text ?? res?.texts ?? [];
    const points: any[] = res?.points ?? res?.boxes ?? [];
    for (let i = 0; i < texts.length; i++) {
      const quad = points[i];
      if (Array.isArray(quad) && quad.length >= 4) {
        const xs = quad.map((p: any) => (Array.isArray(p) ? p[0] : p.x));
        const ys = quad.map((p: any) => (Array.isArray(p) ? p[1] : p.y));
        words.push(...splitLineToWords(String(texts[i]), Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)));
      }
    }
    return { words, width: canvas.width, height: canvas.height };
  },
};
