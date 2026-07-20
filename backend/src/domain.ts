import crypto from "crypto";

// ---- Identificador Anestesico (IA) ----
const CONTROL_TABLE = "TRWAGMYFPDXBNJZSQVHLCKE";

export function computeControlChar(twoDigitYear: number, ordinal: number): string {
  const base = Number(`${String(twoDigitYear).padStart(2, "0")}${String(ordinal).padStart(6, "0")}`);
  return CONTROL_TABLE[base % 23];
}

export function formatIA(twoDigitYear: number, ordinal: number): string {
  return `${String(twoDigitYear).padStart(2, "0")}-${String(ordinal).padStart(6, "0")}-${computeControlChar(twoDigitYear, ordinal)}`;
}

// ---- Cadena de hash de eventos (integridad / anti-manipulacion) ----
export function eventHash(
  prevHash: string | null,
  payload: {
    eventId: string;
    caseId: string;
    type: string;
    occurredAt: string;
    recordedAt: string;
    actorUserId: string;
    payload: unknown;
  },
): string {
  const canonical = JSON.stringify({
    prev: prevHash ?? "",
    eventId: payload.eventId,
    caseId: payload.caseId,
    type: payload.type,
    occurredAt: payload.occurredAt,
    recordedAt: payload.recordedAt,
    actorUserId: payload.actorUserId,
    payload: payload.payload,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function newId(): string {
  return crypto.randomUUID();
}
