import { query } from "./db";
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

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  location: string | null;
  active: number;
  must_change_password: number;
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
  seq: string;
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

export interface NewUser {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  location: string | null;
  password_hash: string;
  must_change_password: number;
  created_at: string;
}

export const users = {
  async byUsername(username: string): Promise<UserRow | undefined> {
    return (await query<UserRow>(`SELECT * FROM users WHERE username=$1`, [username])).rows[0];
  },
  async byId(id: string): Promise<UserRow | undefined> {
    return (await query<UserRow>(`SELECT * FROM users WHERE id=$1`, [id])).rows[0];
  },
  async all(): Promise<AdminUserRow[]> {
    return (
      await query<AdminUserRow>(
        `SELECT id, username, display_name, role, location, active, must_change_password, last_login, created_at
         FROM users ORDER BY role DESC, username`,
      )
    ).rows;
  },
  async insert(u: NewUser): Promise<void> {
    await query(
      `INSERT INTO users (id, username, display_name, role, location, password_hash, must_change_password, active, token_version, failed_attempts, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,0,0,$8)`,
      [u.id, u.username, u.display_name, u.role, u.location, u.password_hash, u.must_change_password, u.created_at],
    );
  },
  async setPassword(id: string, hash: string): Promise<void> {
    await query(`UPDATE users SET password_hash=$1, must_change_password=0, token_version=token_version+1 WHERE id=$2`, [hash, id]);
  },
  async adminResetPassword(id: string, hash: string): Promise<void> {
    await query(
      `UPDATE users SET password_hash=$1, must_change_password=1, token_version=token_version+1, failed_attempts=0, locked_until=NULL WHERE id=$2`,
      [hash, id],
    );
  },
  async setActive(id: string, active: number): Promise<void> {
    await query(`UPDATE users SET active=$1, token_version=token_version+1 WHERE id=$2`, [active, id]);
  },
  async recordLoginSuccess(id: string, at: string): Promise<void> {
    await query(`UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=$1 WHERE id=$2`, [at, id]);
  },
  async recordLoginFailure(id: string, lockedUntil: string | null): Promise<void> {
    await query(`UPDATE users SET failed_attempts=failed_attempts+1, locked_until=$1 WHERE id=$2`, [lockedUntil, id]);
  },
  async count(): Promise<number> {
    return (await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users`)).rows[0].n;
  },
};

export const cases = {
  async byId(id: string): Promise<CaseFull | undefined> {
    return (await query<CaseFull>(`SELECT * FROM cases WHERE case_id=$1`, [id])).rows[0];
  },
  async all(): Promise<CaseFull[]> {
    return (await query<CaseFull>(`SELECT * FROM cases ORDER BY last_activity DESC`)).rows;
  },
  async touch(caseId: string, at: string): Promise<void> {
    await query(`UPDATE cases SET last_activity=$1 WHERE case_id=$2`, [at, caseId]);
  },
  async delete(id: string): Promise<void> {
    await query(`DELETE FROM cases WHERE case_id=$1`, [id]);
  },
  async expired(cutoff: string): Promise<CaseFull[]> {
    return (await query<CaseFull>(`SELECT * FROM cases WHERE last_activity < $1`, [cutoff])).rows;
  },
};

export const events = {
  async byCase(id: string): Promise<EventRow[]> {
    return (await query<EventRow>(`SELECT * FROM events WHERE case_id=$1 ORDER BY seq ASC`, [id])).rows;
  },
  async byEventId(id: string): Promise<EventRow | undefined> {
    return (await query<EventRow>(`SELECT * FROM events WHERE event_id=$1`, [id])).rows[0];
  },
};

export const auditRepo = {
  async recent(limit: number): Promise<Record<string, unknown>[]> {
    return (await query(`SELECT * FROM audit_log ORDER BY id DESC LIMIT $1`, [limit])).rows;
  },
};
