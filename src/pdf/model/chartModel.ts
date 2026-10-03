// Modelo normalizado de la gráfica anestésica. Tiempos en epoch ms.
// Es independiente de CaseState para poder construirlo y testearlo fuera del navegador.

export interface ChartMilestone {
  at: number;
  abbr: string;
  label: string;
}

// Banda 2 - valores MEDIDOS (se muestran en cada columna con lectura, aunque se repitan)
export interface MeasuredPoint {
  at: number;
  value: number;
  outOfRange: boolean;
}
export interface MeasuredRow {
  kind: "measured";
  code: string;
  label: string; // incluye unidad, p. ej. "EtCO2 (mmHg)"
  points: MeasuredPoint[];
}

// Banda 2 - parámetros FIJADOS (cifra al inicio y en cada cambio)
export interface FixedPoint {
  at: number;
  value: number | string;
}
export interface FixedRow {
  kind: "fixed";
  code: string;
  label: string;
  points: FixedPoint[]; // solo cambios (incluye el valor inicial)
}

// Banda 1 - hemodinámica
export interface TaSample {
  at: number;
  sys?: number;
  dia?: number;
  map?: number;
}
export interface FcSample {
  at: number;
  fc: number;
}
export interface HemoBand {
  ta: TaSample[];
  fc: FcSample[];
}

// Banda 3 - fármacos
export interface DrugBolus {
  at: number;
  dose: number;
  unit: string;
}
export interface DrugInfusionSegment {
  from: number;
  to: number | null; // null = sigue activa al final
  label: string; // texto sobre la barra: "12 ml/h" o "Ce 3,0 µg/ml (Eleveld)"
}
export interface DrugRow {
  name: string;
  unit: string; // unidad primaria de la fila (va en la etiqueta)
  boluses: DrugBolus[];
  infusions: DrugInfusionSegment[];
  total: { text: string } | null; // dosis/volumen acumulado + unidad (solo última página)
}

// Banda 4 - líquidos y balance
export interface FluidInputEntry {
  at: number;
  volumeMl: number;
}
export interface FluidInputRow {
  kind: "input";
  label: string; // p. ej. "Ringer lactato"
  entries: FluidInputEntry[];
  total: { text: string } | null;
}
export interface FluidOutputInterval {
  from: number;
  to: number;
  volumeMl: number;
}
export interface FluidOutputRow {
  kind: "output";
  label: string; // "Sangrado" | "Diuresis"
  intervals: FluidOutputInterval[];
  total: { text: string } | null;
}

export interface ChartModel {
  sheetNo: string; // nº de hoja anestésica (IA)
  patientId: string; // identificador del paciente (IA, pseudonimizado)
  date: string; // fecha legible
  startAt: number; // inicio del eje (cuarto de hora previo a ENT)
  endAt: number; // fin del último dato relevante
  hemo: HemoBand;
  measuredRows: MeasuredRow[];
  fixedRows: FixedRow[];
  drugRows: DrugRow[];
  fluidInputs: FluidInputRow[];
  fluidOutputs: FluidOutputRow[];
  milestones: ChartMilestone[];
}
