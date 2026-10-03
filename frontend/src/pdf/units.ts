// Constantes geométricas del documento (mm salvo tamaños de fuente en pt).

export const MM_PER_PT = 0.352777;
export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

export const A4_LANDSCAPE = { w: 297, h: 210 };

// Escala de tiempo fija: 120 min por página (24 columnas de 5 min).
export const COL_MINUTES = 5;
export const COLS_PER_PAGE = 24;
export const PAGE_MINUTES = COL_MINUTES * COLS_PER_PAGE; // 120 min
export const QUARTER_COLS = 3; // 15 min

export const MARGIN = 8;
export const HEADER_H = 13;
export const AXIS_H = 4;
export const MILESTONE_STRIP_H = 11; // franja para abreviaturas de hitos (verticales)
export const FOOTER_H = 16;
export const LABEL_COL_MIN = 24;
export const LABEL_COL_MAX = 46;
export const TOTAL_COL_W = 22;

export const MIN_ROW_MM = 4.2;
export const MAX_ROW_MM = 9;
export const BAND_TITLE_H = 4.4;
export const HEMO_BAND_H = 34;

export const FONT_MIN_PT = 7;
export const FONT_LABEL_PT = 8;
export const FONT_AXIS_PT = 7;
export const FONT_HEADER_PT = 10;
export const FONT_VALUE_PT = 7.5;
