import type { CaseState, InfusionRecord } from "../../domain/events";
import { STANDARD_PARAMS, findParam } from "../../domain/monitoring";
import { formatNum } from "../../domain/calculations";
import { dmy } from "../../utils/time";
import { milestoneCode } from "../config/milestones";
import { resolveAlarmRange, isOutOfRange } from "../config/alarmRanges";
import { HEMO_CODES, FIXED_CODES, VENTMODE_CODE } from "../config/chartParams";
import { RESP_MEASURED_CODES } from "../../domain/monitoring";
import type {
  ChartModel,
  ChartPhoto,
  DrugRow,
  DrugInfusionSegment,
  FixedRow,
  MeasuredRow,
  FluidInputRow,
  FluidOutputRow,
  ChartMilestone,
} from "./chartModel";

const ms = (iso: string) => new Date(iso).getTime();

/** mcg -> µg para presentación. */
export function prettyUnit(u: string): string {
  return (u || "").replace(/mcg/g, "µg");
}

const FIXED_UNIT: Record<string, string> = { VT: "ml", FR: "rpm", PEEP: "cmH₂O", FIO2: "%" };

interface Seg {
  from: number;
  to: number | null;
  label: string;
}

function infusionRowUnit(inf: InfusionRecord): string {
  if (inf.tci) return prettyUnit(inf.tciUnit ?? "µg/ml");
  if (inf.gas) return "%";
  const du = inf.doseUnit ?? "";
  if (du && !/ml\/h/i.test(du)) return prettyUnit(du);
  return "ml/h";
}

