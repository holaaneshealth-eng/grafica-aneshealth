// Store del cliente: la fuente de verdad es el BACKEND.
// Se mantienen en memoria los eventos de los casos cargados y una cola offline
// (unicos datos que persisten localmente) para resiliencia del caso activo.
import { create } from "zustand";
import type { BaseEvent, EventType, CaseState } from "../domain/events";
import { projectCase, buildTimeline, type TimelineItem } from "./projection";
import { api, setCsrfToken, type ApiCase, type ApiEvent, type ApiUser } from "../api";

// Retencion informativa (el backend aplica el autoborrado real de 15 dias).
export const RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUEUE_KEY = "aneshealth-pending-v1";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "e-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toBaseEvent(e: ApiEvent): BaseEvent {
  return {
    eventId: e.eventId,
    caseId: e.caseId,
    type: e.type as EventType,
    occurredAt: e.occurredAt,
    recordedAt: e.recordedAt,
    actor: e.actor,
    payload: e.payload,
    correctsEventId: e.correctsEventId,
  };
}

interface PendingEvent {
  eventId: string;
  caseId: string;
  type: EventType;
  occurredAt: string;
  payload: Record<string, unknown>;
}

function loadQueue(): PendingEvent[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: PendingEvent[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export function daysUntilPurge(lastActivity: string): number {
  const expiresAt = new Date(lastActivity).getTime() + RETENTION_DAYS * DAY_MS;
  return Math.ceil((expiresAt - Date.now()) / DAY_MS);
}

interface AppState {
  user: ApiUser | null;
  booting: boolean;
  cases: ApiCase[];
  events: BaseEvent[];
  loaded: Record<string, boolean>;
  activeCaseId: string | null;
  online: boolean;
  pending: PendingEvent[];

  // sesion
  bootstrap: () => Promise<void>;
  setUser: (u: ApiUser | null) => void;
  logout: () => Promise<void>;

  // datos
  refreshCases: () => Promise<void>;
  openCase: (id: string) => Promise<void>;
  createCase: () => Promise<string | null>;
  setActiveCase: (id: string | null) => void;
  append: (caseId: string, type: EventType, payload: Record<string, unknown>, occurredAt?: string) => void;
  reopenCase: (caseId: string) => void;
  voidEvent: (caseId: string, targetId: string, reason: string) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  flush: () => Promise<void>;
  setOnline: (v: boolean) => void;

  // permisos / selectores
  canWrite: (caseId: string) => boolean;
  getCaseState: (id: string) => CaseState | null;
  getTimeline: (id: string) => TimelineItem[];
  getCaseEvents: (id: string) => BaseEvent[];
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  booting: true,
  cases: [],
  events: [],
  loaded: {},
  activeCaseId: null,
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  pending: loadQueue(),

  bootstrap: async () => {
    try {
      const { user, csrfToken } = await api.me();
      setCsrfToken(csrfToken);
      set({ user, booting: false });
      await get().refreshCases();
      await get().flush();
    } catch {
      set({ user: null, booting: false });
    }
  },

  setUser: (u) => set({ user: u }),

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    set({ user: null, cases: [], events: [], loaded: {}, activeCaseId: null });
  },

  refreshCases: async () => {
    const { cases } = await api.listCases();
    set({ cases });
  },

  openCase: async (id) => {
    if (!get().loaded[id]) {
      const { events } = await api.getEvents(id);
      const mapped = events.map(toBaseEvent);
      set((s) => ({
        events: [...s.events.filter((e) => e.caseId !== id), ...mapped],
        loaded: { ...s.loaded, [id]: true },
      }));
    }
    set({ activeCaseId: id });
  },

  createCase: async () => {
    try {
      const { case: c } = await api.createCase();
      const { events } = await api.getEvents(c.caseId);
      set((s) => ({
        cases: [c, ...s.cases.filter((x) => x.caseId !== c.caseId)],
        events: [...s.events.filter((e) => e.caseId !== c.caseId), ...events.map(toBaseEvent)],
        loaded: { ...s.loaded, [c.caseId]: true },
        activeCaseId: c.caseId,
      }));
      return c.caseId;
    } catch {
      return null;
    }
  },

  setActiveCase: (id) => set({ activeCaseId: id }),

  // Reabrir un caso cerrado (no firmado) para seguir completando. Actualiza el estado local
  // de forma optimista para que la UI vuelva al flujo de edición al instante.
  reopenCase: (caseId) => {
    get().append(caseId, "CASE_REOPENED", {});
    set((s) => ({
      cases: s.cases.map((c) => (c.caseId === caseId ? { ...c, status: "active", closedAt: null } : c)),
    }));
  },

  append: (caseId, type, payload, occurredAt) => {
    const now = new Date().toISOString();
    const eventId = uid();
    const ev: BaseEvent = {
      eventId,
      caseId,
      type,
      occurredAt: occurredAt ?? now,
      recordedAt: now,
      actor: get().user?.displayName ?? "",
      payload,
    };
    // Optimista: se muestra al instante.
    const pending = [...get().pending, { eventId, caseId, type, occurredAt: ev.occurredAt, payload }];
    saveQueue(pending);
    set((s) => ({ events: [...s.events, ev], pending }));
    void get().flush();
  },

  flush: async () => {
    if (!get().online) return;
    const queue = get().pending;
    if (queue.length === 0) return;
    const remaining: PendingEvent[] = [];
    for (const p of queue) {
      try {
        await api.appendEvent(p.caseId, { eventId: p.eventId, type: p.type, occurredAt: p.occurredAt, payload: p.payload });
      } catch (err) {
        // Si es un error de permiso/validacion, se descarta (no reintentable). Si es de red, se conserva.
        const status = (err as { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          // descartar y revertir el evento optimista
          set((s) => ({ events: s.events.filter((e) => e.eventId !== p.eventId) }));
          continue;
        }
        remaining.push(p);
      }
    }
    saveQueue(remaining);
    set({ pending: remaining });
    // Refresca el estado del caso activo desde el servidor tras sincronizar.
    const active = get().activeCaseId;
    if (active && remaining.length === 0) {
      try {
        const { events } = await api.getEvents(active);
        set((s) => ({ events: [...s.events.filter((e) => e.caseId !== active), ...events.map(toBaseEvent)] }));
        await get().refreshCases();
      } catch {
        /* ignore */
      }
    }
  },

  voidEvent: async (caseId, targetId, reason) => {
    await api.voidEvent(caseId, targetId, reason);
    const { events } = await api.getEvents(caseId);
    set((s) => ({ events: [...s.events.filter((e) => e.caseId !== caseId), ...events.map(toBaseEvent)] }));
  },

  deleteCase: async (id) => {
    await api.deleteCase(id);
    set((s) => ({
      cases: s.cases.filter((c) => c.caseId !== id),
      events: s.events.filter((e) => e.caseId !== id),
      activeCaseId: s.activeCaseId === id ? null : s.activeCaseId,
    }));
  },

  setOnline: (v) => {
    set({ online: v });
    if (v) void get().flush();
  },

  canWrite: (caseId) => {
    const { user, cases } = get();
    if (!user) return false;
    if (user.role === "admin") return true;
    const c = cases.find((x) => x.caseId === caseId);
    if (!c) return false;
    return c.ownerUserId === user.id && c.status === "active";
  },

  getCaseEvents: (id) => get().events.filter((e) => e.caseId === id),
  getCaseState: (id) => projectCase(get().events.filter((e) => e.caseId === id)),
  getTimeline: (id) => buildTimeline(get().events.filter((e) => e.caseId === id)),
}));
