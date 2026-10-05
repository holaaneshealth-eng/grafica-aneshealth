// Proyeccion: reconstruye el estado de un caso a partir de su log de eventos.
import {
  type BaseEvent,
  type CaseState,
  type BolusRecord,
  type InfusionRecord,
  type VitalsRecord,
  type IncidentRecord,
  type MilestoneRecord,
  type TechniqueRecord,
  type BloodProductRecord,
  type LabRecord,
  type BalanceRecord,
  type VentModeRecord,
  type EmailSendRecord,
  emptyCaseState,
} from "../domain/events";

export interface TimelineItem {
  id: string;
  at: string;
  kind: string;
  label: string;
  detail?: string;
}

/** Aplica todos los eventos de un caso y devuelve su estado materializado. */
export function projectCase(events: BaseEvent[]): CaseState | null {
  const created = events.find((e) => e.type === "CASE_CREATED");
  if (!created) return null;
  const p = created.payload as Record<string, unknown>;
  let state = emptyCaseState(
    created.caseId,
    p.ia as string,
    p.year as number,
    p.ordinal as number,
    created.occurredAt,
  );

  const voided = new Set<string>();
  for (const e of events) {
    if (e.type === "EVENT_VOIDED") {
      voided.add((e.payload.targetId as string) ?? "");
    }
  }

  for (const e of events) {
    if (voided.has(e.eventId)) continue;
    state = applyEvent(state, e);
  }
  return state;
}

