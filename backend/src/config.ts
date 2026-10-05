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

// Base de datos Postgres (Neon). Obligatoria en produccion.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && isProd) {
  throw new Error("DATABASE_URL es obligatorio en produccion (cadena de conexion de Neon/Postgres).");
}

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
  databaseUrl: databaseUrl ?? "postgresql://postgres:postgres@localhost:5432/aneshealth",
  credentialsFile: path.join(dataDir, "INITIAL_CREDENTIALS.txt"),
  // Origen permitido para CORS. Por defecto mismo-origen (frontend servido por el backend).
  corsOrigin: process.env.CORS_ORIGIN ?? "",
  // Politica de retencion (autoborrado)
  retentionDays: parseInt(process.env.RETENTION_DAYS ?? "15", 10),
  // Modo simulacion del autoborrado: por defecto ACTIVADO (no borra nada; solo audita
  // que casos borraria). Para borrar de verdad hay que poner RETENTION_DRY_RUN=false.
  retentionDryRun: (process.env.RETENTION_DRY_RUN ?? "true").toLowerCase() !== "false",
  // Envío de correo (imagen de la hoja anestésica). Usa la API HTTP de Resend.
  mail: {
    resendApiKey: process.env.RESEND_API_KEY ?? "",
    // Remitente verificado en el proveedor. Por defecto el dominio de pruebas de Resend.
    from: process.env.MAIL_FROM ?? "AnesHealth <onboarding@resend.dev>",
    // Destinatario del correo con la imagen adjunta.
    to: process.env.MAIL_TO ?? "adrian.fernandez@ext.vithas.es",
  },
  // Visión: importar constantes desde una foto del monitor. API de Claude (Anthropic).
  vision: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    // Haiku 4.5: barato y suficiente para leer la tabla de tendencias del monitor.
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
  },
  // Bloqueo por intentos fallidos
  maxFailedLogins: parseInt(process.env.MAX_FAILED_LOGINS ?? "5", 10),
  lockoutMinutes: parseInt(process.env.LOCKOUT_MINUTES ?? "15", 10),
  // Fuerza de bcrypt
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10),
  // Semillas opcionales de contrasenas (si no, se generan y se escriben en credentialsFile)
  seed: {
    adminPassword: process.env.ADMIN_PASSWORD,
    clinicalPasswordPrefix: process.env.CLINICAL_PASSWORD_PREFIX,
    // "Break-glass": si se define, restablece la contrasena de 'admin' en cada arranque
    // (sin exigir la politica de fortaleza; es una accion del operador via entorno).
    adminPasswordReset: process.env.ADMIN_PASSWORD_RESET,
  },
  required,
};
