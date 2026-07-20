import { Router } from "express";
import { audit } from "../db";
import { users } from "../repo";
import { authGuard, csrfGuard, requireAdmin } from "../middleware";
import { hashPassword, validatePasswordStrength } from "../auth";
import { newId } from "../domain";
import { createUserSchema, resetPasswordSchema, setActiveSchema } from "../validation";

export const usersRouter = Router();

usersRouter.use(authGuard, requireAdmin);

usersRouter.get("/", async (_req, res) => {
  res.json({ users: await users.all() });
});

usersRouter.post("/", csrfGuard, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos", detail: parsed.error.issues[0]?.message });
    return;
  }
  const { username, displayName, role, location, password } = parsed.data;
  if (await users.byUsername(username)) {
    res.status(409).json({ error: "El usuario ya existe" });
    return;
  }
  const weak = validatePasswordStrength(password);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }
  const hash = await hashPassword(password);
  await users.insert({
    id: newId(),
    username,
    display_name: displayName,
    role,
    location: location ?? null,
    password_hash: hash,
    must_change_password: 1,
    created_at: new Date().toISOString(),
  });
  audit({ userId: req.user!.id, username: req.user!.username, action: "USER_CREATED", targetType: "user", targetId: username, ip: req.ip });
  res.status(201).json({ ok: true });
});

usersRouter.post("/:id/reset-password", csrfGuard, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos" });
    return;
  }
  const target = await users.byId(req.params.id);
  if (!target) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const weak = validatePasswordStrength(parsed.data.password);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }
  const hash = await hashPassword(parsed.data.password);
  await users.adminResetPassword(target.id, hash);
  audit({ userId: req.user!.id, username: req.user!.username, action: "USER_PASSWORD_RESET", targetType: "user", targetId: target.username, ip: req.ip });
  res.json({ ok: true });
});

usersRouter.post("/:id/active", csrfGuard, async (req, res) => {
  const parsed = setActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos" });
    return;
  }
  const target = await users.byId(req.params.id);
  if (!target) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  if (target.username === "admin" && !parsed.data.active) {
    res.status(400).json({ error: "No se puede desactivar el usuario admin" });
    return;
  }
  await users.setActive(target.id, parsed.data.active ? 1 : 0);
  audit({
    userId: req.user!.id,
    username: req.user!.username,
    action: parsed.data.active ? "USER_ENABLED" : "USER_DISABLED",
    targetType: "user",
    targetId: target.username,
    ip: req.ip,
  });
  res.json({ ok: true });
});
