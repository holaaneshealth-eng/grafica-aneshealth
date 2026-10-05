// Interpreta la ESTRUCTURA de la pantalla de tendencias tabulares a partir de las
// palabras con caja (bbox) que devuelve el OCR, y coloca cada valor en su fila
// (parámetro) y columna (hora). Es una función PURA (testeable sin navegador).
import type { OcrWord } from "./ocrTypes";
import type { VisionReading } from "../domain/visionImport";

const TIME_RE = /^(\d{1,2})[:.;](\d{2})$/;
// Valor de tensión arterial: "125/70", "125/70(88)", "125 / 70 (88)".
const BP_RE = /(\d{2,3})\s*\/\s*(\d{2,3})(?:\s*\(?\s*(\d{2,3})\s*\)?)?/;
const NUM_RE = /^-?\d{1,3}(?:[.,]\d)?$/;

function cx(w: OcrWord): number {
  return (w.x0 + w.x1) / 2;
}
function cy(w: OcrWord): number {
  return (w.y0 + w.y1) / 2;
}

function normTime(t: string): string | null {
  const m = TIME_RE.exec(t.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Clasifica la etiqueta de fila (texto del OCR, ruidoso).
 * - "ignore": no se vuelca (FP duplica la FC; subtítulos "Origen: SpO2").
 * - "bp": tensión arterial (invasiva/no invasiva) -> TAS/TAD/TAM.
 * - "single": un único parámetro con su código.
 * Vocabulario orientado al Mindray ePM (etiquetas en español).
 */
export function classifyLabel(label: string): { kind: "bp" | "single" | "unknown" | "ignore"; code?: string } {
  const up = label.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!up) return { kind: "unknown" };
  if (up.includes("ORIGEN")) return { kind: "ignore" }; // subtítulo "Origen: SpO2"
  if (/^FP$/.test(up)) return { kind: "ignore" }; // frecuencia de pulso (duplica la FC)
  // Tensión arterial no invasiva (PANI/PNI/NIBP) e invasiva (PA/ART/ABP/IBP) -> s/d (media)
  if (/^(NIBP|PANI|PNI|PA|ABP|ART|ARTM|IBP|TA)$/.test(up)) return { kind: "bp" };
  const singles: [RegExp, string][] = [
    [/^(FC|HR)$/, "FC"],
    [/^(SPO2|SP02|SPÜ2|SAT|SATO2)$/, "SPO2"],
    [/^(ETCO2|ETC02)$/, "ETCO2"],
    [/^(FICO2|FIC02)$/, "FICO2"],
    [/^(FR|RESP|RR)$/, "FR"],
    [/^(PVC|CVP)$/, "PVC"],
    [/^BIS$/, "BIS"],
    [/^(VT|VTE|TIDAL)$/, "VT"],
    [/^PEEP$/, "PEEP"],
    [/^(FIO2|FI02)$/, "FIO2"],
    [/^(TEMP|TEMPC|T|TC|T1|T2|TEMP1|TEMP2)$/, "TEMP"],
  ];
  for (const [re, code] of singles) if (re.test(up)) return { kind: "single", code };
  return { kind: "unknown" };
}

interface Row {
  yc: number;
  words: OcrWord[];
}

/** Agrupa palabras en filas por proximidad vertical. */
function clusterRows(words: OcrWord[]): Row[] {
  const sorted = words.slice().sort((a, b) => cy(a) - cy(b));
  const heights = sorted.map((w) => w.y1 - w.y0).filter((h) => h > 0);
  const medH = heights.length ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 12;
  const tol = Math.max(6, medH * 0.7);
  const rows: Row[] = [];
  for (const w of sorted) {
    const r = rows.find((rr) => Math.abs(rr.yc - cy(w)) <= tol);
    if (r) {
      r.words.push(w);
      r.yc = (r.yc * (r.words.length - 1) + cy(w)) / r.words.length;
    } else {
      rows.push({ yc: cy(w), words: [w] });
    }
  }
  rows.forEach((r) => r.words.sort((a, b) => cx(a) - cx(b)));
  return rows;
}

export interface ParseResult {
  readings: VisionReading[];
  columns: number; // nº de columnas horarias detectadas
  rows: number; // nº de filas de parámetros detectadas
  detectedDate?: string; // fecha de la cabecera del monitor (YYYY-MM-DD) si se lee
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte las palabras OCR en lecturas {hora, parametro, valor}.
 * Detecta la fila de horas (más tokens de hora) y, para cada fila de datos,
 * asigna cada valor a la columna horaria más cercana en X.
 */
export function parseTrendTable(words: OcrWord[]): ParseResult {
  const rows = clusterRows(words.filter((w) => w.text.trim() !== ""));
  if (rows.length === 0) return { readings: [], columns: 0, rows: 0 };

  // Fila de horas = la que más tokens de hora tiene.
  let headerIdx = -1;
  let headerTimes: { x: number; hora: string }[] = [];
  rows.forEach((r, i) => {
    const times = r.words.map((w) => ({ x: cx(w), hora: normTime(w.text) })).filter((t) => t.hora) as { x: number; hora: string }[];
    if (times.length > headerTimes.length) {
      headerTimes = times;
      headerIdx = i;
    }
  });
  if (headerTimes.length < 2) return { readings: [], columns: headerTimes.length, rows: 0 };
  headerTimes.sort((a, b) => a.x - b.x);

  const nearestCol = (x: number) => {
    let best = 0;
    let bd = Infinity;
    headerTimes.forEach((t, i) => {
      const d = Math.abs(t.x - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  // Fecha de cabecera del monitor (si aparece), p. ej. "2026-10-05".
  let detectedDate: string | undefined;
  for (const w of words) {
    if (DATE_RE.test(w.text.trim())) {
      detectedDate = w.text.trim();
      break;
    }
  }

  const readings: VisionReading[] = [];
  let dataRows = 0;
  rows.forEach((r, i) => {
    if (i === headerIdx) return;
    // Etiqueta de la fila: tokens de texto no numéricos al inicio (zona izquierda).
    const firstColX = headerTimes[0].x;
    const labelWords = r.words.filter((w) => cx(w) < firstColX - 1 && !NUM_RE.test(w.text) && !TIME_RE.test(w.text) && !BP_RE.test(w.text));
    const label = labelWords.map((w) => w.text).join(" ").trim();
    if (!label) return;
    const cls = classifyLabel(label);
    if (cls.kind === "ignore") return; // FP y subtítulos "Origen: SpO2" no se vuelcan
    // Valores de la fila; se descartan la hora de medición (sello 07:39) y subtítulos.
    const valueWords = r.words.filter(
      (w) => cx(w) >= firstColX - 1 && !TIME_RE.test(w.text.trim()) && !/origen/i.test(w.text),
    );
    if (valueWords.length === 0) return;
    const cells = new Map<number, string[]>();
    for (const w of valueWords) {
      const col = nearestCol(cx(w));
      if (!cells.has(col)) cells.set(col, []);
      cells.get(col)!.push(w.text);
    }
    let used = false;
    for (const [col, parts] of cells) {
      const hora = headerTimes[col].hora;
      const raw = parts.join(" ").trim();
      if (cls.kind === "bp") {
        const m = BP_RE.exec(raw.replace(/\s+/g, ""));
        if (m) {
          readings.push({ hora, parametro: "TAS", valor: Number(m[1]) });
          readings.push({ hora, parametro: "TAD", valor: Number(m[2]) });
          if (m[3]) readings.push({ hora, parametro: "TAM", valor: Number(m[3]) });
          used = true;
        }
      } else {
        const nm = /-?\d{1,3}(?:[.,]\d)?/.exec(raw);
        if (nm) {
          readings.push({ hora, parametro: cls.kind === "single" ? cls.code! : label, valor: Number(nm[0].replace(",", ".")) });
          used = true;
        }
      }
    }
    if (used) dataRows++;
  });

  return { readings, columns: headerTimes.length, rows: dataRows, detectedDate };
}
