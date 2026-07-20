import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { verifyToken, type AuthUser } from "./auth";
import { users } from "./repo";
import { audit } from "./db";

/** Verifica la sesion (cookie httpOnly con JWT) y adjunta req.user. */
export async function authGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Sesion invalida o expirada" });
      return;
    }
    const row = await users.byId(payload.sub);
    if (!row || row.active !== 1 || row.token_version !== payload.tv) {
      res.status(401).json({ error: "Sesion revocada" });
      return;
    }
    const user: AuthUser = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      location: row.location,
      tokenVersion: row.token_version,
      mustChangePassword: row.must_change_password === 1,
    };
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Proteccion CSRF (double-submit) para metodos que mutan estado. */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }
  const cookieToken = req.cookies?.[config.csrfCookieName];
  const headerToken = req.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: "Token CSRF invalido" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    audit({
      userId: req.user?.id,
      username: req.user?.username,
      action: "FORBIDDEN",
      targetType: "route",
      targetId: req.path,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      success: false,
    });
    res.status(403).json({ error: "Requiere rol de administrador" });
    return;
  }
  next();
}

/** Debe cambiar la contrasena antes de operar (salvo en las rutas de auth). */
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.mustChangePassword) {
    res.status(403).json({ error: "Debe cambiar la contrasena antes de continuar", code: "MUST_CHANGE_PASSWORD" });
    return;
  }
  next();
}

// Limitador global (proteccion basica frente a abuso).
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Limitador estricto para el login (anti fuerza bruta).
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Intentalo mas tarde." },
});

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "No encontrado" });
}

// Manejo de errores: no filtra detalles internos al cliente.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  res.status(500).json({ error: "Error interno del servidor" });
}
