// Identificador Anestesico (IA)
// Formato: AA-NNNNNN-C  (ejemplo: 26-004531-K)
//  - AA: dos ultimos digitos del anio
//  - NNNNNN: ordinal anual (6 digitos, ceros a la izquierda)
//  - C: caracter de control (mod 23, estilo DNI) para detectar errores de transcripcion

// Tabla de 23 caracteres sin vocales para evitar confusiones al leer/escribir.
const CONTROL_TABLE = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Calcula el caracter de control a partir del bloque numerico AA + NNNNNN. */
export function computeControlChar(twoDigitYear: number, ordinal: number): string {
  const base = Number(`${pad2(twoDigitYear)}${pad6(ordinal)}`);
  const idx = base % 23;
  return CONTROL_TABLE[idx];
}

/** Construye el IA completo formateado. */
export function formatIA(twoDigitYear: number, ordinal: number): string {
  const control = computeControlChar(twoDigitYear, ordinal);
  return `${pad2(twoDigitYear)}-${pad6(ordinal)}-${control}`;
}

/** Genera el siguiente IA para un anio dado, a partir del ultimo ordinal usado. */
export function generateIA(now: Date, lastOrdinalThisYear: number): { ia: string; year: number; ordinal: number } {
  const twoDigitYear = now.getFullYear() % 100;
  const ordinal = lastOrdinalThisYear + 1;
  return { ia: formatIA(twoDigitYear, ordinal), year: now.getFullYear(), ordinal };
}

/** Valida el formato y el caracter de control de un IA. */
export function validateIA(ia: string): boolean {
  const m = /^(\d{2})-(\d{6})-([A-Z])$/.exec(ia.trim().toUpperCase());
  if (!m) return false;
  const year = Number(m[1]);
  const ordinal = Number(m[2]);
  const control = m[3];
  return computeControlChar(year, ordinal) === control;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function pad6(n: number): string {
  return String(n).padStart(6, "0");
}