function applyEvent(state: CaseState, e: BaseEvent): CaseState {
  const p = e.payload;
  switch (e.type) {
    case "PREOP_INFO_RECORDED":
      return { ...state, preop: { ...state.preop, ...(p as object) } };
    case "PHASE_COMPLETED":
      return { ...state, phase: p.next as CaseState["phase"] };
    case "SAFETY_CHECK_SET":
      return { ...state, safety: { ...state.safety, [p.item as string]: p.value as boolean } };
    case "WHO_CHECK_SET":
      return { ...state, who: { ...state.who, [p.item as string]: p.value as boolean } };
    // Evento legado (array completo). Se conserva para reproducir casos antiguos.
    case "MONITORING_SELECTED":
      return {
        ...state,
        monitoring: {
          standard: (p.standard as string[]) ?? state.monitoring.standard,
          custom: (p.custom as CaseState["monitoring"]["custom"]) ?? state.monitoring.custom,
        },
      };
    // Eventos por ítem (a prueba de carreras): cada acción es independiente e idempotente.
    case "MONITORING_TOGGLED": {
      const code = p.code as string;
      const on = p.on as boolean;
      const has = state.monitoring.standard.includes(code);
      let standard = state.monitoring.standard;
      if (on && !has) standard = [...standard, code];
      else if (!on && has) standard = standard.filter((c) => c !== code);
      return { ...state, monitoring: { ...state.monitoring, standard } };
    }
    case "MONITORING_CUSTOM_ADDED": {
      const code = p.code as string;
      if (state.monitoring.custom.some((c) => c.code === code)) return state; // idempotente
      const item = { code, label: p.label as string, unit: (p.unit as string) ?? "-", chart: (p.chart as boolean) ?? true, color: (p.color as string) ?? "#14b8a6" };
      return { ...state, monitoring: { ...state.monitoring, custom: [...state.monitoring.custom, item as CaseState["monitoring"]["custom"][number]] } };
    }
    case "MONITORING_CUSTOM_REMOVED":
      return { ...state, monitoring: { ...state.monitoring, custom: state.monitoring.custom.filter((c) => c.code !== (p.code as string)) } };
    case "TECHNIQUE_ADDED":
      return { ...state, techniques: [...state.techniques, p as unknown as TechniqueRecord] };
    case "DRUG_BOLUS":
      return { ...state, boluses: [...state.boluses, p as unknown as BolusRecord] };
    case "INFUSION_STARTED": {
      const rec = p as unknown as InfusionRecord;
      const initial = {
        at: rec.startedAt,
        rateMlH: rec.rateMlH,
        weightBasedDose: rec.weightBasedDose,
        doseUnit: rec.doseUnit,
        summary: rec.summary,
        gasPercent: rec.gasPercent,
      };
      return { ...state, infusions: [...state.infusions, { ...rec, changes: [initial] }] };
    }
    case "INFUSION_RATE_CHANGED":
      return {
        ...state,
        infusions: state.infusions.map((inf) => {
          if (inf.id !== p.id) return inf;
          const isStop = inf.gas ? p.gasPercent === 0 : p.rateMlH === 0;
          const change = {
            at: e.occurredAt,
            rateMlH: (p.rateMlH as number) ?? 0,
            weightBasedDose: (p.weightBasedDose as number) ?? 0,
            doseUnit: (p.doseUnit as string) ?? inf.doseUnit,
            summary: (p.summary as string) ?? inf.summary,
            gasPercent: p.gasPercent as number | undefined,
            stop: isStop,
          };
          return {
            ...inf,
            rateMlH: isStop ? inf.rateMlH : (p.rateMlH as number),
            weightBasedDose: isStop ? inf.weightBasedDose : (p.weightBasedDose as number),
            // Al finalizar, "Fin" no sustituye el resumen; pero un resumen calculado (p.ej. suero) sí.
            summary: isStop
              ? p.summary && p.summary !== "Fin"
                ? (p.summary as string)
                : inf.summary
              : ((p.summary as string) ?? inf.summary),
            gasPercent: inf.gas && !isStop ? (p.gasPercent as number) : inf.gasPercent,
            active: isStop ? false : inf.active,
            stoppedAt: isStop ? e.occurredAt : inf.stoppedAt,
            totalInfused: isStop && p.totalInfused != null ? (p.totalInfused as number) : inf.totalInfused,
            totalInfusedUnit: isStop && p.totalInfusedUnit != null ? (p.totalInfusedUnit as string) : inf.totalInfusedUnit,
            tciModel: (p.tciModel as string) ?? inf.tciModel,
            changes: [...(inf.changes ?? []), change],
          };
        }),
      };
    case "INFUSION_STOPPED":
      return {
        ...state,
        infusions: state.infusions.map((inf) =>
          inf.id === p.id ? { ...inf, active: false, stoppedAt: e.occurredAt } : inf,
        ),
      };
    case "WEIGHT_UPDATED":
      return { ...state, preop: { ...state.preop, weightKg: p.weightKg as number } };
    case "VENT_MODE_SET":
      return { ...state, ventModes: [...(state.ventModes ?? []), p as unknown as VentModeRecord] };
    case "SHEET_EMAILED":
      return { ...state, emailSends: [...(state.emailSends ?? []), p as unknown as EmailSendRecord] };
    case "MONITOR_MODE_SET":
      return { ...state, monitorVia: (p.via as CaseState["monitorVia"]) ?? null };
    case "MONITOR_PHOTO_ADDED": {
      const rec = { id: p.id as string, at: p.at as string, mime: (p.mime as string) ?? "image/jpeg", byteSize: (p.byteSize as number) ?? 0, analyzed: (p.analyzed as boolean) ?? false };
      if ((state.monitorPhotos ?? []).some((x) => x.id === rec.id)) return state; // idempotente
      return { ...state, monitorPhotos: [...(state.monitorPhotos ?? []), rec] };
    }
    case "MONITOR_PHOTO_REMOVED":
      return { ...state, monitorPhotos: (state.monitorPhotos ?? []).filter((x) => x.id !== (p.id as string)) };
    case "VITALS_RECORDED":
      return { ...state, vitals: [...state.vitals, p as unknown as VitalsRecord] };
    case "VITALS_UPDATED":
      return {
        ...state,
        vitals: state.vitals.map((v) =>
          v.id === p.id
            ? { ...v, ...(p.at ? { at: p.at as string } : {}), ...(p.values ? { values: p.values as Record<string, number> } : {}) }
            : v,
        ),
      };
    case "VITALS_REMOVED":
      return { ...state, vitals: state.vitals.filter((v) => v.id !== p.id) };
    case "BOLUS_UPDATED":
      return {
        ...state,
        boluses: state.boluses.map((b) =>
          b.id === p.id
            ? {
                ...b,
                ...(p.dose != null ? { dose: p.dose as number } : {}),
                ...(p.unit ? { unit: p.unit as string } : {}),
                ...(p.at ? { at: p.at as string } : {}),
                ...(p.concentration != null ? { concentration: p.concentration as number } : {}),
                ...(p.volumeMl != null ? { volumeMl: p.volumeMl as number } : {}),
              }
            : b,
        ),
      };
    case "BOLUS_REMOVED":
      return { ...state, boluses: state.boluses.filter((b) => b.id !== p.id) };
    case "INFUSION_REMOVED":
      return { ...state, infusions: state.infusions.filter((i) => i.id !== p.id) };
    case "INCIDENT":
      return { ...state, incidents: [...state.incidents, p as unknown as IncidentRecord] };
    case "INCIDENT_REMOVED":
      return { ...state, incidents: state.incidents.filter((i) => i.id !== p.id) };
    case "MILESTONE":
      return { ...state, milestones: [...state.milestones, p as unknown as MilestoneRecord] };
    case "MILESTONE_TIME_CHANGED":
      return { ...state, milestones: state.milestones.map((m) => (m.id === p.id ? { ...m, at: p.at as string } : m)) };
    case "MILESTONE_REMOVED":
      return { ...state, milestones: state.milestones.filter((m) => m.id !== p.id) };
    case "BLOOD_PRODUCT":
      return { ...state, bloodProducts: [...state.bloodProducts, p as unknown as BloodProductRecord] };
    case "BLOOD_PRODUCT_REMOVED":
      return { ...state, bloodProducts: state.bloodProducts.filter((b) => b.id !== p.id) };
    case "LAB_RESULT":
      return { ...state, labs: [...state.labs, p as unknown as LabRecord] };
    case "LAB_REMOVED":
      return { ...state, labs: state.labs.filter((l) => l.id !== p.id) };
    case "BALANCE":
      return { ...state, balances: [...state.balances, p as unknown as BalanceRecord] };
    case "BALANCE_REMOVED":
      return { ...state, balances: state.balances.filter((b) => b.id !== p.id) };
    case "SURGERY_ENDED":
      return { ...state, phase: "CLOSED", endedAt: e.occurredAt };
    case "CASE_REOPENED":
      return { ...state, phase: "OR", endedAt: null };
    case "CASE_SIGNED":
      return { ...state, signedAt: e.occurredAt, signedBy: p.signedBy as string };
    default:
      return state;
  }
}

