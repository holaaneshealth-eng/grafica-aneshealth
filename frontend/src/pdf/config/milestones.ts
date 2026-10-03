// Hitos clínicos: mapeo etiqueta (texto libre) -> abreviatura para la gráfica,
// y lista rápida para la UI. Compatible con los hitos ya existentes en main.

// Orden importante: "salida" antes que "entrada"; "parada" (PCR) al principio.
const MS_CODES: { match: RegExp; code: string }[] = [
  { match: /parada|pcr|cardiorresp/i, code: "PCR" },
  { match: /salida/i, code: "SAL" },
  { match: /entrada/i, code: "ENT" },
  { match: /inicio.*anest/i, code: "IAN" },
  { match: /fin.*anest/i, code: "FAN" },
  { match: /inicio.*cirug|incisi[oó]n/i, code: "INC" },
  { match: /fin.*cirug|cierre/i, code: "FIN" },
  { match: /monitor/i, code: "MON" },
  { match: /preox/i, code: "PRE" },
  { match: /inducc/i, code: "IND" },
  { match: /intub/i, code: "IOT" },
  { match: /mascarilla|lar[ií]ngea|lma/i, code: "LMA" },
  { match: /extub/i, code: "EXT" },
  { match: /despertar|educci[oó]n/i, code: "DES" },
  { match: /torniquete/i, code: "TQ" },
  { match: /clampaje|clamp/i, code: "CLP" },
];

export function milestoneCode(label: string): string {
  for (const c of MS_CODES) if (c.match.test(label)) return c.code;
  const code = label
    .replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return code || label.slice(0, 3).toUpperCase() || "H";
}

// Lista rápida de hitos para la UI (incluye PCR).
export const MILESTONE_QUICK = [
  "Entrada a quirófano",
  "Inicio de anestesia",
  "Inicio de cirugía",
  "Fin de anestesia",
  "Fin de cirugía",
  "Salida de quirófano",
  "Parada cardiorrespiratoria",
];

/** Leyenda código=etiqueta (sin duplicados) para el pie. */
export function milestoneLegend(labels: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const l of labels) {
    const c = milestoneCode(l);
    if (seen.has(c)) continue;
    seen.add(c);
    parts.push(`${c}=${l}`);
  }
  return parts.join("  ·  ");
}
