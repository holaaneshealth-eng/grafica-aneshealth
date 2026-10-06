// Modelo normalizado de la gráfica anestésica. Tiempos en epoch ms.
// Independiente de CaseState para poder construirlo y testearlo fuera del navegador.

export interface ChartMilestone {
  at: number;
  abbr: string;
  label: string;
}

export interface MeasuredPoint {
  at: number;
  value: number;
  outOfRange: boolean;
}
export interface MeasuredRow {
  kind: "measured";
  code: string;
  label: string; // incluye unidad
  points: MeasuredPoint[];
}

export interface FixedPoint {
  at: number;
  value: number | string;
}
export interface FixedRow {
  kind: "fixed";
  code: string;
  label: string;
  points: FixedPoint[];
}

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
  ta: TaSample[]; // tensión arterial NO invasiva (PANI)
  ibp: TaSample[]; // tensión arterial INVASIVA (PA/ART) — marcador distinto
  fc: FcSample[];
}

export interface DrugBolus {
  at: number;
  dose: number;
  unit: string;
}
export interface DrugInfusionSegment {
  from: number;
  to: number | null;
  label: string; // "12 ml/h" | "Ce 3,0 µg/ml (Eleveld)" | "2 %"
}
export interface DrugRow {
  name: string;
  unit: string;
  boluses: DrugBolus[];
  infusions: DrugInfusionSegment[];
  total: { text: string } | null;
}

export interface FluidInputEntry {
  at: number;
  volumeMl: number;
  text?: string; // etiqueta libre (p. ej. hemoderivados: "2 UCH")
}
export interface FluidInputRow {
  kind: "input";
  label: string;
  entries: FluidInputEntry[];
  total: { text: string } | null;
}
export interface FluidOutputPoint {
  at: number;
  volumeMl: number;
}
export interface FluidOutputRow {
  kind: "output";
  label: string; // "Sangrado" | "Diuresis"
  points: FluidOutputPoint[]; // marcadores puntuales (cantidad desde el último registro)
  total: { text: string } | null;
}

// Foto del monitor (Vía 1) ya comprimida, para incrustarla en las páginas de gráfica.
export interface ChartPhoto {
  at: number; // hora de la foto (epoch ms)
  dataUrl: string; // data:image/jpeg;base64,...
  w: number; // dimensiones en px (para mantener la proporción)
  h: number;
}

export interface ChartModel {
  sheetNo: string; // nº de hoja anestésica (IA)
  date: string;
  startAt: number;
  endAt: number;
  hemo: HemoBand;
  measuredRows: MeasuredRow[];
  fixedRows: FixedRow[];
  drugRows: DrugRow[];
  fluidInputs: FluidInputRow[];
  fluidOutputs: FluidOutputRow[];
  milestones: ChartMilestone[];
  // Vía 1: en las páginas de gráfica, la banda hemodinámica y las filas del monitor se
  // sustituyen por las fotos de cada franja. Las filas del respirador/fármacos/líquidos
  // y las líneas de hitos se mantienen.
  via1: boolean;
  photos: ChartPhoto[];
}
