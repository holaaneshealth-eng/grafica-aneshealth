// Lógica (pura) para volcar constantes leídas de una foto del monitor.
// No toca React ni la red: facilita las pruebas.
import type { CaseState, VitalsRecord } from "./events";
import { findParam } from "./monitoring";

export const KNOWN_CODES = ["FC", "TAS", "TAD", "TAM", "PAIS", "PAID", "PAIM", "SPO2", "ETCO2", "TEMP", "BIS", "VT", "FR", "PEEP", "FIO2", "PVC", "PPICO", "CAM"];

/** Parámetros que se ignoran al volcar (vengan del OCR o de Claude). */
export function isIgnoredParam(raw: string): boolean {
  const up = (raw ?? "").trim().toUpperCase();
  return up === "FP" || /ORIGEN/i.test(raw ?? "");
}
// Parámetros "fijados" por el anestesiólogo: se importan solo cuando cambian.
export const FIXED_CODES = ["VT", "FR", "PEEP", "FIO2"];

const SYNONYMS: Record<string, string> = {
  HR: "FC",
  PULSO: "FC",
  "SPO₂": "SPO2",
  SAT: "SPO2",
  SATO2: "SPO2",
  "ETCO₂": "ETCO2",
  CO2: "ETCO2",
  TEMPERATURA: "TEMP",
  "T°": "TEMP",
  Tª: "TEMP",
  T1: "TEMP",
  T2: "TEMP",
  "FIO₂": "FIO2",
  "FR.": "FR",
  CVP: "PVC",
  MAC: "CAM",
  PPEAK: "PPICO",
  PINSP: "PPICO",
  PICO: "PPICO",
};

const BUCKET_MS = 5 * 60 * 1000;

export interface VisionReading {
  hora: string; // "HH:MM" (en la TA, la hora de MEDICIÓN de la celda)
  parametro: string;
  valor: number | string; // número; o texto "124/55(74)" para la tensión arterial
  unidad?: string;
}

// Códigos que componen una tensión arterial (para avisos y detección).
export const BP_COMPONENT_CODES = ["TAS", "TAD", "TAM", "PAIS", "PAID", "PAIM"];
const BP_NONINV = /^(pani|pni|nibp|ta|nbp)\b/i; // no invasiva
const BP_INV = /^(pa|art|abp|ibp)\b/i; // invasiva/arterial

/** ¿La etiqueta es una tensión arterial compuesta (no un componente ya desglosado)? */
export function isBpParam(raw: string): boolean {
  const p = (raw ?? "").trim();
  return BP_NONINV.test(p) || BP_INV.test(p);
}

/** Desglosa "124/55(74)" (o "124/55 (74)", o "124/55") en sistólica, diastólica y media. */
export function parseBp(text: string): { sys: number; dia: number; mean?: number } | null {
  const m = /(\d{2,3})\s*\/\s*(\d{2,3})(?:\s*\(\s*(\d{2,3})\s*\))?/.exec(text ?? "");
  if (!m) return null;
  const sys = Number(m[1]);
  const dia = Number(m[2]);
  const mean = m[3] != null ? Number(m[3]) : undefined;
  if (!isFinite(sys) || !isFinite(dia)) return null;
  return mean != null && isFinite(mean) ? { sys, dia, mean } : { sys, dia };
}

interface NormReading {
  hora: string;
  parametro: string;
  valor: number;
  unidad?: string;
}

/**
 * Normaliza las lecturas de la foto antes de volcarlas:
 *  - La tensión arterial llega como texto ("124/55(74)") en una sola lectura con SU hora de
 *    medición; aquí se desglosa en TAS/TAD/TAM (o PAIS/PAID/PAIM si es invasiva), cada una con
 *    esa hora de medición. Se DEDUPLICA una misma medición (misma vía + misma hora) aunque
 *    Claude la repita en varias filas/columnas.
 *  - El resto de lecturas (numéricas) pasan tal cual; las no numéricas no-TA se descartan.
 */
export function normalizeReadings(readings: VisionReading[]): NormReading[] {
  const out: NormReading[] = [];
  const seenBp = new Set<string>();
  for (const r of readings) {
    if (isBpParam(r.parametro) && typeof r.valor !== "number") {
      const bp = parseBp(String(r.valor));
      if (!bp) continue;
      const inv = BP_INV.test(r.parametro);
      const key = `${inv ? "INV" : "NI"}|${r.hora}|${bp.sys}/${bp.dia}`;
      if (seenBp.has(key)) continue; // no duplicar la misma medición arrastrada
      seenBp.add(key);
      const [cS, cD, cM] = inv ? ["PAIS", "PAID", "PAIM"] : ["TAS", "TAD", "TAM"];
      out.push({ hora: r.hora, parametro: cS, valor: bp.sys, unidad: "mmHg" });
      out.push({ hora: r.hora, parametro: cD, valor: bp.dia, unidad: "mmHg" });
      if (bp.mean != null) out.push({ hora: r.hora, parametro: cM, valor: bp.mean, unidad: "mmHg" });
      continue;
    }
    const n = typeof r.valor === "number" ? r.valor : Number(String(r.valor).replace(",", "."));
    if (!isFinite(n)) continue;
    out.push({ hora: r.hora, parametro: r.parametro, valor: n, unidad: r.unidad });
  }
  return out;
}

