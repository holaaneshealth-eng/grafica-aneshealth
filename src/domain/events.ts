// Modelo orientado a eventos (event sourcing).
// La hoja anestesica se reconstruye a partir de esta secuencia inmutable.
import type { MonitoringParam } from "./monitoring";

export type Phase = "PREOP" | "OR" | "CLOSED";

export type EventType =
  | "CASE_CREATED"
  | "PREOP_INFO_RECORDED"
  | "PHASE_COMPLETED"
  | "SAFETY_CHECK_SET"
  | "MONITORING_SELECTED"
  | "TECHNIQUE_ADDED"
  | "DRUG_BOLUS"
  | "INFUSION_STARTED"
  | "INFUSION_RATE_CHANGED"
  | "INFUSION_STOPPED"
  | "VITALS_RECORDED"
  | "WEIGHT_UPDATED"
  | "VENT_MODE_SET"
  | "FLUID_IN"
  | "FLUID_OUT"
  | "MILESTONE"
  | "INCIDENT"
  | "SURGERY_ENDED"
  | "CASE_SIGNED"
  | "EVENT_VOIDED";

export interface BaseEvent {
  eventId: string;
  caseId: string;
  type: EventType;
  occurredAt: string; // ISO - hora clinica real
  recordedAt: string; // ISO - hora de registro
  actor: string;
  payload: Record<string, unknown>;
  correctsEventId?: string | null;
}

export interface PreopInfo {
  allergies: string;
  heightCm: number | null;
  weightKg: number | null;
  history: string;
  medication: string;
  asa: string | null; // "I".."VI"
  asaEmergency: boolean; // modificador "E" (urgencia)
}

export interface SafetyChecklist {
  monitorChecked: boolean | null;
  ventilatorChecked: boolean | null;
  suctionReady: boolean | null;
  ambuReady: boolean | null;
}

export interface MonitoringSelection {
  standard: string[]; // codigos
  custom: MonitoringParam[];
}

export interface TechniqueRecord {
  id: string; // instancia
  type: string; // id de tecnica
  label: string;
  details: Record<string, string | boolean | number>;
  at: string;
}

export interface BolusRecord {
  id: string;
  drug: string;
  dose: number;
  unit: string;
  at: string;
}

export interface InfusionRecord {
  id: string;
  drug: string;
  amount: number;
  amountUnit: string;
  diluentVolumeMl: number;
  concentration: number;
  concentrationUnit: string;
  rateMlH: number;
  weightBasedDose: number;
  doseUnit: string;
  summary: string;
  startedAt: string;
  stoppedAt?: string | null;
  active: boolean;
  // Perfusión controlada por objetivo (TCI). Opcional.
  tci?: boolean;
  targetType?: "Cp" | "Ce"; // concentración plasmática o en sitio efecto
  targetConc?: number;
  targetUnit?: string; // "µg/ml" (propofol) | "ng/ml" (remi, dexmed)
  tciModel?: string; // Marsh/Schnider/Eleveld/Minto/Dyck/Hannivoort
}

export interface VentModeRecord {
  id: string;
  at: string;
  mode: string; // VC, PC, PRVC, SIMV, Presion soporte, Espontanea
}

export interface FluidInputRecord {
  id: string;
  at: string;
  category: "cristaloide" | "coloide" | "sangre" | "hemoderivado";
  label: string; // p. ej. "Ringer lactato", "Concentrado de hematíes"
  volumeMl: number;
}

export interface FluidOutputRecord {
  id: string;
  from: string;
  to: string;
  category: "sangrado" | "diuresis";
  volumeMl: number;
}

export interface VitalsRecord {
  id: string;
  at: string;
  values: Record<string, number>;
  source: "manual" | "device" | "photo"; // "photo" = importado desde foto del monitor (Fase 3)
}

export interface IncidentRecord {
  id: string;
  at: string;
  text: string;
  severity?: "leve" | "moderada" | "grave";
}

export interface MilestoneRecord {
  id: string;
  at: string;
  label: string;
}

// Estado proyectado (vista materializada) de un caso.
export interface CaseState {
  caseId: string;
  ia: string;
  year: number;
  ordinal: number;
  createdAt: string;
  phase: Phase;
  preop: PreopInfo;
  safety: SafetyChecklist;
  monitoring: MonitoringSelection;
  techniques: TechniqueRecord[];
  boluses: BolusRecord[];
  infusions: InfusionRecord[];
  vitals: VitalsRecord[];
  ventModes: VentModeRecord[];
  fluidInputs: FluidInputRecord[];
  fluidOutputs: FluidOutputRecord[];
  incidents: IncidentRecord[];
  milestones: MilestoneRecord[];
  endedAt?: string | null;
  signedAt?: string | null;
  signedBy?: string | null;
}

export function emptyCaseState(caseId: string, ia: string, year: number, ordinal: number, createdAt: string): CaseState {
  return {
    caseId,
    ia,
    year,
    ordinal,
    createdAt,
    phase: "PREOP",
    preop: { allergies: "", heightCm: null, weightKg: null, history: "", medication: "", asa: null, asaEmergency: false },
    safety: { monitorChecked: null, ventilatorChecked: null, suctionReady: null, ambuReady: null },
    monitoring: { standard: [], custom: [] },
    techniques: [],
    boluses: [],
    infusions: [],
    vitals: [],
    ventModes: [],
    fluidInputs: [],
    fluidOutputs: [],
    incidents: [],
    milestones: [],
    endedAt: null,
    signedAt: null,
    signedBy: null,
  };
}
