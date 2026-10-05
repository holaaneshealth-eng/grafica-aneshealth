import type { OcrEngine, OcrResult, OcrWord } from "./ocrTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractWords(data: any): OcrWord[] {
  const toW = (w: any): OcrWord => ({ text: String(w.text ?? ""), x0: w.bbox?.x0 ?? 0, y0: w.bbox?.y0 ?? 0, x1: w.bbox?.x1 ?? 0, y1: w.bbox?.y1 ?? 0 });
  if (Array.isArray(data?.words) && data.words.length) return data.words.map(toW);
  const out: OcrWord[] = [];
  for (const b of data?.blocks ?? [])
    for (const p of b.paragraphs ?? [])
      for (const l of p.lines ?? [])
        for (const w of l.words ?? []) out.push(toW(w));
  return out;
}

// Motor gratuito: Tesseract.js (WASM) en el propio navegador. No envía la foto a ningún servidor.
export const tesseractEngine: OcrEngine = {
  id: "tesseract",
  label: "Tesseract (gratuito, en el móvil)",
  async recognize(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<OcrResult> {
    const { createWorker } = await import("tesseract.js");
    // Todos los ficheros (worker, núcleo wasm e idioma) se sirven desde NUESTRO origen,
    // nunca de un CDN. Se descargan solo al elegir este motor (carga diferida).
    const base = `${import.meta.env.BASE_URL}ocr/tesseract`;
    // Tesseract.js, cuando el worker falla (p.ej. sin memoria en iOS o un fichero que no
    // carga), suele rechazar con un string o un evento, no con un Error. Eso hacía que la
    // app mostrara el mensaje genérico "No se pudo procesar la foto" sin pista alguna.
    // Convertimos SIEMPRE cualquier fallo en un Error con contexto para poder diagnosticar.
    let worker: any;
    try {
      worker = await createWorker("eng", 1, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: `${base}/lang`,
        logger: (m: any) => {
          if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
        },
      });
    } catch (e: any) {
      throw new Error(`Tesseract no pudo iniciar (worker/núcleo/idioma): ${e?.message ?? String(e)}`);
    }
    try {
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789:/().-%+ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      });
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      return { words: extractWords(data), width: canvas.width, height: canvas.height };
    } catch (e: any) {
      throw new Error(`Tesseract falló al leer la imagen: ${e?.message ?? String(e)}`);
    } finally {
      try {
        await worker.terminate();
      } catch {
        /* ignorar errores al cerrar el worker */
      }
    }
  },
};
