import { Router } from "express";
import { audit } from "../db";
import { cases, events } from "../repo";
import { appendEvent, createCase, voidEvent, mapCase, mapEvent } from "../eventService";
import { authGuard, csrfGuard, requirePasswordChanged, requireAdmin } from "../middleware";
import { canCreateCase } from "../rbac";
import { appendEventSchema, voidEventSchema } from "../validation";

export const casesRouter = Router();

casesRouter.use(authGuard, requirePasswordChanged);

// Listado de todos los casos (lectura para cualquier usuario autenticado).
casesRouter.get("/", async (_req, res) => {
  const all = await cases.all();
  res.json({ cases: all.map(mapCase) });
});

// Crear un caso nuevo.
casesRouter.post("/", csrfGuard, async (req, res) => {
  if (!canCreateCase(req.user!)) {
    res.status(403).json({ error: "Sin permiso para crear casos" });
    return;
  }
  const c = await createCase(req.user!);
  audit({ userId: req.user!.id, username: req.user!.username, action: "CASE_CREATED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.status(201).json({ case: mapCase(c) });
});

// Detalle de un caso.
casesRouter.get("/:id", async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  res.json({ case: mapCase(c) });
});

// Eventos de un caso (para reconstruir la hoja).
casesRouter.get("/:id/events", async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const list = await events.byCase(req.params.id);
  res.json({ events: list.map(mapEvent) });
});

// Anadir un evento (append-only). Aplica el control de permisos por rol y propiedad.
casesRouter.post("/:id/events", csrfGuard, async (req, res) => {
  const c = await cases.byId(req.params.id);
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
      userId: u.id,
      username: u.username,
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

  const result = await appendEvent(req.params.id, data, u);
  if (!result.deduped) {
    audit({ userId: u.id, username: u.username, action: "EVENT_APPENDED", targetType: "case", targetId: c.ia, detail: data.type, ip: req.ip });
  }
  res.status(result.deduped ? 200 : 201).json({ event: mapEvent(result.event), deduped: result.deduped });
});

// Anular un evento: SOLO admin (los clinicos no pueden modificar registros).
casesRouter.post("/:id/void", csrfGuard, requireAdmin, async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const parsed = voidEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos" });
    return;
  }
  const target = await events.byEventId(parsed.data.targetEventId);
  if (!target || target.case_id !== req.params.id) {
    res.status(404).json({ error: "Evento no encontrado en este caso" });
    return;
  }
  await voidEvent(req.params.id, parsed.data.targetEventId, parsed.data.reason, req.user!);
  audit({ userId: req.user!.id, username: req.user!.username, action: "EVENT_VOIDED", targetType: "case", targetId: c.ia, detail: parsed.data.reason, ip: req.ip });
  res.json({ ok: true });
});

// Borrar un caso: SOLO admin.
casesRouter.delete("/:id", csrfGuard, requireAdmin, async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  await cases.delete(req.params.id);
  audit({ userId: req.user!.id, username: req.user!.username, action: "CASE_DELETED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.json({ ok: true });
});
