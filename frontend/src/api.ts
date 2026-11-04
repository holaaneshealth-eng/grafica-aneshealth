// Cliente de API. Same-origin: cookies httpOnly para la sesion + token CSRF en cabecera.
export interface ApiUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "clinical";
  location: string | null;
  mustChangePassword: boolean;
}

export interface ApiCase {
  caseId: string;
  ia: string;
  year: number;
  ordinal: number;
  ownerUserId: string;
  ownerLocation: string | null;
  status: "active" | "closed" | "signed";
  caseType?: "quirofano" | "analgesia_parto";
  laborLoadingAt?: string | null;
  createdAt: string;
  lastActivity: string;
  closedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
}

export interface ApiEvent {
  eventId: string;
  caseId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  actor: string;
  actorUserId: string;
  payload: Record<string, unknown>;
  correctsEventId: string | null;
  hash: string;
  prevHash: string | null;
}

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "clinical";
  location: string | null;
  active: number;
  must_change_password: number;
  last_login: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  at: string;
  username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  detail: string | null;
  success: number;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let csrfToken = "";
export function setCsrfToken(t: string): void {
  csrfToken = t;
}

let onUnauthorized: ((code?: string) => void) | null = null;
export function setUnauthorizedHandler(fn: (code?: string) => void): void {
  onUnauthorized = fn;
}

