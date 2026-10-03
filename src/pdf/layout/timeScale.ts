import { COL_MINUTES, COLS_PER_PAGE, PAGE_MINUTES } from "../units";

const MIN_MS = 60 * 1000;

/** Redondea un instante al cuarto de hora inmediatamente anterior (00, 15, 30, 45). */
export function floorToQuarter(epoch: number): number {
  const d = new Date(epoch);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m - (m % 15));
  return d.getTime();
}

export interface TimeWindow {
  index: number; // 0-based
  start: number; // epoch ms
  end: number; // epoch ms (start + 90 min)
}

/** Genera las ventanas de 90 min necesarias para cubrir [startAt, endAt]. */
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

/** Índice de columna (0..17) de un instante dentro de una ventana; null si cae fuera. */
export function columnOf(at: number, w: TimeWindow): number | null {
  if (at < w.start || at >= w.end) return null;
  return Math.floor((at - w.start) / (COL_MINUTES * MIN_MS));
}

/** Posición X (mm) continua de un instante dentro del área de dibujo de la ventana. */
export function xOf(at: number, w: TimeWindow, plotLeft: number, colWidth: number): number {
  const minutes = (at - w.start) / MIN_MS;
  return plotLeft + (minutes / COL_MINUTES) * colWidth;
}

/** Centro X (mm) de una columna. */
export function colCenterX(col: number, plotLeft: number, colWidth: number): number {
  return plotLeft + (col + 0.5) * colWidth;
}

export function isQuarterColumn(col: number): boolean {
  return col % 3 === 0; // 0,3,6,9,12,15 -> 00,15,30,45,...
}

export function columnsPerPage(): number {
  return COLS_PER_PAGE;
}
