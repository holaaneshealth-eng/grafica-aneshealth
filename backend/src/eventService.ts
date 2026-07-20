import { db } from "./db";
import { cases, events, type CaseFull, type EventRow } from "./repo";
import { nextIA, eventHash, newId } from "./domain";
import type { AuthUser } from "./auth";

export interface AppendInput {
  eventId?: string;
  type: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

export interface AppendResult {
  event: EventRow;
  deduped: boolean;
}

/** Anade un evento a un caso de forma atomica, encadenando el hash y actualizando el estado. */
export const appendEvent = db.transaction((caseId: string, input: AppendInput, actor: AuthUser): AppendResult => {
  if (input.eventId) {
    const existing = events.byEventId.get(input.eventId);
    if (existing) return { event: existing, deduped: true };
  }

  const now = new Date().toISOString();
  const occurredAt = input.occurredAt ?? now;
  const eventId = input.eventId ?? newId();
  const prev = events.lastHash.get(caseId);
  const prevHash = prev?.hash ?? null;

  const hash = eventHash(prevHash, {
    eventId,
    caseId,
    type: input.type,
    occurredAt,
    recordedAt: now,
    actorUserId: actor.id,
    payload: input.payload,
  });

  events.insert.run({
    event_id: eventId,
    case_id: caseId,
    type: input.type,
    occurred_at: occurredAt,
    recorded_at: now,
    actor_user_id: actor.id,
    actor_name: actor.displayName,
    payload: JSON.stringify(input.payload ?? {}),
    corrects_event_id: null,
    prev_hash: prevHash,
    hash,
  });

  // Transiciones de estado del caso.
  if (input.type === "SURGERY_ENDED") {
    cases.setStatus.run({ case_id: caseId, status: "closed", closed_at: occurredAt, signed_at: null, signed_by: null, at: now });
  } else if (input.type === "CASE_SIGNED") {
    const c = cases.byId.get(caseId);
    cases.setStatus.run({
      case_id: caseId,
      status: "signed",
      closed_at: c?.closed_at ?? occurredAt,
      signed_at: occurredAt,
      signed_by: (input.payload.signedBy as string) ?? actor.displayName,
      at: now,
    });
  } else {
    cases.touch.run({ case_id: caseId, at: now });
  }

  return { event: events.byEventId.get(eventId)!, deduped: false };
});

/** Crea un caso nuevo: reserva IA, inserta el caso y emite CASE_CREATED. */
export const createCase = db.transaction((actor: AuthUser): CaseFull => {
  const now = new Date();
  const iso = now.toISOString();
  const { ia, year, ordinal } = nextIA(now);
  const caseId = newId();
  cases.insert.run({
    case_id: caseId,
    ia,
    year,
    ordinal,
    owner_user_id: actor.id,
    owner_location: actor.location,
    created_at: iso,
    last_activity: iso,
  });
  appendEvent(caseId, { type: "CASE_CREATED", occurredAt: iso, payload: { ia, year, ordinal, ownerLocation: actor.location } }, actor);
  return cases.byId.get(caseId)!;
});

export function mapEvent(e: EventRow) {
  return {
    eventId: e.event_id,
    caseId: e.case_id,
    type: e.type,
    occurredAt: e.occurred_at,
    recordedAt: e.recorded_at,
    actor: e.actor_name,
    actorUserId: e.actor_user_id,
    payload: JSON.parse(e.payload),
    correctsEventId: e.corrects_event_id,
    hash: e.hash,
    prevHash: e.prev_hash,
  };
}

export function mapCase(c: CaseFull) {
  return {
    caseId: c.case_id,
    ia: c.ia,
    year: c.year,
    ordinal: c.ordinal,
    ownerUserId: c.owner_user_id,
    ownerLocation: c.owner_location,
    status: c.status,
    createdAt: c.created_at,
    lastActivity: c.last_activity,
    closedAt: c.closed_at,
    signedAt: c.signed_at,
    signedBy: c.signed_by,
  };
}
