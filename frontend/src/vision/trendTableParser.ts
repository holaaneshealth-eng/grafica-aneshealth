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

/** Clasifica la etiqueta de fila (texto del OCR, ruidoso) a código o "BP". */
export function classifyLabel(label: string): { kind: "bp" | "single" | "unknown"; code?: string } {
  const up = label.toUpperCase().replace(/\s+/g, "");
  if (/NIBP|PANI|PNI|ABP|\bART\b|ARTM|IBP|^TA$|^P?A$/.test(up) || /\bTA\b/.test(label.toUpperCase())) return { kind: "bp" };
  const map: { re: RegExp; code: string }[] = [
    { re: /^HR$|^FC$|PULS|HEARTRATE/, code: "FC" },
    { re: /SPO2|SPO₂|SAT|SPÜ2|SP02/, code: "SPO2" },
    { re: /ETCO2|ETCO₂|^CO2$|ETC02/, code: "ETCO2" },
    { re: /TEMP|^T$|^T°|^TEMP°?C?/, code: "TEMP" },
    { re: /BIS/, code: "BIS" },
    { re: /^VT$|VTE|TIDAL|VOLCORR|VC/, code: "VT" },
    { re: /^FR$|RESP|RR/, code: "FR" },
    { re: /PEEP/, code: "PEEP" },
    { re: /FIO2|FIO₂|FI02/, code: "FIO2" },
  ];
  for (const m of map) if (m.re.test(up)) return { kind: "single", code: m.code };
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
}

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
    // Acumula el texto de cada celda (columna) por si el valor viene en varios tokens.
    const valueWords = r.words.filter((w) => cx(w) >= firstColX - 1);
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

  return { readings, columns: headerTimes.length, rows: dataRows };
}
