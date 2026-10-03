import { computeHomography, applyH, orderCorners, warpImageData, type Pt, type GrayImage } from "../src/vision/perspective";

function assert(c: boolean, m: string) {
  console.log((c ? "✓ " : "✗ ") + m);
  if (!c) process.exitCode = 1;
}
const near = (a: number, b: number, t = 0.5) => Math.abs(a - b) <= t;

// 1) La homografía mapea cada esquina de origen a su destino.
const from: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
const to: Pt[] = [{ x: 2, y: 3 }, { x: 9, y: 1 }, { x: 11, y: 18 }, { x: 1, y: 17 }];
const h = computeHomography(from, to)!;
let okCorners = true;
for (let i = 0; i < 4; i++) {
  const p = applyH(h, from[i].x, from[i].y);
  if (!near(p.x, to[i].x) || !near(p.y, to[i].y)) okCorners = false;
}
assert(okCorners, "la homografía mapea las 4 esquinas correctamente");

// 2) orderCorners -> TL,TR,BR,BL.
const shuffled: Pt[] = [{ x: 11, y: 18 }, { x: 2, y: 3 }, { x: 1, y: 17 }, { x: 9, y: 1 }];
const o = orderCorners(shuffled);
assert(o[0].x === 2 && o[1].x === 9 && o[2].x === 11 && o[3].x === 1, "ordena esquinas TL,TR,BR,BL");

// 3) Warp identidad: gradiente horizontal, cuadrilátero = imagen completa.
const W = 12, H = 12;
const data = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const v = x * 20;
    const o4 = (y * W + x) * 4;
    data[o4] = v; data[o4 + 1] = v; data[o4 + 2] = v; data[o4 + 3] = 255;
  }
const src: GrayImage = { data, width: W, height: H };
const full: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
const out = warpImageData(src, full, 1600);
assert(out.width === W && out.height === H, "warp identidad conserva el tamaño");
const px = (x: number, y: number) => out.data[(y * out.width + x) * 4];
assert(near(px(2, 6), 2 * 20, 25) && near(px(9, 6), 9 * 20, 25), "warp identidad conserva el gradiente");

console.log(process.exitCode ? "\nRESULTADO: con fallos" : "\nRESULTADO: todo OK");
