import type { jsPDF } from "jspdf";
import type {
  ChartModel,
  MeasuredRow,
  FixedRow,
  DrugRow,
  FluidInputRow,
  FluidOutputRow,
} from "../model/chartModel";
import { formatNum } from "../../domain/calculations";
import { milestoneLegend } from "../config/milestones";
import {
  A4_LANDSCAPE,
  MARGIN,
  HEADER_H,
  AXIS_H,
  MILESTONE_STRIP_H,
  FOOTER_H,
  LABEL_COL_MIN,
  LABEL_COL_MAX,
  TOTAL_COL_W,
  MIN_ROW_MM,
  MAX_ROW_MM,
  BAND_TITLE_H,
  HEMO_BAND_H,
  FONT_MIN_PT,
  FONT_LABEL_PT,
  FONT_AXIS_PT,
  FONT_HEADER_PT,
  FONT_VALUE_PT,
  ptToMm,
} from "../units";
import { buildWindows, xOf, isQuarterColumn, type TimeWindow } from "../layout/timeScale";
import { COLS_PER_PAGE } from "../units";
import { registerFonts, FONT } from "../fonts/register";

// ---------- diagnósticos (para verificación automática) ----------
export interface LabelBox {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
  group: string; // normalmente la fila; sólo se comprueban colisiones dentro del grupo
}
export interface Diagnostics {
  pageCount: number;
  minFontPt: number;
  labelBoxes: LabelBox[];
  footnotes: number;
  bandSplits: number;
  warnings: string[];
  colWidthMm: number; // ancho real de cada columna de 5 min
  labelColWMm: number; // ancho de la columna de etiquetas
}

type Row =
  | { t: "measured"; row: MeasuredRow }
  | { t: "fixed"; row: FixedRow }
  | { t: "drug"; row: DrugRow }
  | { t: "fluidIn"; row: FluidInputRow }
  | { t: "fluidOut"; row: FluidOutputRow };

interface Band {
  key: "constants" | "drugs" | "fluids";
  title: string;
  rows: Row[];
}
type Block = { t: "hemo" } | { t: "band"; band: Band };

interface PageSpec {
  window: TimeWindow;
  contIndex: number; // 0 = primera hoja de la ventana
  blocks: Block[];
}

const TIME = (epoch: number) =>
  new Date(epoch).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

function rowLabel(r: Row): string {
  switch (r.t) {
    case "measured":
      return r.row.label;
    case "fixed":
      return r.row.label;
    case "drug":
      return r.row.unit ? `${r.row.name} (${r.row.unit})` : r.row.name;
    case "fluidIn":
      return r.row.label;
    case "fluidOut":
      return r.row.label;
  }
}

