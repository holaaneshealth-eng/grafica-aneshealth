// Corrección de perspectiva (enderezado) de la foto del monitor.
// - computeHomography / warpImageData: matemática pura (testeable en Node).
// - detectScreenQuad: detección best-effort de los bordes de la pantalla.
// Sin dependencias externas (debe funcionar aunque la red del hospital bloquee CDNs).

export type Pt = { x: number; y: number };
export interface GrayImage {
  data: Uint8ClampedArray | number[]; // RGBA
  width: number;
  height: number;
}

/** Resuelve A·x = b (eliminación gaussiana con pivoteo parcial). */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homografía (3x3, h8=1) que mapea los 4 puntos `from` a los 4 puntos `to`. */
export function computeHomography(from: Pt[], to: Pt[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i];
    const { x, y } = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [...h, 1];
}

export function applyH(h: number[], x: number, y: number): Pt {
  const d = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / d, y: (h[3] * x + h[4] * y + h[5]) / d };
}

/** Ordena 4 puntos como TL, TR, BR, BL. */
export function orderCorners(pts: Pt[]): Pt[] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[3];
  const rest = bySum.slice(1, 3).sort((a, b) => a.x - b.x);
  const bl = rest[0];
  const tr = rest[1];
  return [tl, tr, br, bl];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Endereza la región definida por `quad` (TL,TR,BR,BL) a un rectángulo recto. */
export function warpImageData(src: GrayImage, quad: Pt[], maxDim = 1600): GrayImage {
  const [tl, tr, br, bl] = orderCorners(quad);
  const outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  const scale = Math.min(1, maxDim / Math.max(outW, outH, 1));
  const W = Math.max(1, Math.round(outW * scale));
  const H = Math.max(1, Math.round(outH * scale));
  // Homografía rectángulo-salida -> quad-origen (para muestrear el origen por cada píxel de salida).
  const dstCorners: Pt[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  const h = computeHomography(dstCorners, [tl, tr, br, bl]);
  const out = new Uint8ClampedArray(W * H * 4);
  if (!h) return { data: out, width: W, height: H };
  const sd = src.data;
  const sw = src.width;
  const sh = src.height;
  const sample = (sx: number, sy: number, o: number) => {
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(sw - 1, x0 + 1);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fx = sx - x0;
    const fy = sy - y0;
    if (x0 < 0 || y0 < 0 || x0 >= sw || y0 >= sh) {
      out[o] = out[o + 1] = out[o + 2] = 255;
      out[o + 3] = 255;
      return;
    }
    for (let ch = 0; ch < 3; ch++) {
      const p00 = sd[(y0 * sw + x0) * 4 + ch];
      const p10 = sd[(y0 * sw + x1) * 4 + ch];
      const p01 = sd[(y1 * sw + x0) * 4 + ch];
      const p11 = sd[(y1 * sw + x1) * 4 + ch];
      out[o + ch] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
    }
    out[o + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = applyH(h, x + 0.5, y + 0.5);
      sample(s.x, s.y, (y * W + x) * 4);
    }
  }
  return { data: out, width: W, height: H };
}

/**
 * Detección best-effort de los bordes de la pantalla por perfiles de energía de borde
 * (Sobel). Devuelve un cuadrilátero (de momento rectángulo) o null si no hay confianza.
 * Se afinará con fotos reales (incluidas las anguladas) para enderezar también la rotación.
 */
export function detectScreenQuad(src: GrayImage): Pt[] | null {
  const { width: w, height: h } = src;
  const d = src.data;
  if (w < 40 || h < 40) return null;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const colE = new Float32Array(w);
  const rowE = new Float32Array(h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = Math.abs(gray[y * w + x + 1] - gray[y * w + x - 1]);
      const gy = Math.abs(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]);
      colE[x] += gx;
      rowE[y] += gy;
    }
  }
  const firstOver = (arr: Float32Array, from: number, to: number, step: number, thr: number) => {
    for (let i = from; step > 0 ? i < to : i > to; i += step) if (arr[i] > thr) return i;
    return -1;
  };
  const mean = (arr: Float32Array) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const colThr = mean(colE) * 1.6;
  const rowThr = mean(rowE) * 1.6;
  const left = firstOver(colE, 1, Math.floor(w * 0.45), 1, colThr);
  const right = firstOver(colE, w - 2, Math.ceil(w * 0.55), -1, colThr);
  const top = firstOver(rowE, 1, Math.floor(h * 0.45), 1, rowThr);
  const bottom = firstOver(rowE, h - 2, Math.ceil(h * 0.55), -1, rowThr);
  if (left < 0 || right < 0 || top < 0 || bottom < 0) return null;
  if (right - left < w * 0.4 || bottom - top < h * 0.4) return null; // poca confianza
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}
