// Algoritmos de calculo automatico para perfusiones.
// Se conservan SIEMPRE las dos representaciones: ritmo (ml/h) y dosis ponderada.

export type MassUnit = "mg" | "mcg";
export type DoseRateUnit = "mcg/kg/min" | "mcg/kg/h" | "mg/kg/h" | "mg/kg/min";

export interface InfusionInput {
  amount: number; // cantidad de principio activo
  amountUnit: MassUnit; // unidad del principio activo (mg o mcg)
  diluentVolumeMl: number; // volumen del disolvente (ml)
  rateMlH: number; // ritmo (ml/h)
  weightKg: number; // peso del paciente
  doseUnit: DoseRateUnit; // en que unidad expresar la dosis ponderada
}

export interface InfusionResult {
  concentration: number; // valor de concentracion final
  concentrationUnit: string; // p.ej. "mcg/ml" o "mg/ml"
  weightBasedDose: number; // dosis ponderada calculada
  doseUnit: DoseRateUnit;
  summary: string; // representacion doble, p.ej. "12 ml/h / 0,08 mcg/kg/min"
}

const MCG_PER_MG = 1000;

/** Concentracion final = cantidad / volumen. Devuelve el valor en la unidad de entrada. */
export function concentration(amount: number, diluentVolumeMl: number): number {
  if (diluentVolumeMl <= 0) return 0;
  return amount / diluentVolumeMl;
}

/** Convierte una masa a microgramos. */
export function toMcg(amount: number, unit: MassUnit): number {
  return unit === "mg" ? amount * MCG_PER_MG : amount;
}

/**
 * Calcula la dosis ponderada a partir del ritmo (ml/h).
 * dosis = (ritmo_ml_h * concentracion) / peso  [ / 60 si es por minuto]
 */
export function computeInfusion(input: InfusionInput): InfusionResult {
  const { amount, amountUnit, diluentVolumeMl, rateMlH, weightKg, doseUnit } = input;
  const concInInputUnit = concentration(amount, diluentVolumeMl); // en amountUnit por ml
  const concUnit = `${amountUnit}/ml`;

  // Masa administrada por hora (en la unidad destino de la dosis)
  const wantsMcg = doseUnit.startsWith("mcg");
  const totalMcgPerMl = toMcg(concInInputUnit, amountUnit);
  const massPerMlInDoseUnit = wantsMcg ? totalMcgPerMl : totalMcgPerMl / MCG_PER_MG;

  const perMinute = doseUnit.endsWith("/min");
  let dose = (rateMlH * massPerMlInDoseUnit) / weightKg; // por hora
  if (perMinute) dose = dose / 60;

  return {
    concentration: round(concInInputUnit, 4),
    concentrationUnit: concUnit,
    weightBasedDose: round(dose, 4),
    doseUnit,
    summary: `${formatNum(rateMlH)} ml/h / ${formatNum(round(dose, 4))} ${doseUnit}`,
  };
}

/**
 * Calculo inverso: a partir de una dosis objetivo obtiene el ritmo (ml/h) necesario.
 * ritmo = (dosisObjetivo * peso) / concentracion  [ * 60 si la dosis es por minuto]
 */
export function rateFromDose(
  targetDose: number,
  doseUnit: DoseRateUnit,
  amount: number,
  amountUnit: MassUnit,
  diluentVolumeMl: number,
  weightKg: number,
): number {
  const concInInputUnit = concentration(amount, diluentVolumeMl);
  const wantsMcg = doseUnit.startsWith("mcg");
  const totalMcgPerMl = toMcg(concInInputUnit, amountUnit);
  const massPerMlInDoseUnit = wantsMcg ? totalMcgPerMl : totalMcgPerMl / MCG_PER_MG;
  if (massPerMlInDoseUnit <= 0) return 0;

  const perMinute = doseUnit.endsWith("/min");
  const massPerHour = perMinute ? targetDose * weightKg * 60 : targetDose * weightKg;
  return round(massPerHour / massPerMlInDoseUnit, 2);
}

export function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Formato numerico con coma decimal (es-ES) sin ceros sobrantes. */
export function formatNum(n: number): string {
  if (!isFinite(n)) return "-";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 }).format(n);
}
