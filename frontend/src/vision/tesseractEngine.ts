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
    const worker: any = await createWorker("eng", 1, {
      logger: (m: any) => {
        if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
      },
    });
    try {
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789:/().-%+ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      });
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      return { words: extractWords(data), width: canvas.width, height: canvas.height };
    } finally {
      await worker.terminate();
    }
  },
};
