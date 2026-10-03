// Preprocesado de la foto del monitor (en el navegador, con canvas).
// La pantalla del Mindray es oscura con texto claro: invertir mejora mucho el OCR.

import { detectScreenQuad, warpImageData } from "./perspective";

export interface PreprocessOptions {
  invert: boolean; // invertir colores (pantalla oscura -> texto negro sobre blanco)
  contrast: number; // 1 = sin cambio; 1.4 realza
  maxDim: number; // reescala el lado mayor a este máximo (px)
  deskew: boolean; // corrección de perspectiva (endereza la pantalla antes del OCR)
}

export const DEFAULT_PREPROCESS: PreprocessOptions = { invert: true, contrast: 1.5, maxDim: 1600, deskew: true };

/** Detecta los bordes de la pantalla y endereza la imagen. Si no hay confianza, no toca nada. */
export function tryDeskew(canvas: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quad = detectScreenQuad({ data: id.data, width: canvas.width, height: canvas.height });
  if (!quad) return canvas;
  const warped = warpImageData({ data: id.data, width: canvas.width, height: canvas.height }, quad, maxDim);
  const out = document.createElement("canvas");
  out.width = warped.width;
  out.height = warped.height;
  const octx = out.getContext("2d")!;
  const oid = octx.createImageData(warped.width, warped.height);
  oid.data.set(warped.data as Uint8ClampedArray);
  octx.putImageData(oid, 0, 0);
  return out;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/** Dibuja la imagen en un canvas, reescalando el lado mayor a maxDim. */
export function toCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** Escala de grises + contraste + inversión opcional. Devuelve el mismo canvas. */
export function enhance(canvas: HTMLCanvasElement, opts: PreprocessOptions): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const c = opts.contrast;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; // gris
    if (opts.invert) g = 255 - g;
    g = (g - 128) * c + 128; // contraste
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Pipeline completo: dataURL -> canvas preprocesado listo para OCR. */
export async function preprocessDataUrl(dataUrl: string, opts: PreprocessOptions = DEFAULT_PREPROCESS): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl);
  let canvas = toCanvas(img, opts.maxDim);
  if (opts.deskew) canvas = tryDeskew(canvas, opts.maxDim);
  return enhance(canvas, opts);
}
