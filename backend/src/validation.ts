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
  "MONITORING_SELECTED",
  "TECHNIQUE_ADDED",
  "DRUG_BOLUS",
  "INFUSION_STARTED",
  "INFUSION_RATE_CHANGED",
  "INFUSION_STOPPED",
  "VITALS_RECORDED",
  "WEIGHT_UPDATED",
  "MILESTONE",
  "INCIDENT",
  "SURGERY_ENDED",
  "CASE_SIGNED",
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