export function renderChart(doc: jsPDF, model: ChartModel, reuseFirstPage = true): Diagnostics {
  const diag: Diagnostics = { pageCount: 0, minFontPt: 99, labelBoxes: [], footnotes: 0, bandSplits: 0, warnings: [], colWidthMm: 0, labelColWMm: 0 };
  registerFonts(doc);
  const pageW = A4_LANDSCAPE.w;
  const pageH = A4_LANDSCAPE.h;

  // --- bandas disponibles ---
  const bands: Band[] = [];
  const constRows: Row[] = [
    ...model.measuredRows.map((row) => ({ t: "measured", row }) as Row),
    ...model.fixedRows.map((row) => ({ t: "fixed", row }) as Row),
  ];
  if (constRows.length) bands.push({ key: "constants", title: "Constantes", rows: constRows });
  if (model.drugRows.length) bands.push({ key: "drugs", title: "Fármacos", rows: model.drugRows.map((row) => ({ t: "drug", row }) as Row) });
  const fluidRows: Row[] = [
    ...model.fluidInputs.map((row) => ({ t: "fluidIn", row }) as Row),
    ...model.fluidOutputs.map((row) => ({ t: "fluidOut", row }) as Row),
  ];
  if (fluidRows.length) bands.push({ key: "fluids", title: "Líquidos y balance", rows: fluidRows });

  const hasTotals = model.drugRows.length > 0 || fluidRows.length > 0;
  const totalColW = hasTotals ? TOTAL_COL_W : 0;

  // --- ancho de la columna de etiquetas (nombre a 2 líneas, nunca cortado) ---
  const allRows: Row[] = bands.flatMap((b) => b.rows);
  const labelColW = computeLabelColWidth(doc, allRows);
  const plotLeft = MARGIN + labelColW;
  const plotRight = pageW - MARGIN - totalColW;
  const plotWidth = plotRight - plotLeft;
  const colWidth = plotWidth / COLS_PER_PAGE;
  diag.colWidthMm = colWidth;
  diag.labelColWMm = labelColW;

  const gridTop = MARGIN + HEADER_H;
  const bandsTop = gridTop + AXIS_H + MILESTONE_STRIP_H;
  const bottomY = pageH - MARGIN - FOOTER_H;
  const availH = bottomY - bandsTop;

  // --- construir páginas por ventana ---
  const windows = buildWindows(model.startAt, model.endAt);
  const pages: PageSpec[] = [];
  for (const w of windows) {
    const blocks: Block[] = [{ t: "hemo" }, ...bands.map((band) => ({ t: "band", band }) as Block)];
    let contIndex = 0;
    let cur: Block[] = [];
    let curH = 0;
    const flush = () => {
      if (cur.length) {
        pages.push({ window: w, contIndex: contIndex++, blocks: cur });
        cur = [];
        curH = 0;
      }
    };
    for (const block of blocks) {
      const bh = blockMinH(block);
      if (bh > availH && block.t === "band") {
        // Banda sola más alta que la página: dividir por filas (último recurso).
        flush();
        const perPage = Math.max(1, Math.floor((availH - BAND_TITLE_H) / MIN_ROW_MM));
        for (let i = 0; i < block.band.rows.length; i += perPage) {
          const chunk = block.band.rows.slice(i, i + perPage);
          const title = i === 0 ? block.band.title : `${block.band.title} (cont.)`;
          pages.push({ window: w, contIndex: contIndex++, blocks: [{ t: "band", band: { ...block.band, title, rows: chunk } }] });
          diag.bandSplits++;
        }
      } else if (curH + bh > availH && cur.length) {
        flush();
        cur = [block];
        curH = bh;
      } else {
        cur.push(block);
        curH += bh;
      }
    }
    flush();
  }

  const totalPages = pages.length;
  const lastWindowIndex = pages.reduce((m, p) => Math.max(m, p.window.index), 0);

  // --- render de cada página ---
  pages.forEach((page, pageIdx) => {
    if (pageIdx === 0 && reuseFirstPage) {
      // usar la página inicial del documento
    } else {
      doc.addPage("a4", "landscape");
    }
    // La columna "Total" se dibuja en la última ventana temporal (donde cada banda
    // aparece por última vez), no sólo en la última página física.
    const isLast = page.window.index === lastWindowIndex;
    const placer = new Placer(doc, pageIdx, diag);

    drawHeader(doc, model, page);
    drawFooter(doc, model, pageIdx, totalPages);
    drawGridAndAxis(doc, page.window, plotLeft, colWidth, gridTop, bottomY);
    drawMilestones(doc, model, page.window, plotLeft, colWidth, gridTop, bandsTop, bottomY);

    if (hasTotals && isLast) {
      doc.setFontSize(FONT_LABEL_PT);
      doc.setTextColor(60, 60, 60);
      doc.text("Total", plotRight + totalColW / 2, gridTop + 2.6, { align: "center" });
    }

    // layout vertical de los bloques de esta página
    const bandBlocks = page.blocks.filter((b): b is { t: "band"; band: Band } => b.t === "band");
    const totalRows = bandBlocks.reduce((s, b) => s + b.band.rows.length, 0);
    const fixedH = page.blocks.reduce((s, b) => s + blockMinH(b), 0);
    const leftover = Math.max(0, availH - fixedH);
    const growPerRow = totalRows > 0 ? Math.min(MAX_ROW_MM - MIN_ROW_MM, leftover / totalRows) : 0;
    const rowH = MIN_ROW_MM + growPerRow;

    let y = bandsTop;
    for (const block of page.blocks) {
      if (block.t === "hemo") {
        drawHemoBand(doc, model, page.window, plotLeft, colWidth, y, HEMO_BAND_H, placer);
        y += HEMO_BAND_H;
      } else {
        y = drawBand(doc, block.band, page.window, {
          plotLeft,
          plotRight,
          colWidth,
          totalColW,
          labelColW,
          y,
          rowH,
          isLast,
          placer,
        });
      }
    }
    placer.flushFootnotes();
  });

  diag.pageCount = totalPages;
  if (diag.minFontPt === 99) diag.minFontPt = FONT_LABEL_PT;
  return diag;
}

