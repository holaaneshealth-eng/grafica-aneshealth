import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { audit } from "../db";
import { cases, events, casePhotos } from "../repo";
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
  if (data.type === "CASE_REOPENED") {
    // Punto de no retorno = la firma. Solo se puede reabrir un caso cerrado (no firmado).
    allowed = c.status === "closed" && (u.role === "admin" || c.owner_user_id === u.id);
  } else if (u.role === "admin") {
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

// ---- Fotos del monitor (Vía 1: se guardan sin analizar y van al PDF) ----

const photoSchema = z.object({
  imageBase64: z.string().min(16).max(10_000_000), // JPEG comprimido (~1600px) en base64
  mimeType: z.string().max(60).default("image/jpeg"),
  takenAt: z.string().datetime().optional(),
});

// Subir una foto del monitor. Permiso: admin, o propietario con el caso activo.
casesRouter.post("/:id/photos", csrfGuard, async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const u = req.user!;
  const allowed = u.role === "admin" || (c.owner_user_id === u.id && c.status === "active");
  if (!allowed) {
    res.status(403).json({ error: "No tienes permiso para añadir fotos a este caso" });
    return;
  }
  const parsed = photoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Foto no válida", detail: parsed.error.issues[0]?.message });
    return;
  }
  const { imageBase64 } = parsed.data;
  const mime = (parsed.data.mimeType || "image/jpeg").toLowerCase();
  const base64 = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;
  const data = Buffer.from(base64, "base64");
  if (data.length === 0) {
    res.status(400).json({ error: "Foto vacía" });
    return;
  }
  const now = new Date().toISOString();
  const takenAt = parsed.data.takenAt ?? now;
  const photoId = crypto.randomUUID();
  await casePhotos.insert({ id: photoId, caseId: c.case_id, takenAt, mime, byteSize: data.length, data, createdAt: now });
  // Evento ligero en el stream (orden/proyección); los bytes viven en case_photos.
  const result = await appendEvent(c.case_id, { type: "MONITOR_PHOTO_ADDED", occurredAt: takenAt, payload: { id: photoId, at: takenAt, mime, byteSize: data.length } }, u);
  audit({ userId: u.id, username: u.username, action: "MONITOR_PHOTO_ADDED", targetType: "case", targetId: c.ia, detail: `${Math.round(data.length / 1024)} KB`, ip: req.ip });
  res.status(201).json({ photo: { id: photoId, taken_at: takenAt, mime, byte_size: data.length }, event: mapEvent(result.event) });
});

// Metadatos de las fotos de un caso (id, hora, mime, tamaño).
casesRouter.get("/:id/photos", async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  res.json({ photos: await casePhotos.listMeta(req.params.id) });
});

// Bytes de una foto (para incrustarla en el PDF o analizarla con Claude).
casesRouter.get("/:id/photos/:photoId", async (req, res) => {
  const photo = await casePhotos.get(req.params.photoId);
  if (!photo || photo.case_id !== req.params.id) {
    res.status(404).json({ error: "Foto no encontrada" });
    return;
  }
  res.setHeader("Content-Type", photo.mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(photo.data);
});

// Borrar una foto. Permiso: admin, o propietario con el caso no firmado.
casesRouter.delete("/:id/photos/:photoId", csrfGuard, async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const u = req.user!;
  const allowed = u.role === "admin" || (c.owner_user_id === u.id && c.status !== "signed");
  if (!allowed) {
    res.status(403).json({ error: "No tienes permiso para borrar fotos de este caso" });
    return;
  }
  const photo = await casePhotos.get(req.params.photoId);
  if (!photo || photo.case_id !== req.params.id) {
    res.status(404).json({ error: "Foto no encontrada" });
    return;
  }
  await casePhotos.remove(req.params.photoId);
  await appendEvent(c.case_id, { type: "MONITOR_PHOTO_REMOVED", payload: { id: req.params.photoId } }, u);
  audit({ userId: u.id, username: u.username, action: "MONITOR_PHOTO_REMOVED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.json({ ok: true });
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

// Borrar un caso: admin siempre; propietario solo si el caso NO está firmado
// (borrado manual de casos sin firmar desde la lista "Casos sin firmar").
casesRouter.delete("/:id", csrfGuard, async (req, res) => {
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const u = req.user!;
  const allowed = u.role === "admin" || (c.owner_user_id === u.id && c.status !== "signed");
  if (!allowed) {
    audit({ userId: u.id, username: u.username, action: "CASE_DELETE_DENIED", targetType: "case", targetId: c.ia, ip: req.ip, success: false });
    res.status(403).json({ error: "No tienes permiso para borrar este caso" });
    return;
  }
  await cases.delete(req.params.id);
  audit({ userId: u.id, username: u.username, action: "CASE_DELETED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.json({ ok: true });
});
