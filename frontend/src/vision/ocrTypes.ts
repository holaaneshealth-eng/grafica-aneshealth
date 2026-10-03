// Tipos comunes para los motores de OCR en el navegador.
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrResult {
  words: OcrWord[];
  width: number;
  height: number;
}

export type OcrEngineId = "tesseract" | "paddle" | "claude";

export interface OcrEngine {
  id: OcrEngineId;
  label: string;
  /** Reconoce texto con cajas. Recibe un canvas ya preprocesado. */
  recognize: (canvas: HTMLCanvasElement, onProgress?: (p: number) => void) => Promise<OcrResult>;
}