// ---------- medición de etiquetas ----------
function measure(doc: jsPDF, text: string, pt: number): number {
  doc.setFontSize(pt);
  return doc.getTextWidth(text);
}

function wrapTo2Lines(doc: jsPDF, text: string, maxW: number, pt: number): string[] {
  if (measure(doc, text, pt) <= maxW) return [text];
  const words = text.split(/\s+/);
  if (words.length === 1) return [text]; // no se parte una palabra
  let best: string[] = [words[0], words.slice(1).join(" ")];
  let bestMax = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const m = Math.max(measure(doc, a, pt), measure(doc, b, pt));
    if (m < bestMax) {
      bestMax = m;
      best = [a, b];
    }
  }
  return best;
}

function computeLabelColWidth(doc: jsPDF, rows: Row[]): number {
  let needed = LABEL_COL_MIN;
  for (const r of rows) {
    const label = rowLabel(r);
    const lines = wrapTo2Lines(doc, label, LABEL_COL_MAX - 2, FONT_LABEL_PT);
    const w = Math.max(...lines.map((l) => measure(doc, l, FONT_LABEL_PT))) + 2;
    needed = Math.max(needed, w);
  }
  return Math.min(LABEL_COL_MAX, needed);
}

function blockMinH(b: Block): number {
  if (b.t === "hemo") return HEMO_BAND_H;
  return BAND_TITLE_H + b.band.rows.length * MIN_ROW_MM;
}

// ---------- colocación de etiquetas con detección de colisiones ----------
class Placer {
  private boxes: { x0: number; y0: number; x1: number; y1: number; group: string }[] = [];
  footnotes: string[] = [];
  constructor(private doc: jsPDF, private pageIdx: number, private diag: Diagnostics) {}

  private track(pt: number) {
    if (pt < this.diag.minFontPt) this.diag.minFontPt = pt;
  }

  /**
   * Coloca una etiqueta. Si choca dentro de su grupo (fila), la desplaza
   * verticalmente; si no cabe, la sustituye por una llamada [n] al pie.
   * Devuelve el texto realmente pintado (o la marca de llamada).
   */
  place(
    text: string,
    x: number,
    yMid: number,
    rowTop: number,
    rowBottom: number,
    group: string,
    align: "left" | "center" = "left",
    pt = FONT_VALUE_PT,
    color: [number, number, number] = [20, 20, 20],
  ): string {
    this.track(pt);
    this.doc.setFontSize(pt);
    const w = this.doc.getTextWidth(text);
    const h = ptToMm(pt);
    const mkBox = (cy: number) => {
      const x0 = align === "center" ? x - w / 2 : x;
      return { x0, y0: cy - h / 2, x1: x0 + w, y1: cy + h / 2, group };
    };
    // Ajusta la posición vertical dentro de la banda de la fila (clamp),
    // así una etiqueta aislada siempre cabe; sólo hay llamada si choca con otra.
    const lo = rowTop + h / 2;
    const hi = Math.max(lo, rowBottom - h / 2);
    const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
    const candidates = [yMid, yMid - h * 0.95, yMid + h * 0.95, yMid - 1.9 * h, yMid + 1.9 * h].map(clamp);
    for (const cy of candidates) {
      const box = mkBox(cy);
      if (!this.collides(box)) {
        this.boxes.push(box);
        this.diag.labelBoxes.push({ page: this.pageIdx, ...box, text });
        this.doc.setTextColor(color[0], color[1], color[2]);
        this.doc.text(text, box.x0, cy + h * 0.32, { align: "left" });
        return text;
      }
    }
    // Llamada al pie
    const n = this.footnotes.length + 1;
    this.footnotes.push(`[${n}] ${text}`);
    this.diag.footnotes++;
    const marker = `[${n}]`;
    this.doc.setFontSize(FONT_MIN_PT);
    const mw = this.doc.getTextWidth(marker);
    const bx = align === "center" ? x - mw / 2 : x;
    const box = { x0: bx, y0: yMid - h / 2, x1: bx + mw, y1: yMid + h / 2, group };
    this.boxes.push(box);
    this.doc.setTextColor(120);
    this.doc.text(marker, bx, yMid + h * 0.32, { align: "left" });
    return marker;
  }

