import { Router } from "express";
import { audit } from "../db";
import { cases, events } from "../repo";
import { appendEvent, createCase, mapCase, mapEvent } from "../eventService";
import { authGuard, csrfGuard, requirePasswordChanged, requireAdmin } from "../middleware";
import { canCreateCase } from "../rbac";
import { appendEventSchema, voidEventSchema } from "../validation";
import { db } from "../db";
import { newId, eventHash } from "../domain";

export const casesRouter = Router();

casesRouter.use(authGuard, requirePasswordChanged);

// Listado de todos los casos (lectura para cualquier usuario autenticado).
casesRouter.get("/", (_req, res) => {
  res.json({ cases: cases.all.all().map(mapCase) });
});

// Crear un caso nuevo.
casesRouter.post("/", csrfGuard, (req, res) => {
  if (!canCreateCase(req.user!)) {
    res.status(403).json({ error: "Sin permiso para crear casos" });
    return;
  }
  const c = createCase(req.user!);
  audit({ userId: req.user!.id, username: req.user!.username, action: "CASE_CREATED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.status(201).json({ case: mapCase(c) });
});

// Detalle de un caso.
casesRouter.get("/:id", (req, res) => {
  const c = cases.byId.get(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  res.json({ case: mapCase(c) });
});

// Eventos de un caso (para reconstruir la hoja).
casesRouter.get("/:id/events", (req, res) => {
  const c = cases.byId.get(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  res.json({ events: events.byCase.all(req.params.id).map(mapEvent) });
});

// Anadir un evento (append-only). Aplica el control de permisos por rol y propiedad.
casesRouter.post("/:id/events", csrfGuard, (req, res) => {
  const c = cases.byId.get(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const parsed = appendEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Evento invalido", detail: parsed.error.issues[0]?.message });
    return;
  }
  const data = parsed.data;

  // Permisos por tipo de evento:
  //  - admin: siempre.
  //  - clinico propietario: registra en su caso mientras esta activo; puede FIRMAR mientras no este firmado;
  //    solo puede cerrar (SURGERY_ENDED) si sigue activo. Nunca escribe en casos ajenos ni ya firmados.
  const u = req.user!;
  let allowed = false;
  if (u.role === "admin") {
    allowed = true;
  } else if (c.owner_user_id === u.id) {
    if (data.type === "CASE_SIGNED") allowed = c.status !== "signed";
    else if (data.type === "SURGERY_ENDED") allowed = c.status === "active";
    else allowed = c.status === "active";
  }
  if (!allowed) {
    audit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "APPEND_DENIED",
      targetType: "case",
      targetId: c.ia,
      detail: data.type,
      ip: req.ip,
      success: false,
    });
    res.status(403).json({ error: "No tienes permiso para escribir en este caso" });
    return;
  }

  const result = appendEvent(req.params.id, data, req.user!);
  if (!result.deduped) {
    audit({
      userId: req.user!.id,
      username: req.user!.username,
      action: "EVENT_APPENDED",
      targetType: "case",
      targetId: c.ia,
      detail: data.type,
      ip: req.ip,
    });
  }
  res.status(result.deduped ? 200 : 201).json({ event: mapEvent(result.event), deduped: result.deduped });
});

// Anular un evento: SOLO admin (los clinicos no pueden modificar registros).
casesRouter.post("/:id/void", csrfGuard, requireAdmin, (req, res) => {
  const c = cases.byId.get(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const parsed = voidEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos" });
    return;
  }
  const target = events.byEventId.get(parsed.data.targetEventId);
  if (!target || target.case_id !== req.params.id) {
    res.status(404).json({ error: "Evento no encontrado en este caso" });
    return;
  }
  // La anulacion es a su vez un evento (append-only): no se borra el original.
  const now = new Date().toISOString();
  const prev = events.lastHash.get(req.params.id);
  const eventId = newId();
  const payload = { targetId: parsed.data.targetEventId, reason: parsed.data.reason };
  const hash = eventHash(prev?.hash ?? null, {
    eventId,
    caseId: req.params.id,
    type: "EVENT_VOIDED",
    occurredAt: now,
    recordedAt: now,
    actorUserId: req.user!.id,
    payload,
  });
  db.prepare(
    `INSERT INTO events (event_id, case_id, type, occurred_at, recorded_at, actor_user_id, actor_name, payload, corrects_event_id, prev_hash, hash)
     VALUES (@event_id, @case_id, 'EVENT_VOIDED', @at, @at, @actor_user_id, @actor_name, @payload, @target, @prev_hash, @hash)`,
  ).run({
    event_id: eventId,
    case_id: req.params.id,
    at: now,
    actor_user_id: req.user!.id,
    actor_name: req.user!.displayName,
    payload: JSON.stringify(payload),
    target: parsed.data.targetEventId,
    prev_hash: prev?.hash ?? null,
    hash,
  });
  audit({ userId: req.user!.id, username: req.user!.username, action: "EVENT_VOIDED", targetType: "case", targetId: c.ia, detail: parsed.data.reason, ip: req.ip });
  res.json({ ok: true });
});

// Borrar un caso: SOLO admin.
casesRouter.delete("/:id", csrfGuard, requireAdmin, (req, res) => {
  const c = cases.byId.get(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  cases.delete.run(req.params.id);
  audit({ userId: req.user!.id, username: req.user!.username, action: "CASE_DELETED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.json({ ok: true });
});
