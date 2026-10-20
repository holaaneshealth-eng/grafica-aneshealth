import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// Neon exige SSL; en local (docker) sin SSL.
const isLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
});

// CRÍTICO: sin este manejador, un error en una conexión inactiva (p.ej. cuando Neon
// suspende la base de datos por inactividad y cierra las conexiones) provoca un error
// no capturado que TUMBA el proceso (exit 1). Con el manejador, el pool descarta esa
// conexión y el servicio sigue vivo.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] conexión inactiva del pool con error (recuperable):", err.message);
});

function isTransient(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  const code = (err as { code?: string })?.code ?? "";
  return (
    /terminat|connection|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|server closed|Connection terminated/i.test(msg) ||
    ["57P01", "57P02", "57P03", "08006", "08003", "08000", "ECONNRESET", "ETIMEDOUT"].includes(code)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  // Reintento suave: Neon puede tardar en "despertar" tras suspenderse.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await pool.query<T>(text, params as never[]);
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === 2) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Ejecuta una funcion dentro de una transaccion (BEGIN/COMMIT/ROLLBACK). */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* la conexión puede estar rota; se ignora */
    }
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','clinical')),
    location TEXT,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cases (
    case_id TEXT PRIMARY KEY,
    ia TEXT UNIQUE NOT NULL,
    year INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES users(id),
    owner_location TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','signed')),
    created_at TEXT NOT NULL,
    last_activity TEXT NOT NULL,
    closed_at TEXT,
    signed_at TEXT,
    signed_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_cases_activity ON cases(last_activity);

  CREATE TABLE IF NOT EXISTS events (
    seq BIGSERIAL PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    payload TEXT NOT NULL,
    corrects_event_id TEXT,
    prev_hash TEXT,
    hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, seq);

  CREATE TABLE IF NOT EXISTS ordinal_counter (
    year INTEGER PRIMARY KEY,
    last_ordinal INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TEXT NOT NULL,
    user_id TEXT,
    username TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    ip TEXT,
    user_agent TEXT,
    detail TEXT,
    success INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}

// Estado de funciones opcionales que dependen de una migración que puede fallar sin
// tumbar el servidor. `photos` controla la Vía 1 (fotos del monitor); `customDrugs`,
// el catálogo compartido de fármacos añadidos a mano.
export const dbFeatures = { photos: false, customDrugs: false, labor: false };

// Esquema de la tabla de fotos del monitor (Vía 1). Idempotente (IF NOT EXISTS).
// Se migra APARTE y de forma NO fatal: si falla, el servidor arranca igualmente y la
// Vía 1 queda desactivada (dbFeatures.photos = false), registrándose el error.
const CASE_PHOTOS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS case_photos (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    taken_at TEXT NOT NULL,
    mime TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_case_photos_case ON case_photos(case_id, taken_at);
`;

export async function migrateCasePhotos(): Promise<void> {
  try {
    await pool.query(CASE_PHOTOS_SCHEMA);
    dbFeatures.photos = true;
    // eslint-disable-next-line no-console
    console.log("[db] tabla case_photos lista (Vía 1 de fotos activada).");
  } catch (err) {
    dbFeatures.photos = false;
    // eslint-disable-next-line no-console
    console.error("[db] no se pudo crear case_photos; la Vía 1 (fotos del monitor) queda DESACTIVADA:", (err as Error).message);
  }
}

// Esquema del catálogo compartido de fármacos añadidos a mano. Se migra APARTE y de
// forma NO fatal (igual que case_photos): si falla, el servidor arranca igualmente y la
// app sigue funcionando con el catálogo fijo (dbFeatures.customDrugs = false).
const CUSTOM_DRUGS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS custom_drugs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT 'Otro',
    default_unit TEXT NOT NULL DEFAULT 'mg',
    common_bolus TEXT,
    infusion_dose_unit TEXT,
    conc_vol INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_drugs_name ON custom_drugs (LOWER(name));
`;

export async function migrateCustomDrugs(): Promise<void> {
  try {
    await pool.query(CUSTOM_DRUGS_SCHEMA);
    dbFeatures.customDrugs = true;
    // eslint-disable-next-line no-console
    console.log("[db] tabla custom_drugs lista (catálogo de fármacos a mano activado).");
  } catch (err) {
    dbFeatures.customDrugs = false;
    // eslint-disable-next-line no-console
    console.error("[db] no se pudo crear custom_drugs; el catálogo de fármacos a mano queda DESACTIVADO:", (err as Error).message);
  }
}

// Esquema de la analgesia de parto: columnas nuevas en `cases` (los casos existentes
// quedan como 'quirofano') y la tabla de ajustes. Idempotente y NO fatal (como case_photos):
// si falla, el servidor arranca igualmente y el tipo de caso "Analgesia de parto" y los
// ajustes configurables quedan desactivados (dbFeatures.labor = false).
const LABOR_SCHEMA = `
  ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_type TEXT NOT NULL DEFAULT 'quirofano';
  ALTER TABLE cases ADD COLUMN IF NOT EXISTS labor_loading_at TEXT;
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export async function migrateLabor(): Promise<void> {
  try {
    await pool.query(LABOR_SCHEMA);
    dbFeatures.labor = true;
    // eslint-disable-next-line no-console
    console.log("[db] columnas de parto y app_settings listas (Analgesia de parto activada).");
  } catch (err) {
    dbFeatures.labor = false;
    // eslint-disable-next-line no-console
    console.error("[db] no se pudieron crear las columnas de parto/app_settings; la Analgesia de parto queda DESACTIVADA:", (err as Error).message);
  }
}

export interface AuditInput {
  userId?: string | null;
  username?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
  success?: boolean;
}

// Auditoria "fire-and-forget": no bloquea la peticion; los errores se registran.
export function audit(a: AuditInput): void {
  pool
    .query(
      `INSERT INTO audit_log (at, user_id, username, action, target_type, target_id, ip, user_agent, detail, success)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        new Date().toISOString(),
        a.userId ?? null,
        a.username ?? null,
        a.action,
        a.targetType ?? null,
        a.targetId ?? null,
        a.ip ?? null,
        a.userAgent ?? null,
        a.detail ?? null,
        a.success === false ? 0 : 1,
      ],
    )
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[audit] fallo al registrar:", err);
    });
}
