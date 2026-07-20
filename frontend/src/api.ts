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
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfToken = "";
export function setCsrfToken(t: string): void {
  csrfToken = t;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
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

  if (res.status === 401 && onUnauthorized) onUnauthorized();

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }
  if (!res.ok) {
    const j = json as { error?: string; code?: string } | null;
    throw new ApiError(j?.error ?? `Error ${res.status}`, res.status, j?.code);
  }
  return json as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: ApiUser; csrfToken: string }>("/auth/login", "POST", { username, password }),
  logout: () => request<{ ok: true }>("/auth/logout", "POST", {}),
  me: () => request<{ user: ApiUser; csrfToken: string }>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", "POST", { currentPassword, newPassword }),

  listCases: () => request<{ cases: ApiCase[] }>("/cases"),
  createCase: () => request<{ case: ApiCase }>("/cases", "POST", {}),
  getEvents: (id: string) => request<{ events: ApiEvent[] }>(`/cases/${id}/events`),
  appendEvent: (id: string, ev: { eventId: string; type: string; occurredAt?: string; payload: Record<string, unknown> }) =>
    request<{ event: ApiEvent; deduped: boolean }>(`/cases/${id}/events`, "POST", ev),
  voidEvent: (id: string, targetEventId: string, reason: string) =>
    request<{ ok: true }>(`/cases/${id}/void`, "POST", { targetEventId, reason }),
  deleteCase: (id: string) => request<{ ok: true }>(`/cases/${id}`, "DELETE"),

  listUsers: () => request<{ users: AdminUserRow[] }>("/users"),
  createUser: (u: { username: string; displayName: string; role: string; location?: string; password: string }) =>
    request<{ ok: true }>("/users", "POST", u),
  resetPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/users/${id}/reset-password`, "POST", { password }),
  setUserActive: (id: string, active: boolean) => request<{ ok: true }>(`/users/${id}/active`, "POST", { active }),
  audit: (limit = 200) => request<{ entries: AuditEntry[] }>(`/audit?limit=${limit}`),
};
