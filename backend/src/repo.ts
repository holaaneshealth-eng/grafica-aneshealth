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
  current_session_id?: string | null;
  session_last_activity?: string | null;
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
  case_type: string | null;
  labor_loading_at: string | null;
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
  // ---- Sesión única por cuenta (C1) ----
  async setSession(id: string, sid: string, at: string): Promise<void> {
    await query(`UPDATE users SET current_session_id=$2, session_last_activity=$3 WHERE id=$1`, [id, sid, at]);
  },
  // Actualiza la última actividad de la sesión (limitado: solo si el valor guardado es más
  // antiguo que `staleBefore`, para no escribir en cada petición).
  async touchSession(id: string, at: string, staleBefore: string): Promise<void> {
    await query(
      `UPDATE users SET session_last_activity=$2 WHERE id=$1 AND (session_last_activity IS NULL OR session_last_activity < $3)`,
      [id, at, staleBefore],
    );
  },
  // Libera la sesión al cerrar sesión (solo si sigue siendo la sesión actual).
  async clearSession(id: string, sid: string): Promise<void> {
    await query(`UPDATE users SET current_session_id=NULL, session_last_activity=NULL WHERE id=$1 AND current_session_id=$2`, [id, sid]);
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
  // Primer caso ACTIVO (sin cerrar) de un propietario (C2: un solo caso activo por cuenta).
  async activeByOwner(ownerUserId: string): Promise<CaseFull | undefined> {
    return (await query<CaseFull>(`SELECT * FROM cases WHERE owner_user_id=$1 AND status='active' ORDER BY created_at LIMIT 1`, [ownerUserId])).rows[0];
  },
  async delete(id: string): Promise<void> {
    await query(`DELETE FROM cases WHERE case_id=$1`, [id]);
  },
  async expired(cutoff: string): Promise<CaseFull[]> {
    return (await query<CaseFull>(`SELECT * FROM cases WHERE last_activity < $1`, [cutoff])).rows;
  },
  // Casos BORRABLES por retención: solo los FIRMADOS y ya ENVIADOS por correo (ok) para su
  // firma vigente, y pasado el plazo. Se EXCLUYEN así los casos sin firmar y los firmados
  // pendientes de envío (se conservan hasta enviarse / borrado manual).
  async purgeable(cutoff: string): Promise<CaseFull[]> {
    return (
      await query<CaseFull>(
        `SELECT c.* FROM cases c
         WHERE c.last_activity < $1
           AND c.status = 'signed'
           AND c.signed_at IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM events e
             WHERE e.case_id = c.case_id
               AND e.type = 'SHEET_EMAILED'
               AND (e.payload::jsonb ->> 'ok') = 'true'
               AND e.occurred_at >= c.signed_at
           )`,
        [cutoff],
      )
    ).rows;
  },
};

export interface CasePhotoMeta {
  id: string;
  taken_at: string;
  mime: string;
  byte_size: number;
}

