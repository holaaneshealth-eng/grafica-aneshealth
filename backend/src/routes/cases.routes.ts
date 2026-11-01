import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { audit, dbFeatures } from "../db";
import { cases, events, casePhotos, anesthesiologists } from "../repo";
import { appendEvent, createCase, voidEvent, mapCase, mapEvent } from "../eventService";
import { retentionPreview } from "../retention";
import { authGuard, csrfGuard, requirePasswordChanged, requireAdmin } from "../middleware";
import { canCreateCase } from "../rbac";
import { verifyPin } from "../auth";
import { appendEventSchema, voidEventSchema, createCaseSchema, signCaseSchema } from "../validation";

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
  // C2: las cuentas de quirófano/endoscopias solo pueden tener un caso activo (sin cerrar) a la
  // vez. Excepción: partos puede tener varias analgesias activas. El administrador no se limita.
  const u = req.user!;
  const esPartos = u.username === "partos" || (u.location ?? "").toLowerCase().includes("parto");
  if (u.role !== "admin" && !esPartos) {
    const activo = await cases.activeByOwner(u.id);
    if (activo) {
      audit({ userId: u.id, username: u.username, action: "CASE_CREATE_BLOCKED", targetType: "case", targetId: activo.ia, ip: req.ip, success: false });
      res.status(409).json({
        error: `Ya tienes un caso activo (${activo.ia}). Ciérralo antes de crear otro.`,
        code: "ACTIVE_CASE_EXISTS",
        ia: activo.ia,
        caseId: activo.case_id,
        createdAt: activo.created_at,
      });
      return;
    }
  }
  const parsed = createCaseSchema.safeParse(req.body ?? {});
  const caseType = parsed.success ? parsed.data.caseType ?? "quirofano" : "quirofano";
  const c = await createCase(req.user!, caseType);
  audit({ userId: req.user!.id, username: req.user!.username, action: "CASE_CREATED", targetType: "case", targetId: c.ia, ip: req.ip });
  res.status(201).json({ case: mapCase(c) });
});

// Previsualización del autoborrado (qué casos se borrarían). SOLO admin.
// Debe ir ANTES de "/:id" para que no lo capture como id.
casesRouter.get("/retention-preview", requireAdmin, async (_req, res) => {
  res.json(await retentionPreview());
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

// Firmar un caso con la firma personal del anestesiólogo (nombre + PIN). La firma
// requiere seleccionar un anestesiólogo de la lista y su PIN válido; la cuenta de
// administrador NO puede firmar. Con bloqueo por intentos fallidos (5 → 15 min).
casesRouter.post("/:id/sign", csrfGuard, async (req, res) => {
  if (!dbFeatures.anesthesiologists) {
    res.status(503).json({ error: "La firma personal no está disponible en el servidor.", code: "ANESTH_UNAVAILABLE" });
    return;
  }
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  const u = req.user!;
  if (u.role === "admin") {
    res.status(403).json({ error: "La cuenta de administrador no puede firmar casos." });
    return;
  }
  if (!(c.owner_user_id === u.id && c.status !== "signed")) {
    res.status(403).json({ error: "No tienes permiso para firmar este caso" });
    return;
  }
  const parsed = signCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const a = await anesthesiologists.byId(parsed.data.anesthesiologistId);
  if (!a || a.active !== 1) {
    res.status(400).json({ error: "Anestesiólogo no disponible" });
    return;
  }
  if (a.locked_until && new Date(a.locked_until).getTime() > Date.now()) {
    audit({ userId: u.id, username: u.username, action: "SIGN_PIN_LOCKED", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip, success: false });
    res.status(429).json({ error: "Perfil bloqueado temporalmente por intentos fallidos", code: "PIN_LOCKED" });
    return;
  }
  const ok = a.pin_hash ? await verifyPin(parsed.data.pin, a.pin_hash) : false;
  if (!ok) {
    const attempts = a.failed_attempts + 1;
    const lockedUntil = attempts >= config.maxFailedLogins ? new Date(Date.now() + config.lockoutMinutes * 60000).toISOString() : null;
    await anesthesiologists.recordPinFailure(a.id, attempts, lockedUntil);
    audit({ userId: u.id, username: u.username, action: "SIGN_PIN_FAILED", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip, success: false });
    res.status(401).json({ error: "PIN incorrecto" });
    return;
  }
  await anesthesiologists.recordPinSuccess(a.id);
  // Primera firma: el PIN provisional es válido pero debe cambiarse antes de firmar.
  if (a.must_change_pin === 1) {
    res.status(409).json({ error: "Debe cambiar el PIN provisional antes de firmar", code: "PIN_MUST_CHANGE" });
    return;
  }
  const result = await appendEvent(
    c.case_id,
    { type: "CASE_SIGNED", payload: { signedBy: a.full_name, anesthesiologistId: a.id, colegiado: a.colegiado, title: a.title } },
    u,
  );
  audit({ userId: u.id, username: u.username, action: "CASE_SIGNED", targetType: "case", targetId: c.ia, detail: `${a.title} ${a.full_name} · Nº ${a.colegiado}`, ip: req.ip });
  res.status(201).json({ ok: true, signedBy: a.full_name, colegiado: a.colegiado, title: a.title, event: mapEvent(result.event) });
});

// ---- Fotos del monitor (Vía 1: se guardan sin analizar y van al PDF) ----

const photoSchema = z.object({
  imageBase64: z.string().min(16).max(10_000_000), // JPEG comprimido (~1600px) en base64
  mimeType: z.string().max(60).default("image/jpeg"),
  takenAt: z.string().datetime().optional(),
});

// Subir una foto del monitor. Permiso: admin, o propietario con el caso activo.
casesRouter.post("/:id/photos", csrfGuard, async (req, res) => {
  if (!dbFeatures.photos) {
    res.status(503).json({ error: "La Vía 1 (fotos del monitor) no está disponible en el servidor.", code: "PHOTOS_UNAVAILABLE" });
    return;
  }
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
  if (!dbFeatures.photos) {
    res.json({ photos: [] }); // Vía 1 desactivada: sin fotos
    return;
  }
  const c = await cases.byId(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Caso no encontrado" });
    return;
  }
  res.json({ photos: await casePhotos.listMeta(req.params.id) });
});

// Bytes de una foto (para incrustarla en el PDF o analizarla con Claude).
casesRouter.get("/:id/photos/:photoId", async (req, res) => {
  if (!dbFeatures.photos) {
    res.status(404).json({ error: "Foto no encontrada" });
    return;
  }
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
  if (!dbFeatures.photos) {
    res.status(503).json({ error: "La Vía 1 (fotos del monitor) no está disponible.", code: "PHOTOS_UNAVAILABLE" });
    return;
  }
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
