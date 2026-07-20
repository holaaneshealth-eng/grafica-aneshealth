import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Response } from "express";
import { config } from "./config";

export type Role = "admin" | "clinical";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  location: string | null;
  tokenVersion: number;
  mustChangePassword: boolean;
}

interface TokenPayload {
  sub: string;
  username: string;
  role: Role;
  tv: number;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: { id: string; username: string; role: Role; tokenVersion: number }): string {
  const payload: TokenPayload = { sub: user.id, username: user.username, role: user.role, tv: user.tokenVersion };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.sessionTtlSeconds, algorithm: "HS256" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as TokenPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "strict",
    path: "/",
    maxAge: config.sessionTtlSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, { path: "/" });
}

/** Genera y fija el token CSRF (patron double-submit). No es httpOnly a proposito. */
export function issueCsrf(res: Response): string {
  const token = crypto.randomBytes(24).toString("hex");
  res.cookie(config.csrfCookieName, token, {
    httpOnly: false,
    secure: config.isProd,
    sameSite: "strict",
    path: "/",
    maxAge: config.sessionTtlSeconds * 1000,
  });
  return token;
}

/** Politica minima de contrasena. */
export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "La contrasena debe tener al menos 10 caracteres.";
  if (!/[a-z]/.test(pw)) return "Debe incluir al menos una minuscula.";
  if (!/[A-Z]/.test(pw)) return "Debe incluir al menos una mayuscula.";
  if (!/[0-9]/.test(pw)) return "Debe incluir al menos un numero.";
  return null;
}

/** Contrasena aleatoria fuerte y legible para el seed inicial. */
export function generatePassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  let pw = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 9; i++) pw += pick(all);
  // Mezcla
  return pw
    .split("")
    .sort(() => crypto.randomInt(3) - 1)
    .join("");
}
