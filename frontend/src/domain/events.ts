// Modelo orientado a eventos (event sourcing).
// La hoja anestésica se reconstruye a partir de esta secuencia inmutable.
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
  | "MILESTONE"
  | "INCIDENT"
  | "BLOOD_PRODUCT"
  | "LAB_RESULT"
  | "SURGERY_ENDED"
  | "CASE_REOPENED"
  | "CASE_SIGNED"
  | "EVENT_VOIDED";

export interface BaseEvent {
  eventId: string;
  caseId: string;
  type: EventType;
  occurredAt: string; // ISO - hora clínica real
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
  antibiotic: string;
  antibioticTime: string | null; // ISO
}

export interface SafetyChecklist {
  monitorChecked: boolean | null;
  ventilatorChecked: boolean | null;
  suctionReady: boolean | null;
  ambuReady: boolean | null;
}

export interface MonitoringSelection {
  standard: string[]; // códigos
  custom: MonitoringParam[];
}

export interface TechniqueRecord {
  id: string; // instancia
  type: string; // id de técnica
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
  gas?: boolean; // sevoflurano
  gasPercent?: number; // % en aire espirado
  changes?: InfusionChange[]; // historial de ritmos (incluye el inicial)
}

export interface InfusionChange {
  at: string;
  rateMlH: number;
  weightBasedDose: number;
  doseUnit: string;
  summary: string;
  gasPercent?: number;
  stop?: boolean;
}

export interface VitalsRecord {
  id: string;
  at: string;
  values: Record<string, number>;
  source: "manual" | "device";
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

export interface BloodProductRecord {
  id: string;
  at: string;
  product: string;
  adverseReaction: boolean | null;
  registryNumber: string;
}

export interface LabRecord {
  id: string;
  at: string;
  values: Record<string, number>;
  notes: string;
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
  incidents: IncidentRecord[];
  milestones: MilestoneRecord[];
  bloodProducts: BloodProductRecord[];
  labs: LabRecord[];
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
    preop: { allergies: "", heightCm: null, weightKg: null, history: "", medication: "", antibiotic: "", antibioticTime: null },
    safety: { monitorChecked: null, ventilatorChecked: null, suctionReady: null, ambuReady: null },
    monitoring: { standard: [], custom: [] },
    techniques: [],
    boluses: [],
    infusions: [],
    vitals: [],
    incidents: [],
    milestones: [],
    bloodProducts: [],
    labs: [],
    endedAt: null,
    signedAt: null,
    signedBy: null,
  };
}
