// Modelo orientado a eventos (event sourcing).
// La hoja anestésica se reconstruye a partir de esta secuencia inmutable.
import type { MonitoringParam } from "./monitoring";

export type Phase = "PREOP" | "OR" | "CLOSED";

export type EventType =
  | "CASE_CREATED"
  | "PREOP_INFO_RECORDED"
  | "PHASE_COMPLETED"
  | "SAFETY_CHECK_SET"
  | "WHO_CHECK_SET"
  | "MONITORING_SELECTED"
  | "MONITORING_TOGGLED"
  | "MONITORING_CUSTOM_ADDED"
  | "MONITORING_CUSTOM_REMOVED"
  | "TECHNIQUE_ADDED"
  | "DRUG_BOLUS"
  | "INFUSION_STARTED"
  | "INFUSION_RATE_CHANGED"
  | "INFUSION_STOPPED"
  | "VITALS_RECORDED"
  | "VITALS_UPDATED"
  | "VITALS_REMOVED"
  | "WEIGHT_UPDATED"
  | "VENT_MODE_SET"
  | "MILESTONE"
  | "MILESTONE_TIME_CHANGED"
  | "MILESTONE_REMOVED"
  | "INCIDENT"
  | "INCIDENT_REMOVED"
  | "BLOOD_PRODUCT"
  | "BLOOD_PRODUCT_REMOVED"
  | "LAB_RESULT"
  | "LAB_REMOVED"
  | "BALANCE"
  | "BALANCE_REMOVED"
  | "BOLUS_UPDATED"
  | "BOLUS_REMOVED"
  | "INFUSION_REMOVED"
  | "SURGERY_ENDED"
  | "CASE_REOPENED"
  | "CASE_SIGNED"
  | "SHEET_EMAILED"
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
  breastfeeding: boolean | null; // lactancia materna activa
  asa: string | null; // clasificación ASA "I".."VI"
  asaEmergency: boolean; // modificador "E" (urgencia)
}

// Checklist quirúrgico de la OMS: mapa item -> marcado.
export type WhoChecklist = Record<string, boolean>;

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
  concentration?: number; // % (anestésicos locales neuroaxiales)
  volumeMl?: number; // ml administrados (anestésicos locales neuroaxiales)
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
  fluid?: boolean; // suero IV (500 ml; ritmo medio al finalizar)
  volumeMl?: number; // volumen cargado (sueros)
  tci?: "plasma" | "efecto"; // perfusión en modo TCI (objetivo plasmático/efecto); el objetivo se guarda en rateMlH
  tciUnit?: string; // unidad del objetivo TCI (p. ej. µg/ml o ng/ml)
  tciModel?: string; // modelo farmacocinético (Marsh/Schnider/Eleveld/Minto/Dyck/Hannivoort)
  totalInfused?: number; // total infundido según la bomba al finalizar (TCI)
  totalInfusedUnit?: string; // unidad del total infundido (mg | µg | ml)
  changes?: InfusionChange[]; // historial de ritmos (incluye el inicial)
}

export interface VentModeRecord {
  id: string;
  at: string;
  mode: string; // VC, PC, PRVC, SIMV, Presión soporte, Espontánea
}

export interface EmailSendRecord {
  at: string;
  to: string;
  subject: string;
  version: number; // versión de la firma enviada (1, 2, ...)
  ok: boolean; // resultado del envío
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
  source: "manual" | "device" | "foto"; // "foto" = importado desde foto del monitor
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
  dose: string; // campo libre: p.ej. "2 unidades de concentrados de hematíes", "500 ml de PFC"
  adverseReaction: boolean | null;
  registryNumber: string;
}

export interface LabRecord {
  id: string;
  at: string;
  values: Record<string, number>;
  notes: string;
}

export interface BalanceRecord {
  id: string;
  at: string;
  bleedingMl?: number; // sangrado
  diuresisMl?: number; // diuresis
  insensibleMl?: number; // pérdidas insensibles estimadas
  insensibleNote?: string; // detalle del cálculo (exposición, Tª, tiempo)
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
  who: WhoChecklist;
  monitoring: MonitoringSelection;
  techniques: TechniqueRecord[];
  boluses: BolusRecord[];
  infusions: InfusionRecord[];
  vitals: VitalsRecord[];
  ventModes: VentModeRecord[];
  emailSends: EmailSendRecord[];
  incidents: IncidentRecord[];
  milestones: MilestoneRecord[];
  bloodProducts: BloodProductRecord[];
  labs: LabRecord[];
  balances: BalanceRecord[];
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
    preop: { allergies: "", heightCm: null, weightKg: null, history: "", medication: "", antibiotic: "", antibioticTime: null, breastfeeding: null, asa: null, asaEmergency: false },
    safety: { monitorChecked: null, ventilatorChecked: null, suctionReady: null, ambuReady: null },
    who: {},
    monitoring: { standard: [], custom: [] },
    techniques: [],
    boluses: [],
    infusions: [],
    vitals: [],
    ventModes: [],
    emailSends: [],
    incidents: [],
    milestones: [],
    bloodProducts: [],
    labs: [],
    balances: [],
    endedAt: null,
    signedAt: null,
    signedBy: null,
  };
}
