import type { BaseEvent, CaseState } from "../../domain/events";
import { STANDARD_PARAMS, findParam } from "../../domain/monitoring";
import { formatNum } from "../../domain/calculations";
import { milestoneAbbr } from "../config/milestones";
import { resolveAlarmRange, isOutOfRange, type AlarmRange } from "../config/alarmRanges";
import { HEMO_CODES, FIXED_CODES, VENTMODE_CODE } from "../config/chartParams";
import { dmy } from "../../utils/time";
import type {
  ChartModel,
  DrugRow,
  DrugInfusionSegment,
  FixedRow,
  MeasuredRow,
  FluidInputRow,
  FluidOutputRow,
  ChartMilestone,
} from "./chartModel";

const ms = (iso: string) => new Date(iso).getTime();

/** mcg -> µg en cualquier unidad para presentación. */
export function prettyUnit(u: string): string {
  return (u || "").replace(/mcg/g, "µg");
}

const FIXED_UNIT: Record<string, string> = {
  VT: "ml",
  FR: "rpm",
  PEEP: "cmH2O",
  FIO2: "%",
};

interface InfusionAgg {
  drug: string;
  amountUnit: string;
  concentration: number;
  doseUnit: string;
  tci: boolean;
  targetUnit?: string;
  changes: {
    at: number;
    rateMlH: number;
    weightBasedDose: number;
    targetType?: string;
    targetConc?: number;
    model?: string;
  }[];
  stoppedAt: number | null;
}

/** Reconstruye las perfusiones (inicio + cambios de ritmo + fin) desde el log de eventos. */
function reconstructInfusions(events: BaseEvent[]): Map<string, InfusionAgg> {
  const map = new Map<string, InfusionAgg>();
  const voided = new Set<string>();
  for (const e of events) if (e.type === "EVENT_VOIDED") voided.add((e.payload.targetId as string) ?? "");

  for (const e of events) {
    if (voided.has(e.eventId)) continue;
    const p = e.payload;
    if (e.type === "INFUSION_STARTED") {
      const id = p.id as string;
      map.set(id, {
        drug: p.drug as string,
        amountUnit: (p.amountUnit as string) ?? "mg",
        concentration: (p.concentration as number) ?? 0,
        doseUnit: (p.doseUnit as string) ?? "",
        tci: Boolean(p.tci),
        targetUnit: p.targetUnit as string | undefined,
        changes: [
          {
            at: ms(e.occurredAt),
            rateMlH: (p.rateMlH as number) ?? 0,
            weightBasedDose: (p.weightBasedDose as number) ?? 0,
            targetType: p.targetType as string | undefined,
            targetConc: p.targetConc as number | undefined,
            model: p.tciModel as string | undefined,
          },
        ],
        stoppedAt: null,
      });
    } else if (e.type === "INFUSION_RATE_CHANGED") {
      const agg = map.get(p.id as string);
      if (agg)
        agg.changes.push({
          at: ms(e.occurredAt),
          rateMlH: (p.rateMlH as number) ?? 0,
          weightBasedDose: (p.weightBasedDose as number) ?? 0,
          targetType: p.targetType as string | undefined,
          targetConc: p.targetConc as number | undefined,
          model: p.tciModel as string | undefined,
        });
    } else if (e.type === "INFUSION_STOPPED") {
      const agg = map.get(p.id as string);
      if (agg) agg.stoppedAt = ms(e.occurredAt);
    }
  }
  return map;
}

function segLabel(agg: InfusionAgg, ch: InfusionAgg["changes"][number], isFirst: boolean): string {
  if (agg.tci) {
    const tt = ch.targetType ?? "Ce";
    const base = `${tt} ${formatNum(ch.targetConc ?? 0)} ${prettyUnit(agg.targetUnit ?? "")}`.trim();
    return isFirst && ch.model ? `${base} (${ch.model})` : base;
  }
  if (ch.weightBasedDose && agg.doseUnit) {
    return `${formatNum(ch.weightBasedDose)} ${prettyUnit(agg.doseUnit)}`;
  }
  return `${formatNum(ch.rateMlH)} ml/h`;
}

function infusionRowUnit(agg: InfusionAgg): string {
  if (agg.tci) return prettyUnit(agg.targetUnit ?? "");
  return agg.doseUnit ? prettyUnit(agg.doseUnit) : "ml/h";
}

