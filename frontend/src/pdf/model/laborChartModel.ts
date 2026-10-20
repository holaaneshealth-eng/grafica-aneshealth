import type { CaseState } from "../../domain/events";
import { dmy } from "../../utils/time";
import { isLateralized } from "../../domain/labor";
import { formatNum } from "../../domain/calculations";

const ms = (iso: string) => new Date(iso).getTime();

export interface LaborTaSample { at: number; sys?: number; dia?: number }
export interface LaborFcSample { at: number; fc: number }
export interface LaborValuePoint { at: number; value: number }
export interface LaborSensoryPoint { at: number; left?: string; right?: string; lateralized: boolean }
export interface LaborProgramSeg { from: number; to: number; label: string; changeAt: number }
export interface LaborRescuePoint { at: number; label: string }
export interface LaborReadingPoint { at: number; label: string }
export interface LaborMark { at: number; abbr: string; label: string }

export interface LaborChartModel {
  sheetNo: string;
  date: string;
  startAt: number;
  endAt: number;
  ta: LaborTaSample[];
  fc: LaborFcSample[];
  pain: LaborValuePoint[];
  sensory: LaborSensoryPoint[];
  bromage: LaborValuePoint[];
  programs: LaborProgramSeg[];
  rescues: LaborRescuePoint[];
  readings: LaborReadingPoint[];
  marks: LaborMark[]; // tests de deambulación, parto, conversión (franja de hitos)
}

const HOUR = 60 * 60 * 1000;

/** Redondea hacia abajo a la hora en punto. */
function floorToHour(epoch: number): number {
  const d = new Date(epoch);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function buildLaborChartModel(cs: CaseState): LaborChartModel {
  const L = cs.labor;
  const times: number[] = [];
  const push = (t?: string | null) => { if (t) times.push(ms(t)); };
  push(L.testDose?.at); push(L.loadingDose?.at);
  L.pumpPrograms.forEach((p) => push(p.at));
  L.readings.forEach((r) => push(r.at));
  L.rescues.forEach((r) => push(r.at));
  L.assessments.forEach((a) => push(a.at));
  L.ambulationTests.forEach((t) => push(t.at));
  cs.techniques.forEach((t) => push(t.at));
  push(L.delivery?.at);
  push(cs.convertedAt ?? null);

  const first = times.length ? Math.min(...times) : ms(cs.createdAt);
  const last = times.length ? Math.max(...times) : ms(cs.createdAt);
  // La fase de parto termina en la conversión a cesárea (si la hay) o en el último evento.
  const laborEnd = cs.convertedAt ? ms(cs.convertedAt) : L.delivery ? ms(L.delivery.at) : last;
  const startAt = floorToHour(first);
  const endAt = Math.max(laborEnd, startAt + HOUR) + 5 * 60 * 1000;

  const assessments = L.assessments.slice().sort((a, b) => a.at.localeCompare(b.at));
  const ta: LaborTaSample[] = assessments.filter((a) => a.tas != null || a.tad != null).map((a) => ({ at: ms(a.at), sys: a.tas, dia: a.tad }));
  const fc: LaborFcSample[] = assessments.filter((a) => a.fc != null).map((a) => ({ at: ms(a.at), fc: a.fc as number }));
  const pain: LaborValuePoint[] = assessments.filter((a) => a.evn != null).map((a) => ({ at: ms(a.at), value: a.evn as number }));
  const bromage: LaborValuePoint[] = assessments.filter((a) => a.bromage).map((a) => ({ at: ms(a.at), value: Number(a.bromage) }));
  const sensory: LaborSensoryPoint[] = assessments
    .filter((a) => a.sensLeft || a.sensRight)
    .map((a) => ({ at: ms(a.at), left: a.sensLeft, right: a.sensRight, lateralized: isLateralized(a.sensLeft, a.sensRight) }));

  const progsSorted = L.pumpPrograms.slice().sort((a, b) => a.at.localeCompare(b.at));
  const programs: LaborProgramSeg[] = progsSorted.map((p, i) => {
    const from = ms(p.at);
    const to = i + 1 < progsSorted.length ? ms(progsSorted[i + 1].at) : laborEnd;
    const label = `PIEB ${formatNum(p.piebVolMl)} ml/${formatNum(p.piebIntervalMin)} min · PCEA ${formatNum(p.pceaBolusMl)} ml/${formatNum(p.pceaLockoutMin)} min`;
    return { from, to, label, changeAt: from };
  });

  const rescues: LaborRescuePoint[] = L.rescues.slice().sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ at: ms(r.at), label: `${formatNum(r.doseMg)} mg` }));
  const readings: LaborReadingPoint[] = L.readings.slice().sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ at: ms(r.at), label: `${formatNum(r.totalMl)} ml` }));

  const marks: LaborMark[] = [];
  L.ambulationTests.forEach((t) => marks.push({ at: ms(t.at), abbr: t.authorized ? "DEA✓" : "DEA✗", label: `Test deambulación: ${t.authorized ? "autorizada" : "no autorizada"}` }));
  if (L.delivery) marks.push({ at: ms(L.delivery.at), abbr: "PARTO", label: "Parto" });
  if (cs.convertedAt) marks.push({ at: ms(cs.convertedAt), abbr: "CES", label: "Conversión a cesárea" });

  return {
    sheetNo: cs.ia,
    date: dmy(cs.createdAt),
    startAt,
    endAt,
    ta,
    fc,
    pain,
    sensory,
    bromage,
    programs,
    rescues,
    readings,
    marks,
  };
}
