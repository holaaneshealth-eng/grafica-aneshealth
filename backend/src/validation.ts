import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(10).max(256),
});

// Tipos de evento que un cliente puede anadir mediante append.
export const APPENDABLE_EVENT_TYPES = [
  "PREOP_INFO_RECORDED",
  "PHASE_COMPLETED",
  "SAFETY_CHECK_SET",
  "WHO_CHECK_SET",
  "MONITORING_SELECTED",
  "MONITORING_TOGGLED",
  "MONITORING_CUSTOM_ADDED",
  "MONITORING_CUSTOM_REMOVED",
  "TECHNIQUE_ADDED",
  "DRUG_BOLUS",
  "INFUSION_STARTED",
  "INFUSION_RATE_CHANGED",
  "INFUSION_STOPPED",
  "VITALS_RECORDED",
  "VITALS_UPDATED",
  "VITALS_REMOVED",
  "WEIGHT_UPDATED",
  "VENT_MODE_SET",
  "MONITOR_MODE_SET",
  "MILESTONE",
  "MILESTONE_TIME_CHANGED",
  "MILESTONE_REMOVED",
  "POSITION_SET",
  "POSITION_REMOVED",
  "PROTECTION_SET",
  "ANESTHESIA_END_STATE_SET",
  "LABOR_TEST_DOSE",
  "LABOR_LOADING_DOSE",
  "PUMP_PROGRAM_SET",
  "PUMP_READING",
  "LABOR_RESCUE_BOLUS",
  "LABOR_ASSESSMENT",
  "AMBULATION_TEST",
  "LABOR_DELIVERY",
  "CATHETER_REMOVED",
  "LABOR_COMPLICATIONS_SET",
  "CONVERT_TO_CESAREAN",
  "INCIDENT",
  "INCIDENT_REMOVED",
  "BLOOD_PRODUCT",
  "BLOOD_PRODUCT_REMOVED",
  "LAB_RESULT",
  "LAB_REMOVED",
  "BALANCE",
  "BALANCE_REMOVED",
  "BOLUS_UPDATED",
  "BOLUS_REMOVED",
  "INFUSION_REMOVED",
  "SURGERY_ENDED",
  "CASE_REOPENED",
  "CASE_SIGNED",
  "SHEET_EMAILED",
] as const;

export const appendEventSchema = z.object({
  eventId: z.string().uuid().optional(),
  type: z.enum(APPENDABLE_EVENT_TYPES),
  occurredAt: z.string().datetime().optional(),
  payload: z.record(z.unknown()).default({}),
});

export const voidEventSchema = z.object({
  targetEventId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/, "Solo minusculas, numeros y guion bajo"),
  displayName: z.string().min(1).max(64),
  role: z.enum(["admin", "clinical"]),
  location: z.string().max(64).optional(),
  password: z.string().min(10).max(256),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(10).max(256),
});

export const setActiveSchema = z.object({
  active: z.boolean(),
});

export const createCaseSchema = z.object({
  caseType: z.enum(["quirofano", "analgesia_parto"]).optional(),
});

export const settingsSchema = z.object({
  laborFirstTestMin: z.number().int().min(0).max(600).optional(),
  laborReevalMin: z.number().int().min(0).max(600).optional(),
});

export const createCustomDrugSchema = z.object({
  name: z.string().min(1).max(80),
  group: z.string().max(40).optional(),
  defaultUnit: z.string().max(16).optional(),
  commonBolus: z.array(z.number()).max(16).optional(),
  infusionDoseUnit: z.string().max(24).optional(),
  concVol: z.boolean().optional(),
});