const BASE = (import.meta.env.VITE_API_BASE ?? "") + "/api";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["x-csrf-token"] = csrfToken;

  const res = await fetch(BASE + path, {
    method,
    credentials: "same-origin",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  const j = json as { error?: string; code?: string } | null;
  if (res.status === 401 && onUnauthorized) onUnauthorized(j?.code);
  if (!res.ok) {
    throw new ApiError(j?.error ?? `Error ${res.status}`, res.status, j?.code, json);
  }
  return json as T;
}

// Definición de un fármaco del catálogo personalizado (coincide con DrugDef sin gas/fluid).
export interface ApiCustomDrug {
  name: string;
  group: string;
  defaultUnit: string;
  commonBolus?: number[];
  infusionDoseUnit?: string;
  concVol?: boolean;
}

// Firma personal: anestesiólogos.
export interface ApiAnesthesiologistAdmin {
  id: string;
  fullName: string;
  colegiado: string;
  title: string;
  active: number;
  mustChangePin: number;
  locked: boolean;
}
export interface ApiAnesthesiologist {
  id: string;
  full_name: string;
  colegiado: string;
  title: string;
}

export const api = {
  login: (username: string, password: string, force = false) =>
    request<{ user: ApiUser; csrfToken: string }>("/auth/login", "POST", { username, password, ...(force ? { force: true } : {}) }),
  logout: () => request<{ ok: true }>("/auth/logout", "POST", {}),
  me: () => request<{ user: ApiUser; csrfToken: string }>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", "POST", { currentPassword, newPassword }),

  listCases: () => request<{ cases: ApiCase[] }>("/cases"),
  createCase: (caseType?: "quirofano" | "analgesia_parto") => request<{ case: ApiCase }>("/cases", "POST", { caseType }),
  getSettings: () => request<{ laborFirstTestMin: number; laborReevalMin: number }>("/settings"),
  putSettings: (s: { laborFirstTestMin?: number; laborReevalMin?: number }) => request<{ ok: true }>("/settings", "PUT", s),
  getEvents: (id: string) => request<{ events: ApiEvent[] }>(`/cases/${id}/events`),
  appendEvent: (id: string, ev: { eventId: string; type: string; occurredAt?: string; payload: Record<string, unknown> }) =>
    request<{ event: ApiEvent; deduped: boolean }>(`/cases/${id}/events`, "POST", ev),
  voidEvent: (id: string, targetEventId: string, reason: string) =>
    request<{ ok: true }>(`/cases/${id}/void`, "POST", { targetEventId, reason }),
  deleteCase: (id: string) => request<{ ok: true }>(`/cases/${id}`, "DELETE"),
  // Fotos del monitor (Vía 1)
  addPhoto: (id: string, payload: { imageBase64: string; mimeType: string; takenAt?: string }) =>
    request<{ photo: { id: string; taken_at: string; mime: string; byte_size: number }; event: ApiEvent }>(`/cases/${id}/photos`, "POST", payload),
  listPhotos: (id: string) => request<{ photos: { id: string; taken_at: string; mime: string; byte_size: number }[] }>(`/cases/${id}/photos`),
  deletePhoto: (id: string, photoId: string) => request<{ ok: true }>(`/cases/${id}/photos/${photoId}`, "DELETE"),
  photoUrl: (id: string, photoId: string) => `${BASE}/cases/${id}/photos/${photoId}`,
  sendSheetPdf: (payload: { pdfBase64: string; ia: string; version: number; signedAt?: string }) =>
    request<{ ok: true; to: string; subject: string }>("/mail/send", "POST", payload),
  visionStatus: () => request<{ claudeAvailable: boolean; model: string; photosEnabled: boolean }>("/vision/status"),
  retentionPreview: () =>
    request<{ dryRun: boolean; retentionDays: number; cutoff: string; ok: boolean; error?: string; cases: { ia: string; status: string; lastActivity: string; signedAt: string | null }[] }>(
      "/cases/retention-preview",
    ),
  visionImport: (payload: { imageBase64: string; mimeType: string }) =>
    request<{ readings: { hora: string; parametro: string; valor: number | string; unidad?: string }[]; fecha?: string | null }>("/vision/import", "POST", payload),

  listCustomDrugs: () => request<{ drugs: ApiCustomDrug[] }>("/custom-drugs"),
  addCustomDrug: (d: ApiCustomDrug) => request<{ drug: ApiCustomDrug; deduped?: boolean }>("/custom-drugs", "POST", d),
  deleteCustomDrug: (id: string) => request<{ ok: true }>(`/custom-drugs/${id}`, "DELETE"),

  listUsers: () => request<{ users: AdminUserRow[] }>("/users"),
  createUser: (u: { username: string; displayName: string; role: string; location?: string; password: string }) =>
    request<{ ok: true }>("/users", "POST", u),
  resetPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/users/${id}/reset-password`, "POST", { password }),
  setUserActive: (id: string, active: boolean) => request<{ ok: true }>(`/users/${id}/active`, "POST", { active }),
  audit: (limit = 200) => request<{ entries: AuditEntry[] }>(`/audit?limit=${limit}`),

  // Firma personal: anestesiólogos.
  listAnesthesiologists: () => request<{ anesthesiologists: ApiAnesthesiologistAdmin[] }>("/anesthesiologists"),
  listSelectableAnesthesiologists: () => request<{ anesthesiologists: ApiAnesthesiologist[] }>("/anesthesiologists/selectable"),
  createAnesthesiologist: (a: { fullName: string; colegiado: string; title?: string }) =>
    request<{ ok: true; id: string; pin: string }>("/anesthesiologists", "POST", a),
  updateAnesthesiologist: (id: string, a: { fullName?: string; colegiado?: string; title?: string }) =>
    request<{ ok: true }>(`/anesthesiologists/${id}`, "PATCH", a),
  setAnesthesiologistActive: (id: string, active: boolean) => request<{ ok: true }>(`/anesthesiologists/${id}/active`, "POST", { active }),
  resetAnesthesiologistPin: (id: string) => request<{ ok: true; pin: string }>(`/anesthesiologists/${id}/reset-pin`, "POST", {}),
  changeAnesthesiologistPin: (id: string, currentPin: string, newPin: string) =>
    request<{ ok: true }>(`/anesthesiologists/${id}/change-pin`, "POST", { currentPin, newPin }),
  signCase: (id: string, anesthesiologistId: string, pin: string) =>
    request<{ ok: true; signedBy: string; colegiado: string; title: string }>(`/cases/${id}/sign`, "POST", { anesthesiologistId, pin }),
};