  private collides(b: { x0: number; y0: number; x1: number; y1: number; group: string }): boolean {
    const pad = 0.3;
    for (const o of this.boxes) {
      if (o.group !== b.group) continue;
      if (b.x0 < o.x1 + pad && b.x1 > o.x0 - pad && b.y0 < o.y1 + pad && b.y1 > o.y0 - pad) return true;
    }
    return false;
  }

  flushFootnotes() {
    if (!this.footnotes.length) return;
    const yBase = A4_LANDSCAPE.h - MARGIN;
    this.doc.setFontSize(FONT_MIN_PT);
    this.doc.setTextColor(120, 120, 120);
    const fn = "Llamadas:  " + this.footnotes.join("    ");
    const lines = this.doc.splitTextToSize(fn, A4_LANDSCAPE.w - 2 * MARGIN) as string[];
    this.doc.text(lines.slice(0, 2), MARGIN, yBase - FOOTER_H + 3.4);
  }
}

// ---------- cabecera / pie ----------
function drawHeader(doc: jsPDF, model: ChartModel, page: PageSpec) {
  const w = page.window;
  doc.setTextColor(20);
  doc.setFontSize(FONT_HEADER_PT);
  doc.setFont(FONT, "normal");
  doc.text(`Hoja anestésica ${model.sheetNo}`, MARGIN, MARGIN + 6.5);

  const range = `${TIME(w.start)}–${TIME(w.end)}${page.contIndex > 0 ? ` · hoja ${page.contIndex + 1}` : ""}`;
  doc.setFontSize(FONT_HEADER_PT);
  doc.setFont(FONT, "normal");
  doc.text(range, A4_LANDSCAPE.w - MARGIN, MARGIN + 5, { align: "right" });
  doc.setFont(FONT, "normal");
  doc.setFontSize(FONT_AXIS_PT + 1);
  doc.text(model.date, A4_LANDSCAPE.w - MARGIN, MARGIN + 10, { align: "right" });

  doc.setDrawColor(120);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, MARGIN + HEADER_H - 1, A4_LANDSCAPE.w - MARGIN, MARGIN + HEADER_H - 1);
}

function drawFooter(doc: jsPDF, model: ChartModel, pageIdx: number, total: number) {
  const yBase = A4_LANDSCAPE.h - MARGIN;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, yBase - FOOTER_H + 1, A4_LANDSCAPE.w - MARGIN, yBase - FOOTER_H + 1);

  // (las llamadas al pie las imprime el placer en flushFootnotes, justo debajo del separador)

  doc.setFontSize(FONT_AXIS_PT);
  doc.setTextColor(30, 30, 30);
  doc.text(`Página ${pageIdx + 1} de ${total}`, MARGIN, yBase - 1.3);

  const legend =
    milestoneLegend(model.milestones.map((m) => m.label)) +
    "   ·   TA roja (⟂·) = no invasiva   ·   TA azul (▲▼□) = invasiva (PA)   ·   celda sombreada = fuera de rango   ·   barra = perfusión   ·   línea fina = valor mantenido";
  doc.setFontSize(FONT_AXIS_PT - 0.5);
  doc.setTextColor(90, 90, 90);
  const maxW = A4_LANDSCAPE.w - 2 * MARGIN - 42;
  const lines = doc.splitTextToSize(legend, maxW) as string[];
  doc.text(lines.slice(0, 2), MARGIN + 42, yBase - 4.3);
}

// ---------- rejilla y eje ----------
function drawGridAndAxis(doc: jsPDF, w: TimeWindow, plotLeft: number, colWidth: number, gridTop: number, bottomY: number) {
  for (let c = 0; c <= COLS_PER_PAGE; c++) {
    const x = plotLeft + c * colWidth;
    if (c % 3 === 0) {
      doc.setDrawColor(150);
      doc.setLineWidth(0.2);
    } else {
      doc.setDrawColor(222);
      doc.setLineWidth(0.1);
    }
    doc.line(x, gridTop, x, bottomY);
    if (c < COLS_PER_PAGE) {
      if (isQuarterColumn(c)) {
        const t = w.start + c * 5 * 60 * 1000;
        doc.setFontSize(FONT_AXIS_PT);
        doc.setTextColor(70, 70, 70);
        doc.text(TIME(t), x + 1, gridTop + 2.6);
      } else {
        doc.setDrawColor(150);
        doc.setLineWidth(0.3);
        doc.line(x, gridTop, x, gridTop + 1.4);
      }
    }
  }
}

