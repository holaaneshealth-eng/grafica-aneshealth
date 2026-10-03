import { COL_MINUTES, COLS_PER_PAGE, PAGE_MINUTES } from "../units";

const MIN_MS = 60 * 1000;

/** Redondea un instante al cuarto de hora inmediatamente anterior. */
export function floorToQuarter(epoch: number): number {
  const d = new Date(epoch);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m - (m % 15));
  return d.getTime();
}

export interface TimeWindow {
  index: number;
  start: number;
  end: number;
}

/** Ventanas de PAGE_MINUTES que cubren [startAt, endAt]. */
export function buildWindows(startAt: number, endAt: number): TimeWindow[] {
  const base = floorToQuarter(startAt);
  const span = Math.max(endAt - base, 1);
  const count = Math.max(1, Math.ceil(span / (PAGE_MINUTES * MIN_MS)));
  const windows: TimeWindow[] = [];
  for (let i = 0; i < count; i++) {
    const s = base + i * PAGE_MINUTES * MIN_MS;
    windows.push({ index: i, start: s, end: s + PAGE_MINUTES * MIN_MS });
  }
  return windows;
}

export function xOf(at: number, w: TimeWindow, plotLeft: number, colWidth: number): number {
  const minutes = (at - w.start) / MIN_MS;
  return plotLeft + (minutes / COL_MINUTES) * colWidth;
}

export function isQuarterColumn(col: number): boolean {
  return col % 3 === 0;
}

export { COLS_PER_PAGE };
