// Compresión de la foto del monitor EN EL MÓVIL, antes de subirla.
//  - Reescala el lado mayor a ~1600 px.
//  - Aplica el enderezado de perspectiva y la mejora de contraste existentes
//    (escala de grises + inversión: texto oscuro sobre fondo blanco).
//  - Codifica en JPEG de calidad media.
// Respeta la orientación EXIF en iOS (Safari) y Android (Chrome) usando createImageBitmap
// con imageOrientation "from-image"; si no está disponible, cae a <img> (que ya aplica
// la orientación en los navegadores modernos).
import { tryDeskew, enhance } from "./preprocess";

export interface CompressResult {
  dataUrl: string; // data:image/jpeg;base64,...
  bytes: number; // tamaño del JPEG comprimido
  width: number;
  height: number;
}

async function fileToCanvas(file: Blob, maxDim: number): Promise<HTMLCanvasElement> {
  const scaleCanvas = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D, dw: number, dh: number) => void) => {
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const dw = Math.max(1, Math.round(w * scale));
    const dh = Math.max(1, Math.round(h * scale));
    const c = document.createElement("canvas");
    c.width = dw;
    c.height = dh;
    const ctx = c.getContext("2d")!;
    draw(ctx, dw, dh);
    return c;
  };

  // Camino preferente: createImageBitmap respeta la orientación EXIF de forma consistente.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      const c = scaleCanvas(bmp.width, bmp.height, (ctx, dw, dh) => ctx.drawImage(bmp, 0, 0, dw, dh));
      bmp.close();
      return c;
    } catch {
      /* cae al método con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("No se pudo cargar la foto"));
      i.src = url;
    });
    return scaleCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height, (ctx, dw, dh) => ctx.drawImage(img, 0, 0, dw, dh));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo codificar la imagen"))), "image/jpeg", quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("No se pudo leer la imagen comprimida"));
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(blob);
  });
}

export interface CompressOptions {
  maxDim?: number; // lado mayor en px (por defecto 1600)
  quality?: number; // calidad JPEG 0..1 (por defecto 0.6 = media)
  deskew?: boolean; // enderezado de perspectiva (por defecto sí)
  grayscaleInvert?: boolean; // escala de grises + inversión (por defecto sí)
}

/** Comprime (y realza) una foto del monitor para la Vía 1. */
export async function compressMonitorPhoto(file: Blob, opts: CompressOptions = {}): Promise<CompressResult> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.6;
  let canvas = await fileToCanvas(file, maxDim);
  if (opts.deskew ?? true) canvas = tryDeskew(canvas, maxDim);
  if (opts.grayscaleInvert ?? true) enhance(canvas, { invert: true, contrast: 1.5, maxDim, deskew: true });
  const blob = await canvasToJpeg(canvas, quality);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bytes: blob.size, width: canvas.width, height: canvas.height };
}

/** Formatea un tamaño en bytes de forma legible (para mostrar junto a la hora). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