// ---------- hitos ----------
function drawMilestones(
  doc: jsPDF,
  model: ChartModel,
  w: TimeWindow,
  plotLeft: number,
  colWidth: number,
  gridTop: number,
  bandsTop: number,
  bottomY: number,
) {
  const stripTop = gridTop + AXIS_H;
  doc.setFontSize(FONT_AXIS_PT);
  for (const m of model.milestones) {
    if (m.at < w.start || m.at >= w.end) continue;
    const x = xOf(m.at, w, plotLeft, colWidth);
    doc.setDrawColor(60, 90, 160);
    doc.setLineWidth(0.4);
    dashedLine(doc, x, stripTop, x, bottomY, 1.4, 1);
    // etiqueta vertical (lee de abajo arriba), centrada sobre la línea
    doc.setTextColor(40, 70, 150);
    doc.text(m.abbr, x + ptToMm(FONT_AXIS_PT) * 0.36, bandsTop - 0.8, { angle: 90, baseline: "alphabetic" });
  }
}

function dashedLine(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, on: number, off: number) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dx = (x2 - x1) / len;
  const dy = (y2 - y1) / len;
  let d = 0;
  let draw = true;
  while (d < len) {
    const seg = draw ? on : off;
    const nd = Math.min(d + seg, len);
    if (draw) doc.line(x1 + dx * d, y1 + dy * d, x1 + dx * nd, y1 + dy * nd);
    d = nd;
    draw = !draw;
  }
}

// ---------- banda hemodinámica ----------
function drawHemoBand(
  doc: jsPDF,
  model: ChartModel,
  w: TimeWindow,
  plotLeft: number,
  colWidth: number,
  y: number,
  h: number,
  _placer: Placer,
) {
  const plotRight = plotLeft + colWidth * COLS_PER_PAGE;
  const padT = 4.5;
  const top = y + padT;
  const bottom = y + h - 2;
  const maxV = 200; // mmHg y lpm (0..200)
  const yFor = (v: number) => bottom - (Math.max(0, Math.min(maxV, v)) / maxV) * (bottom - top);

  // título + ejes
  doc.setFontSize(FONT_LABEL_PT);
  doc.setTextColor(60);
  doc.text("Hemodinámica", MARGIN, y + 3);
  doc.setFontSize(FONT_AXIS_PT - 0.5);
  doc.setTextColor(120);
  [0, 50, 100, 150, 200].forEach((v) => {
    const yy = yFor(v);
    doc.setDrawColor(235);
    doc.setLineWidth(0.1);
    doc.line(plotLeft, yy, plotRight, yy);
    doc.text(String(v), plotLeft - 1.2, yy + 1, { align: "right" });
  });
  doc.text("mmHg", plotLeft - 1.2, top - 2.6, { align: "right" });
  doc.text("lpm", plotRight + 1.2, top - 2.6);

  // TA: barra sistólica-diastólica + punto TAM
  for (const s of model.hemo.ta) {
    if (s.at < w.start || s.at >= w.end) continue;
    const x = xOf(s.at, w, plotLeft, colWidth);
    if (s.sys != null && s.dia != null) {
      doc.setDrawColor(200, 60, 60);
      doc.setLineWidth(0.6);
      doc.line(x, yFor(s.sys), x, yFor(s.dia));
      // extremos (arpones)
      doc.line(x - 0.8, yFor(s.sys), x + 0.8, yFor(s.sys));
      doc.line(x - 0.8, yFor(s.dia), x + 0.8, yFor(s.dia));
    }
    if (s.map != null) {
      doc.setFillColor(230, 160, 40);
      doc.circle(x, yFor(s.map), 0.7, "F");
    }
  }
  // PA invasiva: barra AZUL con extremos en diamante + cuadrado hueco para la media
  // (marcador distinto a la TA no invasiva, explicado en la leyenda del pie).
  for (const s of model.hemo.ibp) {
    if (s.at < w.start || s.at >= w.end) continue;
    const x = xOf(s.at, w, plotLeft, colWidth);
    doc.setDrawColor(40, 90, 200);
    doc.setFillColor(40, 90, 200);
    doc.setLineWidth(0.6);
    if (s.sys != null && s.dia != null) {
      doc.line(x, yFor(s.sys), x, yFor(s.dia));
      const d = 0.9;
      doc.triangle(x - d, yFor(s.sys) + d, x + d, yFor(s.sys) + d, x, yFor(s.sys) - d, "F"); // ▲ sistólica
      doc.triangle(x - d, yFor(s.dia) - d, x + d, yFor(s.dia) - d, x, yFor(s.dia) + d, "F"); // ▼ diastólica
    }
    if (s.map != null) {
      const r = 0.8;
      doc.setLineWidth(0.4);
      doc.rect(x - r, yFor(s.map) - r, r * 2, r * 2, "S"); // □ media invasiva (hueco)
    }
  }
  // FC: línea
  const fcPts = model.hemo.fc.filter((p) => p.at >= w.start && p.at < w.end);
  doc.setDrawColor(40, 160, 90);
  doc.setLineWidth(0.5);
  for (let i = 1; i < fcPts.length; i++) {
    doc.line(
      xOf(fcPts[i - 1].at, w, plotLeft, colWidth),
      yFor(fcPts[i - 1].fc),
      xOf(fcPts[i].at, w, plotLeft, colWidth),
      yFor(fcPts[i].fc),
    );
  }
  doc.setFillColor(40, 160, 90);
  fcPts.forEach((p) => doc.circle(xOf(p.at, w, plotLeft, colWidth), yFor(p.fc), 0.5, "F"));

  doc.setDrawColor(170);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + h, plotRight, y + h);
}