/** ¿La foto traía tensión arterial (compuesta o ya desglosada)? Para el aviso de TA. */
export function readingsIncludeBp(readings: VisionReading[]): boolean {
  return readings.some((r) => isBpParam(r.parametro) || BP_COMPONENT_CODES.includes(normalizeCode(r.parametro).code));
}

export interface ReviewItem {
  id: string;
  code: string; // código normalizado (o etiqueta libre si desconocido)
  known: boolean;
  label: string;
  bucketMs: number; // inicio de la columna de 5 min
  timeLabel: string; // HH:MM de la columna
  value: number;
  unit?: string;
  manualValue?: number; // valor manual existente en esa constante+columna
  conflict: boolean;
  duplicatePhoto: boolean; // ya importado antes (origen foto) en esa constante+columna
  accept: boolean; // por defecto: conocido, sin duplicado y, si hay conflicto, NO (se conserva el manual)
}

export function normalizeCode(raw: string): { code: string; known: boolean } {
  const up = (raw ?? "").trim().toUpperCase();
  const mapped = SYNONYMS[up] ?? up;
  return { code: mapped, known: KNOWN_CODES.includes(mapped) };
}

/** HH:MM -> epoch usando la fecha (local) del caso, aplicando un desplazamiento en minutos. */
export function timeToEpoch(hora: string, caseIso: string, shiftMin = 0): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  const d = new Date(caseIso);
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
  return base + shiftMin * 60 * 1000;
}

export function bucketOf(epoch: number): number {
  return Math.floor(epoch / BUCKET_MS) * BUCKET_MS;
}

function hhmmLocal(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Índice de los valores ya existentes por código+columna, separando manual de foto. */
function existingIndex(vitals: VitalsRecord[]) {
  const manual = new Map<string, number>(); // key code|bucket -> value (manual/device)
  const photo = new Set<string>(); // key code|bucket con origen foto
  for (const v of vitals) {
    const b = bucketOf(new Date(v.at).getTime());
    for (const [code, val] of Object.entries(v.values)) {
      const key = `${code}|${b}`;
      if (v.source === "foto") photo.add(key);
      else manual.set(key, val);
    }
  }
  return { manual, photo };
}

/** Construye la tabla de revisión a partir de las lecturas de la foto. */
export function buildReview(readings: VisionReading[], cs: CaseState, shiftMin = 0): ReviewItem[] {
  const { manual, photo } = existingIndex(cs.vitals);
  const items: ReviewItem[] = [];
  // Desglosa la TA y normaliza a lecturas numéricas antes de construir la tabla.
  const norm = normalizeReadings(readings);
  norm.forEach((r, i) => {
    if (isIgnoredParam(r.parametro)) return; // FP / subtítulos no se vuelcan
    const epoch = timeToEpoch(r.hora, cs.createdAt, shiftMin);
    if (epoch == null) return;
    const bucketMs = bucketOf(epoch);
    const { code, known } = normalizeCode(r.parametro);
    const key = `${code}|${bucketMs}`;
    const manualValue = manual.get(key);
    const conflict = manualValue != null;
    const duplicatePhoto = photo.has(key);
    const param = known ? findParam(code, cs.monitoring.custom) : undefined;
    const label = param?.label ?? r.parametro;
    items.push({
      id: `r${i}`,
      code,
      known,
      label,
      bucketMs,
      timeLabel: hhmmLocal(bucketMs),
      value: r.valor,
      unit: r.unidad ?? param?.unit,
      manualValue,
      conflict,
      duplicatePhoto,
      accept: known && !duplicatePhoto && !conflict,
    });
  });
  return items.sort((a, b) => a.bucketMs - b.bucketMs || a.code.localeCompare(b.code));
}

export interface VitalsToWrite {
  at: string; // ISO del inicio de la columna
  values: Record<string, number>;
}

/**
 * Convierte los ítems aceptados en registros de constantes (uno por columna de 5 min).
 * Aplica a los parámetros fijados la regla "solo cuando cambia": se omite un valor fijado
 * si coincide con el anterior aceptado del mismo parámetro.
 */
export function buildVitalsToWrite(items: ReviewItem[]): VitalsToWrite[] {
  const accepted = items.filter((it) => it.accept && it.known);
  // Filtro de fijados: recorrer por código en orden temporal.
  const dropped = new Set<string>();
  for (const code of FIXED_CODES) {
    const seq = accepted.filter((it) => it.code === code).sort((a, b) => a.bucketMs - b.bucketMs);
    let prev: number | null = null;
    for (const it of seq) {
      if (prev !== null && it.value === prev) dropped.add(it.id);
      prev = it.value;
    }
  }
  const byBucket = new Map<number, Record<string, number>>();
  for (const it of accepted) {
    if (dropped.has(it.id)) continue;
    if (!byBucket.has(it.bucketMs)) byBucket.set(it.bucketMs, {});
    byBucket.get(it.bucketMs)![it.code] = it.value;
  }
  return Array.from(byBucket.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketMs, values]) => ({ at: new Date(bucketMs).toISOString(), values }));
}
