// Analgesia neuroaxial de parto: constantes, plantillas y utilidades.

export type CaseType = "quirofano" | "analgesia_parto";

// Soluciones de mantenimiento de la bomba (plantillas del protocolo, concentraciones editables).
export interface PumpSolutionTemplate {
  id: string;
  label: string;
  laName: string;
  laPct: number; // anestésico local en %
  opioidName: string;
  opioidUgMl: number; // opioide en µg/ml
}
export const PUMP_SOLUTIONS: PumpSolutionTemplate[] = [
  { id: "protocolo", label: "Protocolo: levobupivacaína 0,1 % + fentanilo 3 µg/ml", laName: "Levobupivacaína", laPct: 0.1, opioidName: "Fentanilo", opioidUgMl: 3 },
  { id: "alternativa", label: "Alternativa: ropivacaína 0,15 % + sufentanilo 0,75 µg/ml", laName: "Ropivacaína", laPct: 0.15, opioidName: "Sufentanilo", opioidUgMl: 0.75 },
];

export const PIEB_DEFAULT = { volMl: 10, intervalMin: 40 };
export const PCEA_DEFAULT = { bolusMl: 5, lockoutMin: 20, hourlyMaxMl: 25 };

// Recordatorios (minutos desde la dosis de carga). Valores por defecto; configurables por admin.
export const REMINDER_DEFAULT = { firstTestMin: 60, reevalMin: 100 };

// Escala de Bromage modificado (Breen) 1-6, con la descripción de cada grado.
export const BROMAGE_MOD = [
  { id: "1", label: "1 — Bloqueo motor completo de cadera, rodilla y tobillo" },
  { id: "2", label: "2 — Solo mueve los pies" },
  { id: "3", label: "3 — Apenas flexiona las rodillas" },
  { id: "4", label: "4 — Debilidad al flexionar la cadera en decúbito supino (flexión completa de rodillas)" },
  { id: "5", label: "5 — Sin debilidad al flexionar la cadera en decúbito supino" },
  { id: "6", label: "6 — Puede flexionar parcialmente las rodillas en bipedestación" },
];
export const bromageModLabel = (id?: string) => BROMAGE_MOD.find((b) => b.id === id)?.label ?? "";

// Dermatomas seleccionables para el nivel sensitivo (de T2 a S1), de cefálico a caudal.
export const DERMATOMES = ["T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "L1", "L2", "L3", "L4", "L5", "S1"];

/** Índice del dermatoma (para comparar lados). Mayor índice = más caudal. */
export function dermatomeIndex(d?: string): number {
  const i = DERMATOMES.indexOf((d ?? "").toUpperCase());
  return i < 0 ? NaN : i;
}
/** Bloqueo lateralizado si los dos lados difieren en más de dos dermatomas. */
export function isLateralized(left?: string, right?: string): boolean {
  const l = dermatomeIndex(left);
  const r = dermatomeIndex(right);
  if (isNaN(l) || isNaN(r)) return false;
  return Math.abs(l - r) > 2;
}

// Tipo de parto.
export const DELIVERY_TYPES = [
  { id: "eutocico", label: "Eutócico" },
  { id: "instrumental", label: "Instrumental" },
  { id: "cesarea", label: "Cesárea" },
];
export const INSTRUMENTAL_TYPES = [
  { id: "ventosa", label: "Ventosa" },
  { id: "forceps", label: "Fórceps" },
  { id: "espatulas", label: "Espátulas" },
];
export const deliveryLabel = (id?: string) => DELIVERY_TYPES.find((d) => d.id === id)?.label ?? "";
export const instrumentalLabel = (id?: string) => INSTRUMENTAL_TYPES.find((d) => d.id === id)?.label ?? "";

// Complicaciones (selección múltiple). `key` coincide con el campo en LaborComplications.
export const LABOR_COMPLICATIONS: { key: string; label: string }[] = [
  { key: "duralPuncture", label: "Punción dural accidental" },
  { key: "hypotension", label: "Hipotensión" },
  { key: "insufficient", label: "Analgesia insuficiente" },
  { key: "lateralized", label: "Bloqueo lateralizado" },
  { key: "catheterReplaced", label: "Recolocación del catéter" },
  { key: "motorBlock", label: "Bloqueo motor excesivo" },
  { key: "pruritus", label: "Prurito" },
  { key: "fever", label: "Fiebre" },
];