// ---------- bandas de filas ----------
interface BandCtx {
  plotLeft: number;
  plotRight: number;
  colWidth: number;
  totalColW: number;
  labelColW: number;
  y: number;
  rowH: number;
  isLast: boolean;
  placer: Placer;
}

function drawBand(doc: jsPDF, band: Band, w: TimeWindow, ctx: BandCtx): number {
  let y = ctx.y;
  doc.setFontSize(FONT_LABEL_PT);
  doc.setFont(FONT, "normal");
  doc.setTextColor(50);
  doc.text(band.title, MARGIN, y + BAND_TITLE_H - 1.3);
  doc.setFont(FONT, "normal");
  y += BAND_TITLE_H;

  for (const r of band.rows) {
    drawRow(doc, r, w, { ...ctx, y });
    // separador de fila
    doc.setDrawColor(238);
    doc.setLineWidth(0.1);
    doc.line(MARGIN, y + ctx.rowH, ctx.plotRight + ctx.totalColW, y + ctx.rowH);
    y += ctx.rowH;
  }
  // separador de banda
  doc.setDrawColor(170);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, ctx.plotRight + ctx.totalColW, y);
  return y;
}

function drawRowLabel(doc: jsPDF, label: string, y: number, h: number, labelColW: number) {
  const lines = wrapTo2Lines(doc, label, labelColW - 2, FONT_LABEL_PT);
  doc.setFontSize(FONT_LABEL_PT);
  doc.setTextColor(30);
  const lineH = ptToMm(FONT_LABEL_PT) + 0.4;
  const startY = y + h / 2 - ((lines.length - 1) * lineH) / 2 + lineH * 0.32;
  lines.forEach((l, i) => doc.text(l, MARGIN, startY + i * lineH));
}

