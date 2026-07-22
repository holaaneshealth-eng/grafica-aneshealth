// Datos clínicos de apoyo (ORIENTATIVOS). Verificar siempre con las fuentes oficiales.

// ---- Redosificación intraoperatoria de antibióticos (profilaxis) ----
// Intervalo en minutos desde la última dosis. null = no requiere redosis intraoperatoria de rutina.
// Referencia: guías de profilaxis quirúrgica (ASHP/SEIMC). Ajustar por sangrado/función renal.
export const ANTIBIOTIC_REDOSE: { key: string; label: string; minutes: number | null }[] = [
  { key: "cefazolina", label: "Cefazolina", minutes: 240 },
  { key: "cefuroxima", label: "Cefuroxima", minutes: 240 },
  { key: "amoxicilina", label: "Amoxicilina-clavulánico", minutes: 120 },
  { key: "clindamicina", label: "Clindamicina", minutes: 360 },
  { key: "metronidazol", label: "Metronidazol", minutes: null },
  { key: "vancomicina", label: "Vancomicina", minutes: null },
  { key: "teicoplanina", label: "Teicoplanina", minutes: null },
  { key: "ciprofloxacino", label: "Ciprofloxacino", minutes: null },
];

export function matchAntibiotic(name: string): { label: string; minutes: number | null } | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return ANTIBIOTIC_REDOSE.find((a) => n.includes(a.key));
}

// ---- Dosis pediátrica orientativa (por kg) ----
export interface PedDose {
  perKg: number;
  unit: string; // mg | mcg
  max?: number; // dosis máxima (misma unidad)
  isMax?: boolean; // el valor perKg es una dosis MÁXIMA (p.ej. anestésicos locales)
  note?: string;
}

export const PED_DOSES: Record<string, PedDose> = {
  // Hipnóticos / sedantes
  Propofol: { perKg: 3, unit: "mg", note: "inducción 2,5–3,5 mg/kg" },
  Etomidato: { perKg: 0.3, unit: "mg" },
  Ketamina: { perKg: 2, unit: "mg", note: "IV 1–2 mg/kg" },
  Midazolam: { perKg: 0.1, unit: "mg", max: 5 },
  Dexmedetomidina: { perKg: 1, unit: "mcg", note: "carga 0,5–1 mcg/kg en 10 min" },
  // Opioides
  Fentanilo: { perKg: 2, unit: "mcg", note: "1–3 mcg/kg" },
  Morfina: { perKg: 0.1, unit: "mg" },
  Sufentanilo: { perKg: 0.3, unit: "mcg" },
  // Relajantes / reversores
  Rocuronio: { perKg: 0.6, unit: "mg", note: "ISR 1,2 mg/kg" },
  Cisatracurio: { perKg: 0.15, unit: "mg" },
  Succinilcolina: { perKg: 2, unit: "mg", note: "lactante 2 mg/kg; niño 1–1,5" },
  Sugammadex: { perKg: 2, unit: "mg", note: "bloqueo moderado 2; profundo 4 mg/kg" },
  Neostigmina: { perKg: 0.05, unit: "mg", max: 5 },
  Atropina: { perKg: 0.02, unit: "mg", note: "mín 0,1 mg" },
  // Vasoactivos / urgencia
  Adrenalina: { perKg: 10, unit: "mcg", note: "PCR 10 mcg/kg" },
  Efedrina: { perKg: 0.1, unit: "mg" },
  Fenilefrina: { perKg: 1, unit: "mcg" },
  // Analgésicos / antieméticos / corticoide
  Paracetamol: { perKg: 15, unit: "mg", max: 1000 },
  Dexametasona: { perKg: 0.15, unit: "mg", max: 8 },
  Ondansetrón: { perKg: 0.1, unit: "mg", max: 4 },
  // Electrolitos / hemostasia
  "Sulfato de magnesio": { perKg: 40, unit: "mg", note: "30–50 mg/kg" },
  "Ácido tranexámico": { perKg: 15, unit: "mg", note: "10–15 mg/kg" },
  // Antibióticos (profilaxis)
  Cefazolina: { perKg: 30, unit: "mg", max: 2000 },
  Cefuroxima: { perKg: 50, unit: "mg", max: 1500 },
  "Amoxicilina-clavulánico": { perKg: 30, unit: "mg" },
  Clindamicina: { perKg: 10, unit: "mg", max: 900 },
  Metronidazol: { perKg: 10, unit: "mg", max: 500 },
  Vancomicina: { perKg: 15, unit: "mg", max: 2000 },
  // Anestésicos locales (DOSIS MÁXIMAS de seguridad)
  Lidocaína: { perKg: 4, unit: "mg", isMax: true, note: "máx 4 mg/kg (7 con adrenalina)" },
  Bupivacaína: { perKg: 2, unit: "mg", isMax: true, note: "máx 2 mg/kg" },
  Ropivacaína: { perKg: 3, unit: "mg", isMax: true, note: "máx 3 mg/kg" },
};

