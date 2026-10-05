// Prepara los ficheros del motor de OCR en el móvil para servirlos desde NUESTRO backend
// (sin CDNs en tiempo de ejecución). Se ejecuta en prebuild/predev. Idempotente.
//   - Tesseract.js: worker + núcleo (wasm) + idioma (eng.traineddata.gz)
// La descarga ocurre al CONSTRUIR (el servidor de build sí tiene internet); en
// producción el usuario solo accede a nuestro origen.
//
// Nota: el motor de nube (Claude) no necesita ningún fichero local; corre en el backend.
import { mkdir, copyFile, readdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const OUT = path.join(root, "public", "ocr");
const NM = path.join(root, "node_modules");

const exists = async (p) => access(p, constants.F_OK).then(() => true).catch(() => false);

async function download(url, dest) {
  if (await exists(dest)) {
    console.log("  = ya existe", path.relative(root, dest));
    return;
  }
  await mkdir(path.dirname(dest), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`descarga falló ${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(dest, buf);
  console.log("  ↓", path.relative(root, dest), `(${Math.round(buf.length / 1024)} KB)`);
}

async function tesseract() {
  console.log("Tesseract.js:");
  const dir = path.join(OUT, "tesseract");
  await mkdir(path.join(dir, "lang"), { recursive: true });
  // worker
  await copyFile(path.join(NM, "tesseract.js/dist/worker.min.js"), path.join(dir, "worker.min.js"));
  // núcleo (todas las variantes: el navegador elige SIMD/relaxed según soporte)
  const coreDir = path.join(NM, "tesseract.js-core");
  for (const f of await readdir(coreDir)) {
    if (/^tesseract-core.*\.(wasm|js)$/.test(f)) await copyFile(path.join(coreDir, f), path.join(dir, f));
  }
  console.log("  = worker + núcleo copiados");
  // idioma (inglés: dígitos + latino). tessdata 4.0.0 compatible con tesseract.js 7.
  await download("https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz", path.join(dir, "lang", "eng.traineddata.gz"));
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await tesseract();
  console.log("Assets de OCR listos en public/ocr/");
}

main().catch((e) => {
  console.error("fetch-ocr-assets falló:", e);
  process.exit(1);
});