function drawRow(doc: jsPDF, r: Row, w: TimeWindow, ctx: BandCtx) {
  const { y, rowH, plotLeft, plotRight, colWidth, totalColW, labelColW, isLast, placer } = ctx;
  drawRowLabel(doc, rowLabel(r), y, rowH, labelColW);
  const mid = y + rowH / 2;
  const group = `${r.t}:${rowLabel(r)}:${w.index}`;

  if (r.t === "measured") {
    for (const p of r.row.points) {
      if (p.at < w.start || p.at >= w.end) continue;
      const col = Math.floor((p.at - w.start) / (5 * 60 * 1000));
      const cx = plotLeft + (col + 0.5) * colWidth;
      if (p.outOfRange) {
        doc.setFillColor(226, 226, 226);
        doc.rect(plotLeft + col * colWidth + 0.2, y + 0.2, colWidth - 0.4, rowH - 0.4, "F");
      }
      placer.place(formatNum(p.value), cx, mid, y, y + rowH, group, "center");
    }
  } else if (r.t === "fixed") {
    const pts = r.row.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const next = i + 1 < pts.length ? pts[i + 1].at : w.end;
      const segFrom = Math.max(p.at, w.start);
      const segTo = Math.min(next, w.end);
      if (segTo <= w.start || segFrom >= w.end) continue;
      // línea de mantenimiento
      const x1 = xOf(segFrom, w, plotLeft, colWidth);
      const x2 = xOf(segTo, w, plotLeft, colWidth);
      doc.setDrawColor(120);
      doc.setLineWidth(0.3);
      doc.line(x1, mid, x2, mid);
      // cifra: en el cambio si cae en la ventana; si viene de antes, al borde izquierdo
      const showAt = p.at >= w.start && p.at < w.end ? p.at : w.start;
      const x = xOf(showAt, w, plotLeft, colWidth);
      placer.place(String(p.value), x + 0.5, mid - rowH * 0.18, y, y + rowH, group, "left");
    }
  } else if (r.t === "drug") {
    // perfusiones
    for (const seg of r.row.infusions) {
      const to = seg.to ?? w.end;
      if (to <= w.start || seg.from >= w.end) continue;
      const x1 = Math.max(xOf(seg.from, w, plotLeft, colWidth), plotLeft);
      const x2 = Math.min(xOf(to, w, plotLeft, colWidth), plotRight);
      doc.setDrawColor(80, 120, 200);
      doc.setFillColor(210, 224, 250);
      doc.setLineWidth(0.2);
      doc.rect(x1, mid - 0.9, Math.max(0.6, x2 - x1), 1.8, "FD");
      // etiqueta: en el cambio si cae en la ventana; si viene de antes, al borde izquierdo
      const labelX = seg.from >= w.start && seg.from < w.end ? xOf(seg.from, w, plotLeft, colWidth) : plotLeft;
      placer.place(seg.label, labelX + 0.6, mid - rowH * 0.22, y, y + rowH, group, "left");
    }
    // bolos
    for (const b of r.row.boluses) {
      if (b.at < w.start || b.at >= w.end) continue;
      const x = xOf(b.at, w, plotLeft, colWidth);
      doc.setFillColor(60, 60, 60);
      doc.circle(x, mid + rowH * 0.22, 0.5, "F");
      const txt = b.unit && b.unit !== r.row.unit ? `${formatNum(b.dose)} ${b.unit}` : formatNum(b.dose);
      placer.place(txt, x + 0.8, mid + rowH * 0.22, y, y + rowH, group, "left");
    }
  } else if (r.t === "fluidIn") {
    for (const e of r.row.entries) {
      if (e.at < w.start || e.at >= w.end) continue;
      const x = xOf(e.at, w, plotLeft, colWidth);
      doc.setFillColor(90, 170, 170);
      doc.triangle(x - 1, mid + 1.1, x + 1, mid + 1.1, x, mid - 1.1, "F");
      const txt = e.text ? e.text : `${formatNum(e.volumeMl)} ml`;
      placer.place(txt, x + 1.4, mid, y, y + rowH, group, "left");
    }
  } else if (r.t === "fluidOut") {
    // salidas puntuales (cantidad desde el último registro): marcador + valor
    for (const p of r.row.points) {
      if (p.at < w.start || p.at >= w.end) continue;
      const x = xOf(p.at, w, plotLeft, colWidth);
      doc.setFillColor(190, 110, 60);
      doc.triangle(x - 1, mid - 1.1, x + 1, mid - 1.1, x, mid + 1.1, "F"); // triángulo invertido = salida
      placer.place(`${formatNum(p.volumeMl)} ml`, x + 1.4, mid, y, y + rowH, group, "left");
    }
  }

  // columna Total (sólo última página)
  if (isLast && totalColW > 0) {
    const totalText = r.t === "drug" ? r.row.total?.text : r.t === "fluidIn" ? r.row.total?.text : r.t === "fluidOut" ? r.row.total?.text : null;
    if (totalText) {
      doc.setFontSize(FONT_MIN_PT);
      doc.setTextColor(30);
      const lines = doc.splitTextToSize(totalText, totalColW - 1) as string[];
      const lineH = ptToMm(FONT_MIN_PT) + 0.3;
      const startY = mid - ((lines.length - 1) * lineH) / 2 + lineH * 0.32;
      lines.forEach((l, i) => doc.text(l, plotRight + totalColW - 0.5, startY + i * lineH, { align: "right" }));
    }
  }
}
