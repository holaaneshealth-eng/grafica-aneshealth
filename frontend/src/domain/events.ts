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
  | "MONITOR_MODE_SET"
  | "MONITOR_PHOTO_ADDED"
  | "MONITOR_PHOTO_REMOVED"
  | "MILESTONE"
  | "MILESTONE_TIME_CHANGED"
  | "MILESTONE_REMOVED"
  | "POSITION_SET"
  | "POSITION_REMOVED"
  | "PROTECTION_SET"
  | "ANESTHESIA_END_STATE_SET"
  | "LABOR_TEST_DOSE"
  | "LABOR_LOADING_DOSE"
  | "PUMP_PROGRAM_SET"
  | "PUMP_READING"
  | "LABOR_RESCUE_BOLUS"
  | "LABOR_ASSESSMENT"
  | "AMBULATION_TEST"
  | "LABOR_DELIVERY"
  | "CATHETER_REMOVED"
  | "LABOR_COMPLICATIONS_SET"
  | "CONVERT_TO_CESAREAN"
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
  route?: string; // vía de administración (IV, intradural, epidural, perineural...)
  concentration?: number; // % (anestésicos locales neuroaxiales)
  volumeMl?: number; // ml administrados (anestésicos locales neuroaxiales)
  adrenaline?: boolean; // anestésico local administrado con vasoconstrictor (dosis máxima mayor)
}

export interface InfusionRecord {
  id: string;
  drug: string;
  route?: string; // vía de administración (IV por defecto; perineural, epidural...)
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
  adrenaline?: boolean; // anestésico local (p. ej. lidocaína IV) con vasoconstrictor
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

// Vía de registro del monitor elegida para el caso.
//  1 = foto SIN análisis (se guarda la imagen y va al PDF).
//  2 = foto analizada con Claude (los valores pasan a la tabla y a la gráfica).
export type MonitorVia = 1 | 2;

// Metadatos de una foto del monitor guardada (Vía 1). Los bytes viven en el backend
// (tabla case_photos); aquí solo el índice ligero para la proyección y el orden.
export interface MonitorPhotoRecord {
  id: string;
  at: string; // hora clínica de la foto
  mime: string;
  byteSize: number; // tamaño del JPEG comprimido (para mostrarlo junto a la hora)
  analyzed?: boolean; // si ya se analizó con Claude al cambiar a Vía 2
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

// Posición quirúrgica con su hora (cada cambio es un registro nuevo).
export interface PositionRecord {
  id: string;
  at: string;
  position: string; // id de POSITIONS (supino, prono, ...)
  label: string; // etiqueta mostrada (para "otra", el texto libre)
  note?: string;
}

// Medidas de protección del paciente (selección múltiple; último registro gana).
export interface ProtectionInfo {
  ocular?: boolean;
  padding?: boolean;
  armsAbduction?: boolean;
  activeWarming?: boolean;
  fluidWarmer?: boolean;
  pneumaticCompression?: boolean;
  cauteryPad?: boolean;
  other?: string;
}

// Estado del paciente al finalizar la anestesia (último registro gana).
export interface EndStateInfo {
  consciousness?: string;
  airway?: string;
  spontaneousVentilation?: boolean;
  oxygen?: string;
  tas?: number;
  tad?: number;
  fc?: number;
  spo2?: number;
  temp?: number;
  tofOk?: string; // "si" | "no" | "no_monitorizado"
  evn?: number;
  nausea?: boolean;
  bromage?: string; // "0".."3"
  destination?: string;
  notes?: string;
  at?: string; // hora de registro
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

// ---- Analgesia neuroaxial de parto ----
export interface NeuraxialDose {
  at: string;
  drug: string;
  concentration: number; // %
  volumeMl: number;
  doseMg: number;
  note?: string;
}
export interface PumpProgram {
  id: string;
  at: string;
  laName: string;
  laPct: number; // anestésico local %
  opioidName?: string;
  opioidUgMl?: number; // opioide µg/ml
  piebVolMl: number;
  piebIntervalMin: number;
  pceaBolusMl: number;
  pceaLockoutMin: number;
  pceaHourlyMaxMl?: number;
}
export interface PumpReading {
  id: string;
  at: string;
  totalMl: number;
  pceaRequested?: number;
  pceaGiven?: number;
}
export interface LaborRescue {
  id: string;
  at: string;
  drug: string;
  concentration: number; // %
  volumeMl: number;
  doseMg: number;
  note?: string;
}
export interface LaborAssessment {
  id: string;
  at: string;
  evn?: number;
  sensLeft?: string; // dermatoma lado izquierdo
  sensRight?: string; // dermatoma lado derecho
  bromage?: string; // Bromage modificado 1-6
  tas?: number;
  tad?: number;
  fc?: number;
}
export interface AmbulationTest {
  id: string;
  at: string;
  bromage6?: boolean;
  toeTest?: boolean;
  romberg?: boolean;
  authorized?: boolean;
}
export interface DeliveryInfo {
  at: string;
  type: string; // eutocico | instrumental | cesarea
  instrumental?: string; // ventosa | forceps | espatulas
}
export interface CatheterInfo {
  at: string;
  intact?: boolean;
}
export interface LaborComplications {
  duralPuncture?: boolean;
  hypotension?: boolean;
  insufficient?: boolean;
  lateralized?: boolean;
  catheterReplaced?: boolean;
  motorBlock?: boolean;
  pruritus?: boolean;
  fever?: boolean;
  other?: string;
}
export interface LaborData {
  testDose: NeuraxialDose | null;
  loadingDose: NeuraxialDose | null;
  pumpPrograms: PumpProgram[];
  readings: PumpReading[];
  rescues: LaborRescue[];
  assessments: LaborAssessment[];
  ambulationTests: AmbulationTest[];
  delivery: DeliveryInfo | null;
  catheter: CatheterInfo | null;
  complications: LaborComplications | null;
}

// Estado proyectado (vista materializada) de un caso.
export interface CaseState {
  caseType: "quirofano" | "analgesia_parto";
  convertedAt?: string | null; // conversión de parto a cesárea (a partir de aquí, quirófano)
  labor: LaborData;
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
  monitorVia: MonitorVia | null; // vía de registro del monitor (null = aún sin elegir)
  monitorPhotos: MonitorPhotoRecord[]; // fotos guardadas (Vía 1)
  incidents: IncidentRecord[];
  milestones: MilestoneRecord[];
  positions: PositionRecord[];
  protection: ProtectionInfo | null;
  endState: EndStateInfo | null;
  bloodProducts: BloodProductRecord[];
  labs: LabRecord[];
  balances: BalanceRecord[];
  endedAt?: string | null;
  signedAt?: string | null;
  signedBy?: string | null;
}

export function emptyCaseState(caseId: string, ia: string, year: number, ordinal: number, createdAt: string): CaseState {
  return {
    caseType: "quirofano",
    convertedAt: null,
    labor: {
      testDose: null,
      loadingDose: null,
      pumpPrograms: [],
      readings: [],
      rescues: [],
      assessments: [],
      ambulationTests: [],
      delivery: null,
      catheter: null,
      complications: null,
    },
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
    monitorVia: null,
    monitorPhotos: [],
    incidents: [],
    milestones: [],
    positions: [],
    protection: null,
    endState: null,
    bloodProducts: [],
    labs: [],
    balances: [],
    endedAt: null,
    signedAt: null,
    signedBy: null,
  };
}
