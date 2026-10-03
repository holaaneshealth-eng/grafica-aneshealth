import type { OcrEngine, OcrResult, OcrWord } from "./ocrTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */
// PaddleOCR (versión web) cargado desde CDN en tiempo de ejecución (no se empaqueta,
// no infla el bundle ni rompe el build). Experimental: a validar con fotos reales.
const PADDLE_CDN = "https://esm.sh/@paddlejs-models/ocr@1.1.0";

let paddle: any = null;
async function loadPaddle(): Promise<any> {
  if (paddle) return paddle;
  const mod: any = await import(/* @vite-ignore */ PADDLE_CDN);
  const ocr = mod.default ?? mod;
  if (typeof ocr.init === "function") await ocr.init();
  paddle = ocr;
  return ocr;
}

// Reparte el texto de una línea en "palabras" distribuyendo su X por el ancho de la caja.
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
    const res: any = await ocr.recognize(canvas);
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