/** Construye una linea de tiempo cronologica legible desde los eventos. */
export function buildTimeline(events: BaseEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const voided = new Set<string>();
  const removedMs = new Set<string>();
  const msTimeChange = new Map<string, string>();
  // Borrados/ediciones de registros (por id de registro, no de evento).
  const removedRec = new Set<string>();
  const vitalsUpdate = new Map<string, { at?: string; values?: Record<string, number> }>();
  const bolusUpdate = new Map<string, { dose?: number; unit?: string; at?: string }>();
  events.forEach((e) => {
    const pp = e.payload;
    if (e.type === "EVENT_VOIDED") voided.add((pp.targetId as string) ?? "");
    if (e.type === "MILESTONE_REMOVED") removedMs.add((pp.id as string) ?? "");
    if (e.type === "MILESTONE_TIME_CHANGED") msTimeChange.set((pp.id as string) ?? "", pp.at as string);
    if (
      e.type === "VITALS_REMOVED" ||
      e.type === "BOLUS_REMOVED" ||
      e.type === "INFUSION_REMOVED" ||
      e.type === "BLOOD_PRODUCT_REMOVED" ||
      e.type === "LAB_REMOVED" ||
      e.type === "INCIDENT_REMOVED"
    ) {
      removedRec.add((pp.id as string) ?? "");
    }
    if (e.type === "VITALS_UPDATED") vitalsUpdate.set((pp.id as string) ?? "", { at: pp.at as string, values: pp.values as Record<string, number> });
    if (e.type === "BOLUS_UPDATED") bolusUpdate.set((pp.id as string) ?? "", { dose: pp.dose as number, unit: pp.unit as string, at: pp.at as string });
  });

  for (const e of events) {
    if (voided.has(e.eventId)) continue;
    const p = e.payload;
    switch (e.type) {
      case "CASE_CREATED":
        items.push({ id: e.eventId, at: e.occurredAt, kind: "case", label: "Caso creado", detail: p.ia as string });
        break;
      case "MILESTONE": {
        const mid = (p.id as string) ?? "";
        if (removedMs.has(mid)) break;
        items.push({ id: e.eventId, at: msTimeChange.get(mid) ?? e.occurredAt, kind: "milestone", label: p.label as string });
        break;
      }
      case "DRUG_BOLUS": {
        const bid = (p.id as string) ?? "";
        if (removedRec.has(bid)) break;
        const up = bolusUpdate.get(bid);
        const dose = up?.dose ?? (p.dose as number);
        const unit = up?.unit ?? (p.unit as string);
        items.push({
          id: e.eventId,
          at: up?.at ?? e.occurredAt,
          kind: "drug",
          label: `${p.drug}`,
          detail: `${dose} ${unit} (bolus)`,
        });
        break;
      }
      case "INFUSION_STARTED":
        if (removedRec.has((p.id as string) ?? "")) break;
        items.push({
          id: e.eventId,
          at: e.occurredAt,
          kind: "infusion",
          label: `Inicio ${p.drug}`,
          detail: p.summary as string,
        });
        break;
      case "INFUSION_RATE_CHANGED": {
        if (removedRec.has((p.id as string) ?? "")) break;
        const stop = p.gasPercent !== undefined ? p.gasPercent === 0 : p.rateMlH === 0;
        items.push({
          id: e.eventId,
          at: e.occurredAt,
          kind: "infusion",
          label: stop ? `Fin perfusión ${p.drug}` : `Cambio ritmo ${p.drug}`,
          detail: stop ? undefined : (p.summary as string),
        });
        break;
      }
      case "INFUSION_STOPPED":
        if (removedRec.has((p.id as string) ?? "")) break;
        items.push({ id: e.eventId, at: e.occurredAt, kind: "infusion", label: `Fin perfusión ${p.drug}` });
        break;
      case "TECHNIQUE_ADDED":
        items.push({ id: e.eventId, at: e.occurredAt, kind: "technique", label: p.label as string });
        break;
      case "VITALS_RECORDED": {
        const vid = (p.id as string) ?? "";
        if (removedRec.has(vid)) break;
        const up = vitalsUpdate.get(vid);
        items.push({
          id: e.eventId,
          at: up?.at ?? e.occurredAt,
          kind: "vitals",
          label: "Registro monitorización",
          detail: summarizeVitals((up?.values ?? p.values) as Record<string, number>),
        });
        break;
      }
      case "INCIDENT":
        if (removedRec.has((p.id as string) ?? "")) break;
        items.push({ id: e.eventId, at: e.occurredAt, kind: "incident", label: "Incidencia", detail: p.text as string });
        break;
      case "BLOOD_PRODUCT":
        if (removedRec.has((p.id as string) ?? "")) break;
        items.push({
          id: e.eventId,
          at: e.occurredAt,
          kind: "blood",
          label: p.product as string,
          detail: `Hemoderivado${p.dose ? ` · ${p.dose}` : ""}${p.registryNumber ? ` · nº ${p.registryNumber}` : ""}${p.adverseReaction === true ? " · REACCIÓN ADVERSA" : ""}`,
        });
        break;
      case "LAB_RESULT":
        if (removedRec.has((p.id as string) ?? "")) break;
        items.push({ id: e.eventId, at: e.occurredAt, kind: "lab", label: "Analítica intraoperatoria", detail: summarizeLab(p) });
        break;
      case "WEIGHT_UPDATED":
        items.push({ id: e.eventId, at: e.occurredAt, kind: "note", label: "Peso actualizado", detail: `${p.weightKg} kg` });
        break;
      case "SURGERY_ENDED":
        items.push({ id: e.eventId, at: e.occurredAt, kind: "case", label: "Fin de cirugía" });
        break;
      case "CASE_REOPENED":
        items.push({ id: e.eventId, at: e.occurredAt, kind: "case", label: "Caso reabierto para completar" });
        break;
      case "CASE_SIGNED":
        items.push({ id: e.eventId, at: e.occurredAt, kind: "case", label: "Hoja firmada", detail: p.signedBy as string });
        break;
      default:
        break;
    }
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

function summarizeVitals(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([k, v]) => `${k} ${v}`)
    .join("  ");
}

function summarizeLab(p: Record<string, unknown>): string {
  const values = (p.values as Record<string, number>) ?? {};
  const parts = Object.entries(values).map(([k, v]) => `${k} ${v}`);
  if (p.notes) parts.push(String(p.notes));
  return parts.join("  ");
}