function buildSegments(inf: InfusionRecord, endAt: number): Seg[] {
  const changes = (inf.changes ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const segs: Seg[] = [];
  const modeLabel = inf.tci === "plasma" ? "Cp" : inf.tci === "efecto" ? "Ce" : "";
  let first = true;
  for (let i = 0; i < changes.length; i++) {
    const ch = changes[i];
    if (ch.stop) continue;
    const from = ms(ch.at);
    const next = changes[i + 1] ? ms(changes[i + 1].at) : inf.stoppedAt ? ms(inf.stoppedAt) : endAt;
    let label: string;
    if (inf.tci) {
      const unit = prettyUnit(inf.tciUnit ?? "µg/ml");
      label = `${modeLabel} ${formatNum(ch.rateMlH)} ${unit}`;
      if (first && inf.tciModel) label += ` (${inf.tciModel})`;
    } else if (inf.gas) {
      label = `${formatNum(ch.gasPercent ?? 0)} %`;
    } else if (ch.doseUnit && !/ml\/h/i.test(ch.doseUnit) && ch.weightBasedDose) {
      label = `${formatNum(ch.weightBasedDose)} ${prettyUnit(ch.doseUnit)}`;
    } else {
      label = `${formatNum(ch.rateMlH)} ml/h`;
    }
    segs.push({ from, to: inf.active && i === changes.length - 1 ? null : next, label });
    first = false;
  }
  return segs;
}

export interface BuildOptions {
  via1?: boolean;
  photos?: ChartPhoto[];
}

export function buildChartModel(cs: CaseState, opts: BuildOptions = {}): ChartModel {
  const via1 = !!opts.via1;
  const photos = (opts.photos ?? []).slice().sort((a, b) => a.at - b.at);
  // ---- límites temporales ----
  const times: number[] = [ms(cs.createdAt)];
  photos.forEach((p) => times.push(p.at));
  cs.vitals.forEach((v) => times.push(ms(v.at)));
  cs.boluses.forEach((b) => times.push(ms(b.at)));
  cs.infusions.forEach((i) => {
    times.push(ms(i.startedAt));
    (i.changes ?? []).forEach((c) => times.push(ms(c.at)));
    if (i.stoppedAt) times.push(ms(i.stoppedAt));
  });
  cs.milestones.forEach((m) => times.push(ms(m.at)));
  cs.balances.forEach((b) => times.push(ms(b.at)));
  cs.bloodProducts.forEach((b) => times.push(ms(b.at)));
  if (cs.endedAt) times.push(ms(cs.endedAt));

  const ent = cs.milestones.find((m) => milestoneCode(m.label) === "ENT");
  const startAt = ent ? ms(ent.at) : Math.min(...times);
  const endAt = Math.max(...times, startAt + 60 * 1000);

  // ---- hemodinámica ----
  const sortedVitals = cs.vitals.slice().sort((a, b) => a.at.localeCompare(b.at));
  const ta = sortedVitals
    .filter((v) => v.values.TAS != null || v.values.TAD != null || v.values.TAM != null)
    .map((v) => ({ at: ms(v.at), sys: v.values.TAS, dia: v.values.TAD, map: v.values.TAM }));
  const ibp = sortedVitals
    .filter((v) => v.values.PAIS != null || v.values.PAID != null || v.values.PAIM != null)
    .map((v) => ({ at: ms(v.at), sys: v.values.PAIS, dia: v.values.PAID, map: v.values.PAIM }));
  const fc = sortedVitals.filter((v) => v.values.FC != null).map((v) => ({ at: ms(v.at), fc: v.values.FC }));

  // ---- constantes: medidas y fijadas ----
  const presentCodes = new Set<string>();
  sortedVitals.forEach((v) => Object.keys(v.values).forEach((k) => presentCodes.add(k)));

  const measuredRows: MeasuredRow[] = [];
  const ordered = [
    ...STANDARD_PARAMS.map((p) => p.code),
    ...cs.monitoring.custom.map((c) => c.code),
    ...Array.from(presentCodes),
  ];
  const seen = new Set<string>();
  for (const code of ordered) {
    if (seen.has(code)) continue;
    seen.add(code);
    if (HEMO_CODES.includes(code) || FIXED_CODES.includes(code)) continue;
    // Vía 1: en la gráfica solo se mantienen las filas del respirador (las del monitor
    // se sustituyen por las fotos). Los parámetros medidos del monitor se omiten aquí.
    if (via1 && !RESP_MEASURED_CODES.includes(code)) continue;
    if (!presentCodes.has(code)) continue;
    const param = findParam(code, cs.monitoring.custom);
    const unit = prettyUnit(param?.unit ?? "");
    const label = `${param?.label ?? code}${unit ? ` (${unit})` : ""}`;
    const range = resolveAlarmRange(code, param?.label ?? code);
    const points = sortedVitals
      .filter((v) => v.values[code] != null)
      .map((v) => ({ at: ms(v.at), value: v.values[code], outOfRange: isOutOfRange(v.values[code], range) }));
    if (points.length) measuredRows.push({ kind: "measured", code, label, points });
  }

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
  if (cs.ventModes && cs.ventModes.length) {
    const sorted = cs.ventModes.slice().sort((a, b) => a.at.localeCompare(b.at));
    const pts: { at: number; value: number | string }[] = [];
    let prev: string | null = null;
    for (const vm of sorted) {
      if (prev === null || vm.mode !== prev) pts.push({ at: ms(vm.at), value: vm.mode });
      prev = vm.mode;
    }
    if (pts.length) fixedRows.unshift({ kind: "fixed", code: VENTMODE_CODE, label: "Modo ventilatorio", points: pts });
  }

  // ---- fármacos (perfusiones no-suero + bolos) ----
  const drugInfusions = cs.infusions.filter((i) => !i.fluid);
  const drugNames: string[] = [];
  const addName = (n: string) => {
    if (!drugNames.includes(n)) drugNames.push(n);
  };
  cs.boluses.forEach((b) => addName(b.drug));
  drugInfusions.forEach((i) => addName(i.drug));

  const drugRows: DrugRow[] = drugNames.map((name) => {
    const boluses = cs.boluses
      .filter((b) => b.drug === name)
      .map((b) => ({ at: ms(b.at), dose: b.dose, unit: prettyUnit(b.unit) }))
      .sort((a, b) => a.at - b.at);
    const infs = drugInfusions.filter((i) => i.drug === name);

    const infusions: DrugInfusionSegment[] = [];
    let rowUnit = boluses[0]?.unit ?? "";

    // Total en MASA de fármaco (combina bolos y perfusión cuando comparten unidad de masa).
    const massByUnit = new Map<string, number>();
    boluses.forEach((b) => massByUnit.set(b.unit, (massByUnit.get(b.unit) ?? 0) + b.dose));
    let infVolNoConcMl = 0; // perfusión sin concentración conocida -> se muestra en ml de solución
    const extraTotals: string[] = [];

    for (const inf of infs) {
      rowUnit = infusionRowUnit(inf) || rowUnit;
      for (const s of buildSegments(inf, endAt)) infusions.push(s);
      if (!inf.tci && !inf.gas) {
        // unidad de masa a partir de la concentración de la jeringa (p. ej. "mcg/ml" -> µg).
        const massUnit = inf.concentration > 0 && inf.concentrationUnit ? prettyUnit(inf.concentrationUnit.replace(/\s*\/\s*ml$/i, "")) : null;
        const chs = (inf.changes ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
        for (let i = 0; i < chs.length; i++) {
          if (chs[i].stop) continue;
          const to = chs[i + 1] ? ms(chs[i + 1].at) : inf.stoppedAt ? ms(inf.stoppedAt) : endAt;
          const ml = (chs[i].rateMlH * (to - ms(chs[i].at))) / 3_600_000;
          if (massUnit) massByUnit.set(massUnit, (massByUnit.get(massUnit) ?? 0) + ml * inf.concentration);
          else infVolNoConcMl += ml;
        }
      }
      // total infundido según bomba (TCI finalizada)
      if (inf.totalInfused != null) extraTotals.push(`${formatNum(inf.totalInfused)} ${prettyUnit(inf.totalInfusedUnit ?? "ml")} (bomba)`);
    }

    const roundMass = (v: number, u: string) => (u === "mg" ? Math.round(v * 10) / 10 : Math.round(v));
    const parts: string[] = [];
    massByUnit.forEach((v, u) => parts.push(`${formatNum(roundMass(v, u))} ${u}`));
    if (infVolNoConcMl > 0.05) parts.push(`${formatNum(Math.round(infVolNoConcMl))} ml de solución`);
    parts.push(...extraTotals);
    const total = parts.length ? { text: parts.join(" · ") } : null;

    return { name, unit: rowUnit, boluses, infusions, total };
  });

  // ---- líquidos y balance ----
  const fluidInfs = cs.infusions.filter((i) => i.fluid);
  const inputGroups = new Map<string, FluidInputRow>();
  fluidInfs
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .forEach((f) => {
      if (!inputGroups.has(f.drug)) inputGroups.set(f.drug, { kind: "input", label: f.drug, entries: [], total: null });
      inputGroups.get(f.drug)!.entries.push({ at: ms(f.startedAt), volumeMl: f.volumeMl ?? 0 });
    });
  // hemoderivados (texto libre en `dose`)
  cs.bloodProducts
    .slice()
    .sort((a, b) => a.at.localeCompare(b.at))
    .forEach((b) => {
      const label = b.product;
      if (!inputGroups.has(label)) inputGroups.set(label, { kind: "input", label, entries: [], total: null });
      inputGroups.get(label)!.entries.push({ at: ms(b.at), volumeMl: 0, text: b.dose || b.product });
    });
  const fluidInputs = Array.from(inputGroups.values()).map((r) => {
    const sum = r.entries.reduce((s, e) => s + e.volumeMl, 0);
    return { ...r, total: sum > 0 ? { text: `${formatNum(sum)} ml` } : null };
  });

  const bleeding = cs.balances.filter((b) => b.bleedingMl != null).map((b) => ({ at: ms(b.at), volumeMl: b.bleedingMl! }));
  const diuresis = cs.balances.filter((b) => b.diuresisMl != null).map((b) => ({ at: ms(b.at), volumeMl: b.diuresisMl! }));
  const fluidOutputs: FluidOutputRow[] = [];
  if (bleeding.length)
    fluidOutputs.push({ kind: "output", label: "Sangrado", points: bleeding, total: { text: `${formatNum(bleeding.reduce((s, p) => s + p.volumeMl, 0))} ml` } });
  if (diuresis.length)
    fluidOutputs.push({ kind: "output", label: "Diuresis", points: diuresis, total: { text: `${formatNum(diuresis.reduce((s, p) => s + p.volumeMl, 0))} ml` } });

  const milestones: ChartMilestone[] = cs.milestones
    .map((m) => ({ at: ms(m.at), abbr: milestoneCode(m.label), label: m.label }))
    .sort((a, b) => a.at - b.at);

  return {
    sheetNo: cs.ia,
    date: dmy(cs.createdAt),
    startAt,
    endAt,
    hemo: { ta, ibp, fc },
    measuredRows,
    fixedRows,
    drugRows,
    fluidInputs,
    fluidOutputs,
    milestones,
    via1,
    photos,
  };
}
