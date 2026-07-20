import { db } from "./db";
import type { Role } from "./auth";

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  location: string | null;
  password_hash: string;
  must_change_password: number;
  active: number;
  token_version: number;
  failed_attempts: number;
  locked_until: string | null;
  last_login: string | null;
  created_at: string;
}

export interface CaseFull {
  case_id: string;
  ia: string;
  year: number;
  ordinal: number;
  owner_user_id: string;
  owner_location: string | null;
  status: "active" | "closed" | "signed";
  created_at: string;
  last_activity: string;
  closed_at: string | null;
  signed_at: string | null;
  signed_by: string | null;
}

export interface EventRow {
  seq: number;
  event_id: string;
  case_id: string;
  type: string;
  occurred_at: string;
  recorded_at: string;
  actor_user_id: string;
  actor_name: string;
  payload: string;
  corrects_event_id: string | null;
  prev_hash: string | null;
  hash: string;
}

export const users = {
  byUsername: db.prepare<[string], UserRow>(`SELECT * FROM users WHERE username = ?`),
  byId: db.prepare<[string], UserRow>(`SELECT * FROM users WHERE id = ?`),
  all: db.prepare(`SELECT id, username, display_name, role, location, active, must_change_password, last_login, created_at FROM users ORDER BY role DESC, username`),
  insert: db.prepare(
    `INSERT INTO users (id, username, display_name, role, location, password_hash, must_change_password, active, token_version, failed_attempts, created_at)
     VALUES (@id, @username, @display_name, @role, @location, @password_hash, @must_change_password, 1, 0, 0, @created_at)`,
  ),
  setPassword: db.prepare(
    `UPDATE users SET password_hash = @hash, must_change_password = 0, token_version = token_version + 1 WHERE id = @id`,
  ),
  adminResetPassword: db.prepare(
    `UPDATE users SET password_hash = @hash, must_change_password = 1, token_version = token_version + 1, failed_attempts = 0, locked_until = NULL WHERE id = @id`,
  ),
  setActive: db.prepare(`UPDATE users SET active = @active, token_version = token_version + 1 WHERE id = @id`),
  recordLoginSuccess: db.prepare(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = @at WHERE id = @id`,
  ),
  recordLoginFailure: db.prepare(
    `UPDATE users SET failed_attempts = failed_attempts + 1, locked_until = @lockedUntil WHERE id = @id`,
  ),
  count: db.prepare<[], { n: number }>(`SELECT COUNT(*) as n FROM users`),
};

export const cases = {
  insert: db.prepare(
    `INSERT INTO cases (case_id, ia, year, ordinal, owner_user_id, owner_location, status, created_at, last_activity)
     VALUES (@case_id, @ia, @year, @ordinal, @owner_user_id, @owner_location, 'active', @created_at, @last_activity)`,
  ),
  byId: db.prepare<[string], CaseFull>(`SELECT * FROM cases WHERE case_id = ?`),
  all: db.prepare<[], CaseFull>(`SELECT * FROM cases ORDER BY last_activity DESC`),
  touch: db.prepare(`UPDATE cases SET last_activity = @at WHERE case_id = @case_id`),
  setStatus: db.prepare(
    `UPDATE cases SET status = @status, closed_at = @closed_at, signed_at = @signed_at, signed_by = @signed_by, last_activity = @at WHERE case_id = @case_id`,
  ),
  delete: db.prepare(`DELETE FROM cases WHERE case_id = ?`),
  expired: db.prepare<[string], CaseFull>(`SELECT * FROM cases WHERE last_activity < ?`),
};

export const events = {
  insert: db.prepare(
    `INSERT INTO events (event_id, case_id, type, occurred_at, recorded_at, actor_user_id, actor_name, payload, corrects_event_id, prev_hash, hash)
     VALUES (@event_id, @case_id, @type, @occurred_at, @recorded_at, @actor_user_id, @actor_name, @payload, @corrects_event_id, @prev_hash, @hash)`,
  ),
  byCase: db.prepare<[string], EventRow>(`SELECT * FROM events WHERE case_id = ? ORDER BY seq ASC`),
  lastHash: db.prepare<[string], { hash: string }>(`SELECT hash FROM events WHERE case_id = ? ORDER BY seq DESC LIMIT 1`),
  byEventId: db.prepare<[string], EventRow>(`SELECT * FROM events WHERE event_id = ?`),
};

export const auditRepo = {
  recent: db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT @limit`),
};
