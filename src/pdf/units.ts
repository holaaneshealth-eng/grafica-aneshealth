// Constantes geometricas del documento (todo en milimetros salvo tamanos de fuente en pt).

export const MM_PER_PT = 0.352777; // 1 pt = 0.352777 mm

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

// A4 horizontal (gráfica)
export const A4_LANDSCAPE = { w: 297, h: 210 };
// A4 vertical (resto del documento)
export const A4_PORTRAIT = { w: 210, h: 297 };

// Escala de tiempo fija
export const COL_MINUTES = 5; // cada columna = 5 min
export const COLS_PER_PAGE = 18; // 18 columnas
export const PAGE_MINUTES = COL_MINUTES * COLS_PER_PAGE; // 90 min por página
export const QUARTER_COLS = 3; // 15 min = 3 columnas (etiqueta horaria)

// Margenes y bandas (mm)
export const MARGIN = 8;
export const HEADER_H = 13;
export const AXIS_H = 4; // franja de etiquetas horarias
export const MILESTONE_STRIP_H = 11; // franja dedicada a las abreviaturas de hitos (verticales)
export const FOOTER_H = 16; // nº de página + leyenda + llamadas al pie
export const LABEL_COL_MIN = 24;
export const LABEL_COL_MAX = 44;
export const TOTAL_COL_W = 20; // columna "Total" (reservada en todas las páginas, pintada solo en la última)

// Alturas de fila
export const MIN_ROW_MM = 4.2; // mínimo legible (texto ~7 pt)
export const MAX_ROW_MM = 9;
export const BAND_TITLE_H = 4.4;
export const HEMO_BAND_H = 34; // banda hemodinámica (altura fija)

// Tamaños de fuente (pt)
export const FONT_MIN_PT = 7;
export const FONT_LABEL_PT = 8;
export const FONT_AXIS_PT = 7;
export const FONT_HEADER_PT = 10;
export const FONT_VALUE_PT = 7.5;

const DAY_MS = 24 * 60 * 60 * 1000;
export { DAY_MS };
