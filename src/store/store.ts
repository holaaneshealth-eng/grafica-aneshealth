// Store orientado a eventos con persistencia local (autosave + offline).
// El log de eventos es la fuente de verdad; el estado se proyecta bajo demanda.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaseEvent, EventType, CaseState } from "../domain/events";
import { projectCase, buildTimeline, type TimelineItem } from "./projection";
import { generateIA } from "../domain/ia";

function uid(): string {
  // UUID v4 sencillo (suficiente para identificar eventos localmente).
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "e-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface SyncItem {
  eventId: string;
  status: "pending" | "synced";
}

interface AppState {
  events: BaseEvent[];
  activeCaseId: string | null;
  actor: string;
  lastOrdinalByYear: Record<number, number>;
  online: boolean;
  syncQueue: SyncItem[];

  // acciones
  setActor: (name: string) => void;
  setOnline: (v: boolean) => void;
  createCase: () => string;
  setActiveCase: (id: string | null) => void;
  append: (
    caseId: string,
    type: EventType,
    payload: Record<string, unknown>,
    occurredAt?: string,
  ) => BaseEvent;
  voidEvent: (caseId: string, targetId: string, reason: string) => void;

  // selectores
  getCaseState: (id: string) => CaseState | null;
  getTimeline: (id: string) => TimelineItem[];
  getCaseEvents: (id: string) => BaseEvent[];
  listCases: () => CaseState[];
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      events: [],
      activeCaseId: null,
      actor: "Anestesista",
      lastOrdinalByYear: {},
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      syncQueue: [],

      setActor: (name) => set({ actor: name || "Anestesista" }),
      setOnline: (v) => set({ online: v }),

      createCase: () => {
        const now = new Date();
        const year = now.getFullYear();
        const last = get().lastOrdinalByYear[year] ?? 0;
        const { ia, ordinal } = generateIA(now, last);
        const caseId = uid();
        const ev: BaseEvent = {
          eventId: uid(),
          caseId,
          type: "CASE_CREATED",
          occurredAt: now.toISOString(),
          recordedAt: now.toISOString(),
          actor: get().actor,
          payload: { ia, year, ordinal },
        };
        set((s) => ({
          events: [...s.events, ev],
          activeCaseId: caseId,
          lastOrdinalByYear: { ...s.lastOrdinalByYear, [year]: ordinal },
          syncQueue: [...s.syncQueue, { eventId: ev.eventId, status: "pending" }],
        }));
        return caseId;
      },

      setActiveCase: (id) => set({ activeCaseId: id }),

      append: (caseId, type, payload, occurredAt) => {
        const now = new Date().toISOString();
        const ev: BaseEvent = {
          eventId: uid(),
          caseId,
          type,
          occurredAt: occurredAt ?? now,
          recordedAt: now,
          actor: get().actor,
          payload,
        };
        set((s) => ({
          events: [...s.events, ev],
          syncQueue: [...s.syncQueue, { eventId: ev.eventId, status: "pending" }],
        }));
        return ev;
      },

      voidEvent: (caseId, targetId, reason) => {
        const now = new Date().toISOString();
        const ev: BaseEvent = {
          eventId: uid(),
          caseId,
          type: "EVENT_VOIDED",
          occurredAt: now,
          recordedAt: now,
          actor: get().actor,
          payload: { targetId, reason },
        };
        set((s) => ({
          events: [...s.events, ev],
          syncQueue: [...s.syncQueue, { eventId: ev.eventId, status: "pending" }],
        }));
      },

      getCaseEvents: (id) => get().events.filter((e) => e.caseId === id),
      getCaseState: (id) => projectCase(get().events.filter((e) => e.caseId === id)),
      getTimeline: (id) => buildTimeline(get().events.filter((e) => e.caseId === id)),

      listCases: () => {
        const ids = Array.from(new Set(get().events.map((e) => e.caseId)));
        return ids
          .map((id) => projectCase(get().events.filter((e) => e.caseId === id)))
          .filter((c): c is CaseState => c !== null)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
    }),
    {
      name: "aneshealth-store-v1",
      partialize: (s) => ({
        events: s.events,
        activeCaseId: s.activeCaseId,
        actor: s.actor,
        lastOrdinalByYear: s.lastOrdinalByYear,
        syncQueue: s.syncQueue,
      }),
    },
  ),
);

/** Simula la sincronizacion posterior: marca como sincronizados los eventos pendientes. */
export function flushSyncQueue() {
  const { syncQueue, online } = useStore.getState();
  if (!online) return;
  const pending = syncQueue.filter((q) => q.status === "pending");
  if (pending.length === 0) return;
  // En produccion aqui se enviarian los eventos al backend (idempotente por eventId).
  useStore.setState({
    syncQueue: syncQueue.map((q) => ({ ...q, status: "synced" as const })),
  });
}