export function buildChartModel(cs: CaseState, events: BaseEvent[]): ChartModel {
  const alarmRanges = undefined as Record<string, AlarmRange> | undefined; // usa defaults

  // ---- límites temporales ----
  const times: number[] = [ms(cs.createdAt)];
  cs.vitals.forEach((v) => times.push(ms(v.at)));
  cs.boluses.forEach((b) => times.push(ms(b.at)));
  cs.infusions.forEach((i) => {
    times.push(ms(i.startedAt));
    if (i.stoppedAt) times.push(ms(i.stoppedAt));
  });
  cs.milestones.forEach((m) => times.push(ms(m.at)));
  cs.fluidInputs.forEach((f) => times.push(ms(f.at)));
  cs.fluidOutputs.forEach((f) => times.push(ms(f.from), ms(f.to)));
  if (cs.endedAt) times.push(ms(cs.endedAt));

  const ent = cs.milestones.find((m) => milestoneAbbr(m.label) === "ENT");
  const startAt = ent ? ms(ent.at) : Math.min(...times);
  const endAt = Math.max(...times, startAt + 60 * 1000);

  // ---- hemodinámica ----
  const sortedVitals = cs.vitals.slice().sort((a, b) => a.at.localeCompare(b.at));
  const ta = sortedVitals
    .filter((v) => v.values.TAS != null || v.values.TAD != null || v.values.TAM != null)
    .map((v) => ({ at: ms(v.at), sys: v.values.TAS, dia: v.values.TAD, map: v.values.TAM }));
  const fc = sortedVitals.filter((v) => v.values.FC != null).map((v) => ({ at: ms(v.at), fc: v.values.FC }));

  // ---- constantes: medidas y fijadas ----
  const presentCodes = new Set<string>();
  sortedVitals.forEach((v) => Object.keys(v.values).forEach((k) => presentCodes.add(k)));

  const measuredRows: MeasuredRow[] = [];
  const orderedCodes = [
    ...STANDARD_PARAMS.map((p) => p.code),
    ...cs.monitoring.custom.map((c) => c.code),
    ...Array.from(presentCodes),
  ];
  const seen = new Set<string>();
  for (const code of orderedCodes) {
    if (seen.has(code)) continue;
    seen.add(code);
    if (HEMO_CODES.includes(code) || FIXED_CODES.includes(code)) continue;
    if (!presentCodes.has(code)) continue;
    const param = findParam(code, cs.monitoring.custom);
    const unit = prettyUnit(param?.unit ?? "");
    const label = `${param?.label ?? code}${unit ? ` (${unit})` : ""}`;
    const range = resolveAlarmRange(code, param?.label ?? code, alarmRanges);
    const points = sortedVitals
      .filter((v) => v.values[code] != null)
      .map((v) => ({ at: ms(v.at), value: v.values[code], outOfRange: isOutOfRange(v.values[code], range) }));
    if (points.length) measuredRows.push({ kind: "measured", code, label, points });
  }

  // Fijados numéricos (VT, FR, PEEP, FIO2): sólo cambios.
  const fixedRows: FixedRow[] = [];
  for (const code of ["VT", "FR", "PEEP", "FIO2"]) {
    if (!presentCodes.has(code)) continue;
    const param = findParam(code, cs.monitoring.custom);
    const unit = FIXED_UNIT[code] ?? prettyUnit(param?.unit ?? "");
    const pts: { at: number; value: number | string }[] = [];
    let prev: number | null = null;
    for (const v of sortedVitals) {
      const val = v.values[code];
      if (val == null) continue;
      if (prev === null || val !== prev) pts.push({ at: ms(v.at), value: val });
      prev = val;
    }
    if (pts.length) fixedRows.push({ kind: "fixed", code, label: `${param?.label ?? code}${unit ? ` (${unit})` : ""}`, points: pts });
  }
  // Modo ventilatorio (textual): sólo cambios.
  if (cs.ventModes.length) {
    const sorted = cs.ventModes.slice().sort((a, b) => a.at.localeCompare(b.at));
    const pts: { at: number; value: number | string }[] = [];
    let prev: string | null = null;
    for (const vm of sorted) {
      if (prev === null || vm.mode !== prev) pts.push({ at: ms(vm.at), value: vm.mode });
      prev = vm.mode;
    }
    if (pts.length) fixedRows.unshift({ kind: "fixed", code: VENTMODE_CODE, label: "Modo ventilatorio", points: pts });
  }

  // ---- fármacos ----
  const infAgg = reconstructInfusions(events);
  const drugNames: string[] = [];
  const addName = (n: string) => {
    if (!drugNames.includes(n)) drugNames.push(n);
  };
  cs.boluses.forEach((b) => addName(b.drug));
  infAgg.forEach((a) => addName(a.drug));

  const drugRows: DrugRow[] = drugNames.map((name) => {
    const boluses = cs.boluses
      .filter((b) => b.drug === name)
      .map((b) => ({ at: ms(b.at), dose: b.dose, unit: prettyUnit(b.unit) }))
      .sort((a, b) => a.at - b.at);
    const aggs = Array.from(infAgg.values()).filter((a) => a.drug === name);

    const infusions: DrugInfusionSegment[] = [];
    let rowUnit = boluses[0]?.unit ?? "";
    let infusionVolMl = 0;
    for (const agg of aggs) {
      rowUnit = infusionRowUnit(agg) || rowUnit;
      const changes = agg.changes.slice().sort((a, b) => a.at - b.at);
      const stop = agg.stoppedAt ?? endAt;
      changes.forEach((ch, idx) => {
        const to = idx + 1 < changes.length ? changes[idx + 1].at : stop;
        infusions.push({ from: ch.at, to: agg.stoppedAt == null && idx + 1 === changes.length ? null : to, label: segLabel(agg, ch, idx === 0) });
        if (!agg.tci && ch.rateMlH) infusionVolMl += (ch.rateMlH * (to - ch.at)) / 3_600_000;
      });
    }

    // Total (dosis/volumen acumulado)
    const byUnit = new Map<string, number>();
    boluses.forEach((b) => byUnit.set(b.unit, (byUnit.get(b.unit) ?? 0) + b.dose));
    const parts: string[] = [];
    byUnit.forEach((v, u) => parts.push(`${formatNum(v)} ${u}`));
    if (infusionVolMl > 0.05) parts.push(`${formatNum(Math.round(infusionVolMl * 10) / 10)} ml perf.`);
    const total = parts.length ? { text: parts.join(" · ") } : null;

    return { name, unit: rowUnit, boluses, infusions, total };
  });

  // ---- líquidos y balance ----
  const inputGroups = new Map<string, FluidInputRow>();
  cs.fluidInputs
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at))
    .forEach((f) => {
      const key = f.label;
      if (!inputGroups.has(key)) inputGroups.set(key, { kind: "input", label: f.label, entries: [], total: null });
      inputGroups.get(key)!.entries.push({ at: ms(f.at), volumeMl: f.volumeMl });
    });
  const fluidInputs = Array.from(inputGroups.values()).map((r) => {
    const sum = r.entries.reduce((s, e) => s + e.volumeMl, 0);
    return { ...r, total: { text: `${formatNum(sum)} ml` } };
  });

  const outputGroups = new Map<string, FluidOutputRow>();
  cs.fluidOutputs
    .slice()
    .sort((a, b) => a.from.localeCompare(b.from))
    .forEach((f) => {
      const label = f.category === "sangrado" ? "Sangrado" : "Diuresis";
      if (!outputGroups.has(label)) outputGroups.set(label, { kind: "output", label, intervals: [], total: null });
      outputGroups.get(label)!.intervals.push({ from: ms(f.from), to: ms(f.to), volumeMl: f.volumeMl });
    });
  const fluidOutputs = Array.from(outputGroups.values()).map((r) => {
    const sum = r.intervals.reduce((s, e) => s + e.volumeMl, 0);
    return { ...r, total: { text: `${formatNum(sum)} ml` } };
  });

  // ---- hitos ----
  const milestones: ChartMilestone[] = cs.milestones
    .map((m) => ({ at: ms(m.at), abbr: milestoneAbbr(m.label), label: m.label }))
    .sort((a, b) => a.at - b.at);

  return {
    sheetNo: cs.ia,
    patientId: cs.ia,
    date: dmy(cs.createdAt),
    startAt,
    endAt,
    hemo: { ta, fc },
    measuredRows,
    fixedRows,
    drugRows,
    fluidInputs,
    fluidOutputs,
    milestones,
  };
}