export const casePhotos = {
  async insert(p: { id: string; caseId: string; takenAt: string; mime: string; byteSize: number; data: Buffer; createdAt: string }): Promise<void> {
    await query(
      `INSERT INTO case_photos (id, case_id, taken_at, mime, byte_size, data, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [p.id, p.caseId, p.takenAt, p.mime, p.byteSize, p.data, p.createdAt],
    );
  },
  async listMeta(caseId: string): Promise<CasePhotoMeta[]> {
    return (
      await query<CasePhotoMeta>(
        `SELECT id, taken_at, mime, byte_size FROM case_photos WHERE case_id=$1 ORDER BY taken_at ASC`,
        [caseId],
      )
    ).rows;
  },
  async get(id: string): Promise<{ data: Buffer; mime: string; case_id: string } | undefined> {
    return (await query<{ data: Buffer; mime: string; case_id: string }>(`SELECT data, mime, case_id FROM case_photos WHERE id=$1`, [id])).rows[0];
  },
  async remove(id: string): Promise<void> {
    await query(`DELETE FROM case_photos WHERE id=$1`, [id]);
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

export interface AnesthesiologistRow {
  id: string;
  full_name: string;
  colegiado: string;
  title: string;
  active: number;
  pin_hash: string | null;
  must_change_pin: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

// Vista para el administrador (sin el hash del PIN).
export interface AnesthesiologistAdminRow {
  id: string;
  full_name: string;
  colegiado: string;
  title: string;
  active: number;
  must_change_pin: number;
  locked_until: string | null;
  created_at: string;
}

// Vista para selección (firma / responsable): solo los activos y lo imprescindible.
export interface AnesthesiologistSelectable {
  id: string;
  full_name: string;
  colegiado: string;
  title: string;
}

export const anesthesiologists = {
  async all(): Promise<AnesthesiologistAdminRow[]> {
    return (
      await query<AnesthesiologistAdminRow>(
        `SELECT id, full_name, colegiado, title, active, must_change_pin, locked_until, created_at
         FROM anesthesiologists ORDER BY active DESC, full_name`,
      )
    ).rows;
  },
  async selectable(): Promise<AnesthesiologistSelectable[]> {
    return (
      await query<AnesthesiologistSelectable>(
        `SELECT id, full_name, colegiado, title FROM anesthesiologists WHERE active=1 ORDER BY full_name`,
      )
    ).rows;
  },
  async byId(id: string): Promise<AnesthesiologistRow | undefined> {
    return (await query<AnesthesiologistRow>(`SELECT * FROM anesthesiologists WHERE id=$1`, [id])).rows[0];
  },
  async insert(a: { id: string; fullName: string; colegiado: string; title: string; pinHash: string; createdAt: string }): Promise<void> {
    await query(
      `INSERT INTO anesthesiologists (id, full_name, colegiado, title, active, pin_hash, must_change_pin, failed_attempts, created_at, updated_at)
       VALUES ($1,$2,$3,$4,1,$5,1,0,$6,$6)`,
      [a.id, a.fullName, a.colegiado, a.title, a.pinHash, a.createdAt],
    );
  },
  async update(id: string, fields: { fullName?: string; colegiado?: string; title?: string }): Promise<void> {
    await query(
      `UPDATE anesthesiologists
       SET full_name=COALESCE($2, full_name), colegiado=COALESCE($3, colegiado), title=COALESCE($4, title), updated_at=$5
       WHERE id=$1`,
      [id, fields.fullName ?? null, fields.colegiado ?? null, fields.title ?? null, new Date().toISOString()],
    );
  },
  async setActive(id: string, active: number): Promise<void> {
    await query(`UPDATE anesthesiologists SET active=$2, updated_at=$3 WHERE id=$1`, [id, active, new Date().toISOString()]);
  },
  // Fija un PIN nuevo (provisional del admin o cambiado por el propio anestesiólogo) y
  // desbloquea la cuenta. `mustChange`=1 para el PIN provisional; 0 tras cambiarlo.
  async setPin(id: string, pinHash: string, mustChange: number): Promise<void> {
    await query(
      `UPDATE anesthesiologists SET pin_hash=$2, must_change_pin=$3, failed_attempts=0, locked_until=NULL, updated_at=$4 WHERE id=$1`,
      [id, pinHash, mustChange, new Date().toISOString()],
    );
  },
  async recordPinFailure(id: string, attempts: number, lockedUntil: string | null): Promise<void> {
    await query(`UPDATE anesthesiologists SET failed_attempts=$2, locked_until=$3, updated_at=$4 WHERE id=$1`, [
      id,
      attempts,
      lockedUntil,
      new Date().toISOString(),
    ]);
  },
  async recordPinSuccess(id: string): Promise<void> {
    await query(`UPDATE anesthesiologists SET failed_attempts=0, locked_until=NULL, updated_at=$2 WHERE id=$1`, [id, new Date().toISOString()]);
  },
};

export interface CustomDrugRow {
  id: string;
  name: string;
  group_name: string;
  default_unit: string;
  common_bolus: string | null; // JSON array de números
  infusion_dose_unit: string | null;
  conc_vol: number;
  created_by: string | null;
  created_at: string;
}

export interface NewCustomDrug {
  id: string;
  name: string;
  group: string;
  defaultUnit: string;
  commonBolus: number[] | null;
  infusionDoseUnit: string | null;
  concVol: boolean;
  createdBy: string | null;
  createdAt: string;
}

// Catálogo de fármacos "Otro fármaco" añadidos por los usuarios (compartido entre todos).
export const appSettings = {
  async all(): Promise<{ key: string; value: string }[]> {
    return (await query<{ key: string; value: string }>(`SELECT key, value FROM app_settings`)).rows;
  },
  async set(key: string, value: string): Promise<void> {
    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=$3`,
      [key, value, new Date().toISOString()],
    );
  },
};

export const customDrugs = {
  async all(): Promise<CustomDrugRow[]> {
    return (await query<CustomDrugRow>(`SELECT * FROM custom_drugs ORDER BY name`)).rows;
  },
  async byNameCI(name: string): Promise<CustomDrugRow | undefined> {
    return (await query<CustomDrugRow>(`SELECT * FROM custom_drugs WHERE LOWER(name)=LOWER($1)`, [name])).rows[0];
  },
  async insert(d: NewCustomDrug): Promise<void> {
    await query(
      `INSERT INTO custom_drugs (id, name, group_name, default_unit, common_bolus, infusion_dose_unit, conc_vol, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (LOWER(name)) DO NOTHING`,
      [d.id, d.name, d.group, d.defaultUnit, d.commonBolus ? JSON.stringify(d.commonBolus) : null, d.infusionDoseUnit, d.concVol ? 1 : 0, d.createdBy, d.createdAt],
    );
  },
  async remove(id: string): Promise<void> {
    await query(`DELETE FROM custom_drugs WHERE id=$1`, [id]);
  },
};
