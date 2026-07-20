import crypto from "crypto";
import { db } from "./db";

// ---- Identificador Anestesico (IA) ----
const CONTROL_TABLE = "TRWAGMYFPDXBNJZSQVHLCKE";

function computeControlChar(twoDigitYear: number, ordinal: number): string {
  const base = Number(`${String(twoDigitYear).padStart(2, "0")}${String(ordinal).padStart(6, "0")}`);
  return CONTROL_TABLE[base % 23];
}

/** Reserva atomicamente el siguiente ordinal del anio y devuelve el IA formateado. */
export const nextIA = db.transaction((now: Date): { ia: string; year: number; ordinal: number } => {
  const fullYear = now.getFullYear();
  const yy = fullYear % 100;
  db.prepare(
    `INSERT INTO ordinal_counter (year, last_ordinal) VALUES (?, 0)
     ON CONFLICT(year) DO NOTHING`,
  ).run(fullYear);
  db.prepare(`UPDATE ordinal_counter SET last_ordinal = last_ordinal + 1 WHERE year = ?`).run(fullYear);
  const row = db.prepare(`SELECT last_ordinal FROM ordinal_counter WHERE year = ?`).get(fullYear) as {
    last_ordinal: number;
  };
  const ordinal = row.last_ordinal;
  const ia = `${String(yy).padStart(2, "0")}-${String(ordinal).padStart(6, "0")}-${computeControlChar(yy, ordinal)}`;
  return { ia, year: fullYear, ordinal };
});

// ---- Cadena de hash de eventos (integridad / anti-manipulacion) ----
export function eventHash(prevHash: string | null, payload: {
  eventId: string;
  caseId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  actorUserId: string;
  payload: unknown;
}): string {
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
