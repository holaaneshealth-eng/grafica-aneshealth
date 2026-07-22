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
    return JSON.parse((typeof localStorage !== "undefined" ? localStorage.getItem(QUEUE_KEY) : null) ?? "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: PendingEvent[]): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* almacenamiento no disponible */
  }
}

// Mutex: evita que varios flush() concurrentes pisen la cola / descarten eventos optimistas.
let flushing = false;
// Estrangula la reconciliación con el servidor para no lanzar un GET tras cada evento.
let lastReconcileAt = 0;
const RECONCILE_MIN_MS = 1500;

// Cache de proyección: devuelve la MISMA referencia mientras no cambie el array de
// eventos, para evitar repintados en cascada y recomputar todo en cada render.
let stateCache: { root: BaseEvent[]; byCase: Map<string, CaseState | null> } | null = null;
let timelineCache: { root: BaseEvent[]; byCase: Map<string, TimelineItem[]> } | null = null;

function projectMemo(root: BaseEvent[], id: string): CaseState | null {
  if (!stateCache || stateCache.root !== root) stateCache = { root, byCase: new Map() };
  const c = stateCache.byCase;
  if (!c.has(id)) c.set(id, projectCase(root.filter((e) => e.caseId === id)));
  return c.get(id) ?? null;
}
function timelineMemo(root: BaseEvent[], id: string): TimelineItem[] {
  if (!timelineCache || timelineCache.root !== root) timelineCache = { root, byCase: new Map() };
  const c = timelineCache.byCase;
  if (!c.has(id)) c.set(id, buildTimeline(root.filter((e) => e.caseId === id)));
  return c.get(id) ?? [];
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
    if (!get().online || flushing) return; // un solo flush a la vez
    flushing = true;
    try {
      // Drena la cola. Se relee get().pending en cada vuelta para incluir lo que
      // se haya anadido durante los envios (p.ej. al marcar varias constantes seguidas).
      while (true) {
        const queue = get().pending;
        if (queue.length === 0) break;
        const doneIds: string[] = []; // enviados o descartados (salen de la cola)
        const revertIds: string[] = []; // 4xx -> revertir el evento optimista
        let netError = false;
        for (const p of queue) {
          try {
            await api.appendEvent(p.caseId, { eventId: p.eventId, type: p.type, occurredAt: p.occurredAt, payload: p.payload });
            doneIds.push(p.eventId);
          } catch (err) {
            const status = (err as { status?: number }).status;
            if (status && status >= 400 && status < 500) {
              doneIds.push(p.eventId);
              revertIds.push(p.eventId); // no reintentable: se descarta y se revierte
            } else {
              netError = true; // error de red: se conserva para reintentar
            }
          }
        }
        const processed = new Set(doneIds);
        const revert = new Set(revertIds);
        const newPending = get().pending.filter((q) => !processed.has(q.eventId));
        saveQueue(newPending);
        set((s) => ({
          pending: newPending,
          events: revert.size ? s.events.filter((e) => !revert.has(e.eventId)) : s.events,
        }));
        if (netError) break; // no seguir el bucle si falla la red
      }

      // Reconciliacion con el servidor SOLO si no queda nada pendiente y no se hizo hace nada.
      const active = get().activeCaseId;
      if (active && get().pending.length === 0 && Date.now() - lastReconcileAt >= RECONCILE_MIN_MS) {
        lastReconcileAt = Date.now();
        try {
          const { events } = await api.getEvents(active);
          const serverMapped = events.map(toBaseEvent);
          // Salvaguarda: una respuesta vacia/incompleta (p.ej. arranque en frio de Render)
          // NO debe vaciar el caso activo. Sin CASE_CREATED el estado seria nulo y la UI
          // se caeria a Home cerrando los modales, asi que se ignora.
          const hasCreated = serverMapped.some((e) => e.type === "CASE_CREATED");
          if (serverMapped.length > 0 && hasCreated) {
            set((s) => {
              const serverIds = new Set(serverMapped.map((e) => e.eventId));
              // Union no destructiva: nunca se pierde un evento local (aunque el servidor
              // aun no lo haya devuelto por retardo de lectura). Los payloads son inmutables.
              const localOnly = s.events.filter((e) => e.caseId === active && !serverIds.has(e.eventId));
              const localForActive = s.events.filter((e) => e.caseId === active);
              // Si el servidor coincide exactamente con lo local, no se toca el array
              // (evita repintados y churn cada pocos segundos).
              const unchanged =
                localOnly.length === 0 &&
                localForActive.length === serverMapped.length &&
                serverMapped.every((e) => localForActive.some((l) => l.eventId === e.eventId));
              if (unchanged) return {};
              return { events: [...s.events.filter((e) => e.caseId !== active), ...serverMapped, ...localOnly] };
            });
          }
          await get().refreshCases();
        } catch {
          /* ignore */
        }
      }
    } finally {
      flushing = false;
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
  getCaseState: (id) => projectMemo(get().events, id),
  getTimeline: (id) => timelineMemo(get().events, id),
}));
