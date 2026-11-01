import { Router } from "express";
import { config } from "../config";
import { audit, dbFeatures } from "../db";
import { anesthesiologists } from "../repo";
import { authGuard, csrfGuard, requireAdmin, requirePasswordChanged } from "../middleware";
import { hashPin, verifyPin, generatePin, validatePin } from "../auth";
import { newId } from "../domain";
import { createAnesthesiologistSchema, updateAnesthesiologistSchema, changePinSchema } from "../validation";

export const anesthesiologistsRouter = Router();

anesthesiologistsRouter.use(authGuard, requirePasswordChanged);

// Guard de disponibilidad: si la migración no se aplicó, la firma personal está desactivada.
function ensureEnabled(res: import("express").Response): boolean {
  if (!dbFeatures.anesthesiologists) {
    res.status(503).json({ error: "La firma personal no está disponible en el servidor.", code: "ANESTH_UNAVAILABLE" });
    return false;
  }
  return true;
}

// Lista para SELECCIÓN (firma / responsable): cualquier usuario autenticado, solo activos.
anesthesiologistsRouter.get("/selectable", async (_req, res) => {
  if (!dbFeatures.anesthesiologists) {
    res.json({ anesthesiologists: [] });
    return;
  }
  res.json({ anesthesiologists: await anesthesiologists.selectable() });
});

// El propio anestesiólogo cambia su PIN (p. ej. la primera vez que firma). Cualquier
// usuario autenticado: la autorización es el PIN actual. Con bloqueo por intentos fallidos.
anesthesiologistsRouter.post("/:id/change-pin", csrfGuard, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const parsed = changePinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const a = await anesthesiologists.byId(req.params.id);
  if (!a || a.active !== 1) {
    res.status(404).json({ error: "Anestesiólogo no encontrado" });
    return;
  }
  if (a.locked_until && new Date(a.locked_until).getTime() > Date.now()) {
    res.status(429).json({ error: "Perfil bloqueado temporalmente por intentos fallidos", code: "PIN_LOCKED" });
    return;
  }
  const ok = a.pin_hash ? await verifyPin(parsed.data.currentPin, a.pin_hash) : false;
  if (!ok) {
    const attempts = a.failed_attempts + 1;
    const lockedUntil = attempts >= config.maxFailedLogins ? new Date(Date.now() + config.lockoutMinutes * 60000).toISOString() : null;
    await anesthesiologists.recordPinFailure(a.id, attempts, lockedUntil);
    audit({ userId: req.user!.id, username: req.user!.username, action: "ANESTH_PIN_CHANGE_FAILED", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip, success: false });
    res.status(401).json({ error: "El PIN actual no es correcto" });
    return;
  }
  const weak = validatePin(parsed.data.newPin);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }
  await anesthesiologists.setPin(a.id, await hashPin(parsed.data.newPin), 0);
  audit({ userId: req.user!.id, username: req.user!.username, action: "ANESTH_PIN_CHANGED", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip });
  res.json({ ok: true });
});

// ---- Gestión (solo administrador) ----
anesthesiologistsRouter.get("/", requireAdmin, async (_req, res) => {
  if (!ensureEnabled(res)) return;
  const list = await anesthesiologists.all();
  const now = Date.now();
  res.json({
    anesthesiologists: list.map((a) => ({
      id: a.id,
      fullName: a.full_name,
      colegiado: a.colegiado,
      title: a.title,
      active: a.active,
      mustChangePin: a.must_change_pin,
      locked: !!a.locked_until && new Date(a.locked_until).getTime() > now,
    })),
  });
});

anesthesiologistsRouter.post("/", requireAdmin, csrfGuard, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const parsed = createAnesthesiologistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", detail: parsed.error.issues[0]?.message });
    return;
  }
  const pin = generatePin();
  const id = newId();
  await anesthesiologists.insert({
    id,
    fullName: parsed.data.fullName.trim(),
    colegiado: parsed.data.colegiado.trim(),
    title: parsed.data.title ?? "Dr./Dra.",
    pinHash: await hashPin(pin),
    createdAt: new Date().toISOString(),
  });
  audit({ userId: req.user!.id, username: req.user!.username, action: "ANESTH_CREATED", targetType: "anesthesiologist", targetId: parsed.data.fullName, ip: req.ip });
  // El PIN provisional se devuelve UNA sola vez para que el administrador lo comunique.
  res.status(201).json({ ok: true, id, pin });
});

anesthesiologistsRouter.patch("/:id", requireAdmin, csrfGuard, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const parsed = updateAnesthesiologistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const a = await anesthesiologists.byId(req.params.id);
  if (!a) {
    res.status(404).json({ error: "Anestesiólogo no encontrado" });
    return;
  }
  await anesthesiologists.update(a.id, parsed.data);
  audit({ userId: req.user!.id, username: req.user!.username, action: "ANESTH_UPDATED", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip });
  res.json({ ok: true });
});

anesthesiologistsRouter.post("/:id/active", requireAdmin, csrfGuard, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const active = (req.body?.active ?? null) === true || req.body?.active === false ? !!req.body.active : null;
  if (active === null) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const a = await anesthesiologists.byId(req.params.id);
  if (!a) {
    res.status(404).json({ error: "Anestesiólogo no encontrado" });
    return;
  }
  await anesthesiologists.setActive(a.id, active ? 1 : 0);
  audit({ userId: req.user!.id, username: req.user!.username, action: active ? "ANESTH_ENABLED" : "ANESTH_DISABLED", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip });
  res.json({ ok: true });
});

// El administrador genera un PIN provisional nuevo (p. ej. si el anestesiólogo lo olvidó).
anesthesiologistsRouter.post("/:id/reset-pin", requireAdmin, csrfGuard, async (req, res) => {
  if (!ensureEnabled(res)) return;
  const a = await anesthesiologists.byId(req.params.id);
  if (!a) {
    res.status(404).json({ error: "Anestesiólogo no encontrado" });
    return;
  }
  const pin = generatePin();
  await anesthesiologists.setPin(a.id, await hashPin(pin), 1);
  audit({ userId: req.user!.id, username: req.user!.username, action: "ANESTH_PIN_RESET", targetType: "anesthesiologist", targetId: a.full_name, ip: req.ip });
  res.json({ ok: true, pin });
});
