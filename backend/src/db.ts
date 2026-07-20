import Database from "better-sqlite3";
import { config } from "./config";

export const db = new Database(config.dbFile);

// Ajustes de robustez y concurrencia.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

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
      owner_user_id TEXT NOT NULL,
      owner_location TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','signed')),
      created_at TEXT NOT NULL,
      last_activity TEXT NOT NULL,
      closed_at TEXT,
      signed_at TEXT,
      signed_by TEXT,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_cases_activity ON cases(last_activity);

    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      case_id TEXT NOT NULL,
      type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      corrects_event_id TEXT,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, seq);

    CREATE TABLE IF NOT EXISTS ordinal_counter (
      year INTEGER PRIMARY KEY,
      last_ordinal INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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

// El esquema se crea al cargar el modulo, ANTES de preparar cualquier statement.
db.exec(SCHEMA);

// Se mantiene por compatibilidad; es idempotente.
export function migrate(): void {
  db.exec(SCHEMA);
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

const auditStmt = db.prepare(
  `INSERT INTO audit_log (at, user_id, username, action, target_type, target_id, ip, user_agent, detail, success)
   VALUES (@at, @userId, @username, @action, @targetType, @targetId, @ip, @userAgent, @detail, @success)`,
);

export function audit(a: AuditInput): void {
  auditStmt.run({
    at: new Date().toISOString(),
    userId: a.userId ?? null,
    username: a.username ?? null,
    action: a.action,
    targetType: a.targetType ?? null,
    targetId: a.targetId ?? null,
    ip: a.ip ?? null,
    userAgent: a.userAgent ?? null,
    detail: a.detail ?? null,
    success: a.success === false ? 0 : 1,
  });
}
