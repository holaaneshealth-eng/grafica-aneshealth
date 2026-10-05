import type { OcrEngine, OcrResult, OcrWord } from "./ocrTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */
// PaddleOCR (versión web). La BIBLIOTECA viene del paquete npm (empaquetada y servida
// por nosotros) y los MODELOS se sirven desde NUESTRO origen (public/ocr/paddle), nunca
// de un CDN. Se cargan solo al elegir este motor (import dinámico = carga diferida).
let paddle: any = null;

const MODELS_BASE = `${import.meta.env.BASE_URL}ocr/paddle/`;

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
  const mod: any = await import("@paddlejs-models/ocr");
  const ocr = mod.default ?? mod;
  await withLocalModels(() => ocr.init());
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
    const res: any = await withLocalModels(() => ocr.recognize(canvas));
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
