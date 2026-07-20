import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

// Neon exige SSL; en local (docker) sin SSL.
const isLocal = /localhost|127\.0\.0\.1/.test(config.databaseUrl);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool.query<T>(text, params as never[]);
  return { rows: res.rows, rowCount: res.rowCount ?? 0 };
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
    await client.query("ROLLBACK");
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
