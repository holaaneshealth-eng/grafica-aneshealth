import { Router } from "express";
import { config } from "../config";
import { audit, dbFeatures } from "../db";
import { users } from "../repo";
import {
  hashPassword,
  verifyPassword,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  issueCsrf,
  validatePasswordStrength,
  generateSessionId,
  type AuthUser,
} from "../auth";
import { authGuard, loginLimiter } from "../middleware";
import { loginSchema, changePasswordSchema } from "../validation";

export const authRouter = Router();

function publicUser(u: AuthUser) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    location: u.location,
    mustChangePassword: u.mustChangePassword,
  };
}

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos" });
    return;
  }
  const { username, password } = parsed.data;
  const meta = { ip: req.ip, userAgent: req.get("user-agent") };
  const row = await users.byUsername(username);

  // Respuesta generica para no revelar si el usuario existe.
  const genericFail = () => {
    audit({ username, action: "LOGIN_FAILED", ...meta, success: false });
    res.status(401).json({ error: "Credenciales invalidas" });
  };

  if (!row || row.active !== 1) {
    // Igualamos coste temporal aproximado.
    await verifyPassword(password, "$2a$12$0000000000000000000000000000000000000000000000000000");
    genericFail();
    return;
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    audit({ userId: row.id, username, action: "LOGIN_LOCKED", ...meta, success: false });
    res.status(429).json({ error: "Cuenta bloqueada temporalmente por intentos fallidos" });
    return;
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    const attempts = row.failed_attempts + 1;
    const lockedUntil =
      attempts >= config.maxFailedLogins ? new Date(Date.now() + config.lockoutMinutes * 60000).toISOString() : null;
    await users.recordLoginFailure(row.id, lockedUntil);
    genericFail();
    return;
  }

  // Sesión única por cuenta (C1): una sesión solo cuenta como abierta si tuvo actividad en
  // los últimos `inactivityTimeoutSeconds` (30 min). Si hay una activa en otro dispositivo y
  // no se fuerza, se avisa (409) con la hora de inicio; si se fuerza, se desplaza (auditado).
  const singleSession = config.singleSessionEnabled && dbFeatures.singleSession;
  let sessionId: string | undefined;
  if (singleSession) {
    const lastAct = row.session_last_activity ? new Date(row.session_last_activity).getTime() : 0;
    const activeElsewhere = !!row.current_session_id && Date.now() - lastAct < config.inactivityTimeoutSeconds * 1000;
    const force = (req.body as { force?: unknown })?.force === true;
    if (activeElsewhere && !force) {
      audit({ userId: row.id, username, action: "LOGIN_BLOCKED_SESSION", ...meta, success: false });
      res.status(409).json({ error: "La cuenta está abierta en otro dispositivo", code: "SESSION_ACTIVE_ELSEWHERE", since: row.last_login });
      return;
    }
    if (activeElsewhere && force) {
      audit({ userId: row.id, username, action: "FORCED_LOGOUT_OTHER_DEVICE", ...meta });
    }
    sessionId = generateSessionId();
  }

  const now = new Date().toISOString();
  await users.recordLoginSuccess(row.id, now);
  if (singleSession && sessionId) await users.setSession(row.id, sessionId, now);
  const token = signToken({ id: row.id, username: row.username, role: row.role, tokenVersion: row.token_version, sessionId });
  setSessionCookie(res, token);
  const csrf = issueCsrf(res);
  audit({ userId: row.id, username, action: "LOGIN_OK", ...meta });

  const user: AuthUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    location: row.location,
    tokenVersion: row.token_version,
    mustChangePassword: row.must_change_password === 1,
  };
  res.json({ user: publicUser(user), csrfToken: csrf });
});

authRouter.post("/logout", authGuard, async (req, res) => {
  clearSessionCookie(res);
  res.clearCookie(config.csrfCookieName, { path: "/" });
  // Libera la sesión en el servidor (C1): deja la cuenta disponible para otro dispositivo.
  if (config.singleSessionEnabled && dbFeatures.singleSession && req.user!.sessionId) {
    await users.clearSession(req.user!.id, req.user!.sessionId);
  }
  audit({ userId: req.user!.id, username: req.user!.username, action: "LOGOUT", ip: req.ip });
  res.json({ ok: true });
});

authRouter.get("/me", authGuard, (req, res) => {
  const csrf = issueCsrf(res);
  res.json({ user: publicUser(req.user!), csrfToken: csrf });
});

authRouter.post("/change-password", authGuard, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos invalidos" });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const row = await users.byId(req.user!.id);
  if (!row) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const ok = await verifyPassword(currentPassword, row.password_hash);
  if (!ok) {
    audit({ userId: row.id, username: row.username, action: "PASSWORD_CHANGE_FAILED", ip: req.ip, success: false });
    res.status(401).json({ error: "La contrasena actual no es correcta" });
    return;
  }
  const weak = validatePasswordStrength(newPassword);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }
  const hash = await hashPassword(newPassword);
  await users.setPassword(row.id, hash);
  clearSessionCookie(res); // invalida la sesion actual (token_version incrementado)
  audit({ userId: row.id, username: row.username, action: "PASSWORD_CHANGED", ip: req.ip });
  res.json({ ok: true });
});
