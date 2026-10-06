// Compresión de la foto del monitor EN EL MÓVIL, antes de subirla.
// VÍA 1 (sin análisis): se guarda la foto ENTERA, tal cual se hizo. NO se endereza ni se
// recorta (en iPad el recorte perdía parte de la tabla). Solo:
//   - se reduce de tamaño (lado mayor ~1600 px),
//   - se corrige la orientación EXIF (iPhone/iPad y Android),
//   - se atenúa suavemente el muaré de la pantalla (sin invertir a blanco y negro).
// Puede guardarse en color o en escala de grises NORMAL (sin invertir).

export type PhotoMode = "color" | "gray";

// Modo por defecto de la Vía 1 (fácil de cambiar tras elegir color vs. gris).
export const VIA1_PHOTO_MODE: PhotoMode = "color";

export interface CompressResult {
  dataUrl: string; // data:image/jpeg;base64,...
  bytes: number;
  width: number;
  height: number;
}

export interface CompressOptions {
  maxDim?: number; // lado mayor en px (por defecto 1600)
  quality?: number; // calidad JPEG 0..1
  mode?: PhotoMode; // "color" (por defecto) o "gray" (gris normal, sin invertir)
  softenMoire?: boolean; // atenuación suave del muaré (por defecto sí)
}

/** Dibuja la imagen reescalada respetando la orientación, bajando de tamaño por pasos
 *  (cada paso a la mitad) para un remuestreo suave que ya reduce bastante el muaré. */
async function fileToCanvas(file: Blob, maxDim: number): Promise<HTMLCanvasElement> {
  const drawDown = (src: CanvasImageSource, sw: number, sh: number): HTMLCanvasElement => {
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    let cw = sw;
    let ch = sh;
    let cur: CanvasImageSource = src;
    // Reducción por pasos (half-steps) hasta acercarse al tamaño objetivo.
    while (cw * 0.5 > sw * scale) {
      const nw = Math.max(1, Math.round(cw * 0.5));
      const nh = Math.max(1, Math.round(ch * 0.5));
      const tmp = document.createElement("canvas");
      tmp.width = nw;
      tmp.height = nh;
      const tctx = tmp.getContext("2d")!;
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(cur, 0, 0, nw, nh);
      cur = tmp;
      cw = nw;
      ch = nh;
    }
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const out = document.createElement("canvas");
    out.width = dw;
    out.height = dh;
    const octx = out.getContext("2d")!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(cur, 0, 0, dw, dh);
    return out;
  };

  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      const c = drawDown(bmp, bmp.width, bmp.height);
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
    return drawDown(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Desenfoque suave 3×3 (separable) para atenuar el muaré sin perder legibilidad. */
function softenMoireInPlace(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const s = img.data;
  const tmp = new Uint8ClampedArray(s.length);
  const K0 = 0.5; // centro con más peso => desenfoque leve
  const K1 = 0.25;
  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const il = (y * w + Math.max(0, x - 1)) * 4;
      const ir = (y * w + Math.min(w - 1, x + 1)) * 4;
      for (let c = 0; c < 3; c++) tmp[i + c] = K1 * s[il + c] + K0 * s[i + c] + K1 * s[ir + c];
      tmp[i + 3] = s[i + 3];
    }
  }
  // Vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const it = (Math.max(0, y - 1) * w + x) * 4;
      const ib = (Math.min(h - 1, y + 1) * w + x) * 4;
      for (let c = 0; c < 3; c++) s[i + c] = K1 * tmp[it + c] + K0 * tmp[i + c] + K1 * tmp[ib + c];
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Escala de grises NORMAL (sin invertir). */
function toGrayInPlace(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
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

/** Comprime una foto del monitor para la Vía 1 (o la Vía 2 con mode="color"). */
export async function compressMonitorPhoto(file: Blob, opts: CompressOptions = {}): Promise<CompressResult> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.72;
  const mode = opts.mode ?? "color";
  const canvas = await fileToCanvas(file, maxDim);
  if (opts.softenMoire ?? true) softenMoireInPlace(canvas);
  if (mode === "gray") toGrayInPlace(canvas);
  const blob = await canvasToJpeg(canvas, quality);
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bytes: blob.size, width: canvas.width, height: canvas.height };
}

/** Formatea un tamaño en bytes de forma legible (para mostrarlo junto a la hora). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
