import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === "production";

// El secreto JWT DEBE venir de entorno en produccion. En desarrollo se genera uno efimero.
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) {
    throw new Error("JWT_SECRET es obligatorio en produccion. Configura un secreto largo y aleatorio.");
  }
  jwtSecret = crypto.randomBytes(48).toString("hex");
  // eslint-disable-next-line no-console
  console.warn("[config] JWT_SECRET no definido: usando secreto efimero de desarrollo.");
}

const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const config = {
  isProd,
  port: parseInt(process.env.PORT ?? "8080", 10),
  jwtSecret,
  // Duracion de la sesion (por defecto una jornada de 12 h)
  sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS ?? String(12 * 60 * 60), 10),
  // Inactividad maxima antes de exigir re-login (frontend + validacion)
  inactivityTimeoutSeconds: parseInt(process.env.INACTIVITY_TIMEOUT_SECONDS ?? String(30 * 60), 10),
  cookieName: "ah_session",
  csrfCookieName: "ah_csrf",
  dataDir,
  dbFile: path.join(dataDir, "aneshealth.db"),
  credentialsFile: path.join(dataDir, "INITIAL_CREDENTIALS.txt"),
  // Origen permitido para CORS. Por defecto mismo-origen (frontend servido por el backend).
  corsOrigin: process.env.CORS_ORIGIN ?? "",
  // Politica de retencion (autoborrado)
  retentionDays: parseInt(process.env.RETENTION_DAYS ?? "15", 10),
  // Bloqueo por intentos fallidos
  maxFailedLogins: parseInt(process.env.MAX_FAILED_LOGINS ?? "5", 10),
  lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES ?? "15", 10),
  // Fuerza de bcrypt
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10),
  // Semillas opcionales de contrasenas (si no, se generan y se escriben en credentialsFile)
  seed: {
    adminPassword: process.env.ADMIN_PASSWORD,
    clinicalPasswordPrefix: process.env.CLINICAL_PASSWORD_PREFIX,
  },
  required,
};