// ---- Compatibilidad con lactancia (ORIENTATIVA; fuente autorizada: e-lactancia.org) ----
export type LactationLevel = "compatible" | "precaucion" | "evitar";
export const LACTATION: Record<string, { level: LactationLevel; note?: string }> = {
  Propofol: { level: "compatible" },
  Etomidato: { level: "compatible" },
  Ketamina: { level: "compatible" },
  Midazolam: { level: "compatible", note: "dosis única: riesgo muy bajo" },
  Dexmedetomidina: { level: "compatible" },
  Sevoflurano: { level: "compatible" },
  Fentanilo: { level: "compatible" },
  Remifentanilo: { level: "compatible" },
  Sufentanilo: { level: "compatible" },
  Morfina: { level: "compatible", note: "evitar dosis altas repetidas" },
  Rocuronio: { level: "compatible" },
  Cisatracurio: { level: "compatible" },
  Succinilcolina: { level: "compatible" },
  Sugammadex: { level: "compatible" },
  Dexametasona: { level: "compatible" },
  Ondansetrón: { level: "compatible" },
  Paracetamol: { level: "compatible" },
  Dexketoprofeno: { level: "compatible" },
  Metamizol: { level: "evitar", note: "riesgo de agranulocitosis; datos limitados" },
  Droperidol: { level: "precaucion", note: "datos limitados" },
  Lidocaína: { level: "compatible" },
  Bupivacaína: { level: "compatible" },
  Ropivacaína: { level: "compatible" },
  Cefazolina: { level: "compatible" },
  Cefuroxima: { level: "compatible" },
  Clindamicina: { level: "compatible" },
  Metronidazol: { level: "precaucion", note: "dosis única alta: considerar espaciar la toma" },
  Vancomicina: { level: "compatible" },
  Ciprofloxacino: { level: "compatible", note: "preferibles alternativas si uso prolongado" },
};

export function lactationFor(name: string): { level: LactationLevel; note?: string } | undefined {
  const n = name.trim().toLowerCase();
  const key = Object.keys(LACTATION).find((k) => k.toLowerCase() === n || n.includes(k.toLowerCase()));
  return key ? LACTATION[key] : undefined;
}

// ---- Pérdidas insensibles / evaporativas intraoperatorias ----
export const EXPOSURE_OPTIONS: { id: string; label: string; mlKgH: number }[] = [
  { id: "cerrada", label: "Cirugía cerrada / mínima exposición", mlKgH: 2 },
  { id: "moderada", label: "Exposición moderada", mlKgH: 4 },
  { id: "abierta", label: "Cirugía abierta / gran exposición", mlKgH: 6 },
  { id: "mayor", label: "Gran cavidad abierta (p. ej. laparotomía extensa)", mlKgH: 8 },
];

/** Estima las pérdidas insensibles: mlKgH * peso * horas, con recargo por fiebre (10%/°C > 37). */
export function insensibleLoss(weightKg: number, hours: number, mlKgH: number, tempC?: number): number {
  const feverFactor = tempC && tempC > 37 ? 1 + (tempC - 37) * 0.1 : 1;
  return Math.round(mlKgH * weightKg * hours * feverFactor);
}


// ---- Checklist quirúrgico de la OMS (3 fases) ----
export const WHO_PHASES: { phase: string; items: { key: string; label: string }[] }[] = [
  {
    phase: "Entrada · antes de la inducción",
    items: [
      { key: "in_identity", label: "Identidad, procedimiento y consentimiento confirmados" },
      { key: "in_site", label: "Sitio quirúrgico marcado (si procede)" },
      { key: "in_anesthesia", label: "Comprobación de anestesia y medicación completada" },
      { key: "in_pulseox", label: "Pulsioxímetro colocado y funcionando" },
      { key: "in_allergy", label: "Alergias conocidas revisadas" },
      { key: "in_airway", label: "Vía aérea difícil / riesgo de aspiración valorado" },
      { key: "in_bleeding", label: "Riesgo de hemorragia >500 ml (7 ml/kg niños) valorado" },
    ],
  },
  {
    phase: "Pausa quirúrgica · antes de la incisión",
    items: [
      { key: "to_team", label: "Presentación del equipo (nombre y función)" },
      { key: "to_confirm", label: "Confirmación verbal: paciente, sitio y procedimiento" },
      { key: "to_critical", label: "Previsión de eventos críticos (cirugía/anestesia/enfermería)" },
      { key: "to_antibiotic", label: "Profilaxis antibiótica en los últimos 60 min (si procede)" },
      { key: "to_imaging", label: "Imágenes esenciales visibles (si procede)" },
    ],
  },
  {
    phase: "Salida · antes de que el paciente salga del quirófano",
    items: [
      { key: "out_procedure", label: "Confirmación del procedimiento realizado" },
      { key: "out_count", label: "Recuento de instrumental, gasas y agujas correcto" },
      { key: "out_specimen", label: "Muestras etiquetadas correctamente" },
      { key: "out_equipment", label: "Problemas con el material identificados" },
      { key: "out_recovery", label: "Aspectos clave para la recuperación revisados" },
    ],
  },
];
