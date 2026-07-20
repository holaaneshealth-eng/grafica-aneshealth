import type { PoolClient } from "pg";
import { withTransaction } from "./db";
import type { CaseFull, EventRow } from "./repo";
import { formatIA, eventHash, newId } from "./domain";
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

/** Reserva atomicamente el siguiente ordinal del anio (dentro de una transaccion). */
async function reserveIA(client: PoolClient, now: Date): Promise<{ ia: string; year: number; ordinal: number }> {
  const fullYear = now.getFullYear();
  const yy = fullYear % 100;
  await client.query(`INSERT INTO ordinal_counter (year, last_ordinal) VALUES ($1, 0) ON CONFLICT (year) DO NOTHING`, [fullYear]);
  const r = await client.query<{ last_ordinal: number }>(
    `UPDATE ordinal_counter SET last_ordinal = last_ordinal + 1 WHERE year = $1 RETURNING last_ordinal`,
    [fullYear],
  );
  const ordinal = r.rows[0].last_ordinal;
  return { ia: formatIA(yy, ordinal), year: fullYear, ordinal };
}

/** Anade un evento (dentro de una transaccion) encadenando el hash y actualizando el estado del caso. */
async function appendEventTx(client: PoolClient, caseId: string, input: AppendInput, actor: AuthUser): Promise<AppendResult> {
  if (input.eventId) {
    const ex = await client.query<EventRow>(`SELECT * FROM events WHERE event_id=$1`, [input.eventId]);
    if (ex.rows[0]) return { event: ex.rows[0], deduped: true };
  }

  const now = new Date().toISOString();
  const occurredAt = input.occurredAt ?? now;
  const eventId = input.eventId ?? newId();

  const prevRes = await client.query<{ hash: string }>(
    `SELECT hash FROM events WHERE case_id=$1 ORDER BY seq DESC LIMIT 1`,
    [caseId],
  );
  const prevHash = prevRes.rows[0]?.hash ?? null;

  const hash = eventHash(prevHash, {
    eventId,
    caseId,
    type: input.type,
    occurredAt,
    recordedAt: now,
    actorUserId: actor.id,
    payload: input.payload,
  });

  await client.query(
    `INSERT INTO events (event_id, case_id, type, occurred_at, recorded_at, actor_user_id, actor_name, payload, corrects_event_id, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [eventId, caseId, input.type, occurredAt, now, actor.id, actor.displayName, JSON.stringify(input.payload ?? {}), null, prevHash, hash],
  );

  if (input.type === "SURGERY_ENDED") {
    await client.query(`UPDATE cases SET status='closed', closed_at=$1, last_activity=$2 WHERE case_id=$3`, [occurredAt, now, caseId]);
  } else if (input.type === "CASE_SIGNED") {
    const signedBy = (input.payload.signedBy as string) ?? actor.displayName;
    await client.query(
      `UPDATE cases SET status='signed', signed_at=$1, signed_by=$2, closed_at=COALESCE(closed_at,$1), last_activity=$3 WHERE case_id=$4`,
      [occurredAt, signedBy, now, caseId],
    );
  } else {
    await client.query(`UPDATE cases SET last_activity=$1 WHERE case_id=$2`, [now, caseId]);
  }

  const inserted = await client.query<EventRow>(`SELECT * FROM events WHERE event_id=$1`, [eventId]);
  return { event: inserted.rows[0], deduped: false };
}

/** Anade un evento a un caso existente. */
export function appendEvent(caseId: string, input: AppendInput, actor: AuthUser): Promise<AppendResult> {
  return withTransaction((client) => appendEventTx(client, caseId, input, actor));
}

/** Anula un evento (append-only): registra un EVENT_VOIDED que referencia al original. Solo admin. */
export async function voidEvent(caseId: string, targetEventId: string, reason: string, actor: AuthUser): Promise<void> {
  await withTransaction(async (client) => {
    const now = new Date().toISOString();
    const prevRes = await client.query<{ hash: string }>(
      `SELECT hash FROM events WHERE case_id=$1 ORDER BY seq DESC LIMIT 1`,
      [caseId],
    );
    const prevHash = prevRes.rows[0]?.hash ?? null;
    const eventId = newId();
    const payload = { targetId: targetEventId, reason };
    const hash = eventHash(prevHash, {
      eventId,
      caseId,
      type: "EVENT_VOIDED",
      occurredAt: now,
      recordedAt: now,
      actorUserId: actor.id,
      payload,
    });
    await client.query(
      `INSERT INTO events (event_id, case_id, type, occurred_at, recorded_at, actor_user_id, actor_name, payload, corrects_event_id, prev_hash, hash)
       VALUES ($1,$2,'EVENT_VOIDED',$3,$3,$4,$5,$6,$7,$8,$9)`,
      [eventId, caseId, now, actor.id, actor.displayName, JSON.stringify(payload), targetEventId, prevHash, hash],
    );
    await client.query(`UPDATE cases SET last_activity=$1 WHERE case_id=$2`, [now, caseId]);
  });
}

/** Crea un caso nuevo: reserva IA, inserta el caso y emite CASE_CREATED. */
export function createCase(actor: AuthUser): Promise<CaseFull> {
  return withTransaction(async (client) => {
    const now = new Date();
    const iso = now.toISOString();
    const { ia, year, ordinal } = await reserveIA(client, now);
    const caseId = newId();
    await client.query(
      `INSERT INTO cases (case_id, ia, year, ordinal, owner_user_id, owner_location, status, created_at, last_activity)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$7)`,
      [caseId, ia, year, ordinal, actor.id, actor.location, iso],
    );
    await appendEventTx(client, caseId, { type: "CASE_CREATED", occurredAt: iso, payload: { ia, year, ordinal, ownerLocation: actor.location } }, actor);
    const res = await client.query<CaseFull>(`SELECT * FROM cases WHERE case_id=$1`, [caseId]);
    return res.rows[0];
  });
}

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
