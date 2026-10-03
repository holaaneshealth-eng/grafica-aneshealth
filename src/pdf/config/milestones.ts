// Hitos clínicos: lista canónica (fuente única para la UI de hitos rápidos)
// y mapa etiqueta -> abreviatura para las líneas verticales de la gráfica.

export interface MilestoneDef {
  label: string; // etiqueta tal y como se guarda en el evento MILESTONE
  abbr: string; // abreviatura en la gráfica
}

// Orden clínico habitual. Añade FAN, SAL y PCR solicitados por el usuario.
export const MILESTONES: MilestoneDef[] = [
  { label: "Entrada en quirofano", abbr: "ENT" },
  { label: "Monitor conectado", abbr: "MON" },
  { label: "Preoxigenacion", abbr: "PREOX" },
  { label: "Induccion", abbr: "IAN" },
  { label: "Intubacion", abbr: "IOT" },
  { label: "Inicio cirugia", abbr: "INC" },
  { label: "Fin cirugia", abbr: "FIN" },
  { label: "Fin de anestesia", abbr: "FAN" },
  { label: "Salida de quirofano", abbr: "SAL" },
  { label: "Parada cardiorrespiratoria", abbr: "PCR" },
];

export const MILESTONE_LABELS: string[] = MILESTONES.map((m) => m.label);

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ABBR_BY_NORM = new Map(MILESTONES.map((m) => [norm(m.label), m.abbr]));

/** Devuelve la abreviatura del hito (insensible a acentos). Si no se conoce, genera una corta. */
export function milestoneAbbr(label: string): string {
  const found = ABBR_BY_NORM.get(norm(label));
  if (found) return found;
  // Fallback: primeras letras significativas en mayúsculas.
  return label
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

/** Leyenda de abreviaturas para el pie de página. */
export function milestoneLegend(usedLabels: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const l of usedLabels) {
    const a = milestoneAbbr(l);
    if (seen.has(a)) continue;
    seen.add(a);
    parts.push(`${a}=${l}`);
  }
  return parts.join("  ·  ");
}
