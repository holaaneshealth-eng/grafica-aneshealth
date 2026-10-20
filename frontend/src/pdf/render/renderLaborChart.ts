import type { jsPDF } from "jspdf";
import type { LaborChartModel } from "../model/laborChartModel";
import type { Diagnostics } from "./renderChart";
import {
  A4_LANDSCAPE, MARGIN, HEADER_H, AXIS_H, MILESTONE_STRIP_H, FOOTER_H,
  FONT_LABEL_PT, FONT_AXIS_PT, FONT_HEADER_PT, FONT_VALUE_PT, ptToMm,
} from "../units";
import { registerFonts, FONT } from "../fonts/register";

const COL_MIN = 15;
const COLS_PER_PAGE = 16; // 4 horas
const PAGE_MS = COL_MIN * COLS_PER_PAGE * 60 * 1000;
const LABEL_COL = 34;

const TIME = (epoch: number) => new Date(epoch).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

interface Win { start: number; end: number; index: number }

export function renderLaborChart(doc: jsPDF, model: LaborChartModel, reuseFirstPage = true): Diagnostics {
  registerFonts(doc);
  const pageW = A4_LANDSCAPE.w;
  const pageH = A4_LANDSCAPE.h;
  const plotLeft = MARGIN + LABEL_COL;
  const plotRight = pageW - MARGIN;
  const plotWidth = plotRight - plotLeft;
  const colWidth = plotWidth / COLS_PER_PAGE;

  const wins: Win[] = [];
  const span = Math.max(model.endAt - model.startAt, COL_MIN * 60 * 1000);
  const count = Math.max(1, Math.ceil(span / PAGE_MS));
  for (let i = 0; i < count; i++) {
    const start = model.startAt + i * PAGE_MS;
    wins.push({ start, end: Math.min(start + PAGE_MS, Math.max(model.endAt, start + COL_MIN * 60 * 1000)), index: i });
  }

  const xOf = (at: number, w: Win) => plotLeft + ((at - w.start) / (COL_MIN * 60 * 1000)) * colWidth;
  const inWin = (at: number, w: Win) => at >= w.start && at < w.end;
  const winCols = (w: Win) => Math.min(COLS_PER_PAGE, Math.max(1, Math.round((w.end - w.start) / (COL_MIN * 60 * 1000))));

  wins.forEach((w, pageIdx) => {
    if (pageIdx === 0 && reuseFirstPage) {
      /* usa la página actual */
    } else {
      doc.addPage("a4", "landscape");
    }
    const rightEdge = plotLeft + winCols(w) * colWidth;

    // --- cabecera ---
    doc.setTextColor(20);
    doc.setFont(FONT, "normal");
    doc.setFontSize(FONT_HEADER_PT);
    doc.text(`Analgesia de parto ${model.sheetNo}`, MARGIN, MARGIN + 6.5);
    doc.text(`${TIME(w.start)}–${TIME(w.end)}`, pageW - MARGIN, MARGIN + 5, { align: "right" });
    doc.setFontSize(FONT_AXIS_PT + 1);
    doc.text(model.date, pageW - MARGIN, MARGIN + 10, { align: "right" });
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, MARGIN + HEADER_H - 1, pageW - MARGIN, MARGIN + HEADER_H - 1);

    const gridTop = MARGIN + HEADER_H;
    const bandsTop = gridTop + AXIS_H + MILESTONE_STRIP_H;
    const bottomY = pageH - MARGIN - FOOTER_H;

    // --- eje: columnas de 15 min; etiqueta en las horas en punto ---
    const cols = winCols(w);
    for (let c = 0; c <= cols; c++) {
      const x = plotLeft + c * colWidth;
      const t = w.start + c * COL_MIN * 60 * 1000;
      const isHour = new Date(t).getMinutes() === 0;
      doc.setDrawColor(isHour ? 150 : 222);
      doc.setLineWidth(isHour ? 0.2 : 0.1);
      doc.line(x, gridTop, x, bottomY);
      if (c < cols) {
        if (isHour) {
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

    // --- franja de hitos: tests de deambulación, parto, conversión ---
    const stripTop = gridTop + AXIS_H;
    doc.setFontSize(FONT_AXIS_PT);
    for (const m of model.marks) {
      if (!inWin(m.at, w)) continue;
      const x = xOf(m.at, w);
      doc.setDrawColor(60, 90, 160);
      doc.setLineWidth(0.4);
      dashed(doc, x, stripTop, x, bottomY);
      doc.setTextColor(40, 70, 150);
      doc.text(m.abbr, x + ptToMm(FONT_AXIS_PT) * 0.36, bandsTop - 0.8, { angle: 90, baseline: "alphabetic" });
    }

    // --- banda hemodinámica (TA/FC) ---
    let y = bandsTop;
    const hemoH = 30;
    drawHemo(doc, model, w, xOf, inWin, plotLeft, rightEdge, y, hemoH);
    y += hemoH;

    // --- filas de valores / bomba / rescates ---
    const rowH = 8;
    const rows: { label: string; draw: (ry: number) => void }[] = [
      { label: "Dolor (EVN)", draw: (ry) => drawValueRow(doc, model.pain, w, xOf, inWin, ry, rowH) },
      { label: "Nivel sensitivo (I/D)", draw: (ry) => drawSensoryRow(doc, model, w, xOf, inWin, ry, rowH) },
      { label: "Bromage", draw: (ry) => drawValueRow(doc, model.bromage, w, xOf, inWin, ry, rowH) },
      { label: "Bomba", draw: (ry) => drawPumpRow(doc, model, w, xOf, inWin, plotLeft, rightEdge, ry, rowH) },
      { label: "Rescates", draw: (ry) => drawRescueRow(doc, model, w, xOf, inWin, ry, rowH) },
    ];
    for (const r of rows) {
      doc.setFontSize(FONT_LABEL_PT);
      doc.setTextColor(30);
      doc.text(r.label, MARGIN, y + rowH / 2 + 1);
      r.draw(y);
      doc.setDrawColor(238);
      doc.setLineWidth(0.1);
      doc.line(MARGIN, y + rowH, rightEdge, y + rowH);
      y += rowH;
    }

    // --- pie / leyenda ---
    const yBase = pageH - MARGIN;
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, yBase - FOOTER_H + 1, pageW - MARGIN, yBase - FOOTER_H + 1);
    doc.setFontSize(FONT_AXIS_PT - 0.5);
    doc.setTextColor(90);
    const leg = "DEA✓/✗ = test de deambulación (autorizada/no) · PARTO · CES = conversión a cesárea · barra = programación de la bomba · ▲ = rescate · marca = lectura de la bomba";
    doc.text(doc.splitTextToSize(leg, pageW - 2 * MARGIN), MARGIN, yBase - 4.3);
  });

  return { pageCount: wins.length, minFontPt: FONT_AXIS_PT, labelBoxes: [], footnotes: 0, bandSplits: 0, warnings: [], colWidthMm: colWidth, labelColWMm: LABEL_COL };
}

function dashed(doc: jsPDF, x1: number, y1: number, x2: number, y2: number) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const dy = (y2 - y1) / len;
  let d = 0, on = true;
  while (d < len) {
    const seg = on ? 1.4 : 1;
    const nd = Math.min(d + seg, len);
    if (on) doc.line(x1, y1 + dy * d, x1, y1 + dy * nd);
    d = nd;
    on = !on;
  }
}

function drawHemo(doc: jsPDF, model: LaborChartModel, w: Win, xOf: (a: number, w: Win) => number, inWin: (a: number, w: Win) => boolean, plotLeft: number, plotRight: number, top: number, h: number) {
  const bottom = top + h - 2;
  const topY = top + 4;
  const maxV = 200;
  const yFor = (v: number) => bottom - (Math.max(0, Math.min(maxV, v)) / maxV) * (bottom - topY);
  doc.setFontSize(FONT_LABEL_PT);
  doc.setTextColor(60);
  doc.text("TA / FC", MARGIN, top + 3);
  doc.setFontSize(FONT_AXIS_PT - 0.5);
  doc.setTextColor(120);
  [0, 50, 100, 150, 200].forEach((v) => {
    const yy = yFor(v);
    doc.setDrawColor(235);
    doc.setLineWidth(0.1);
    doc.line(plotLeft, yy, plotRight, yy);
    doc.text(String(v), plotLeft - 1.2, yy + 1, { align: "right" });
  });
  for (const s of model.ta) {
    if (!inWin(s.at, w)) continue;
    const x = xOf(s.at, w);
    if (s.sys != null && s.dia != null) {
      doc.setDrawColor(200, 60, 60);
      doc.setLineWidth(0.6);
      doc.line(x, yFor(s.sys), x, yFor(s.dia));
      doc.line(x - 0.8, yFor(s.sys), x + 0.8, yFor(s.sys));
      doc.line(x - 0.8, yFor(s.dia), x + 0.8, yFor(s.dia));
    }
  }
  const fcPts = model.fc.filter((p) => inWin(p.at, w));
  doc.setDrawColor(40, 160, 90);
  doc.setLineWidth(0.5);
  for (let i = 1; i < fcPts.length; i++) doc.line(xOf(fcPts[i - 1].at, w), yFor(fcPts[i - 1].fc), xOf(fcPts[i].at, w), yFor(fcPts[i].fc));
  doc.setFillColor(40, 160, 90);
  fcPts.forEach((p) => doc.circle(xOf(p.at, w), yFor(p.fc), 0.5, "F"));
  doc.setDrawColor(170);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, top + h, plotRight, top + h);
}

function drawValueRow(doc: jsPDF, pts: { at: number; value: number }[], w: Win, xOf: (a: number, w: Win) => number, inWin: (a: number, w: Win) => boolean, y: number, h: number) {
  doc.setFontSize(FONT_VALUE_PT);
  doc.setTextColor(20);
  for (const p of pts) {
    if (!inWin(p.at, w)) continue;
    doc.text(String(p.value), xOf(p.at, w), y + h / 2 + 1, { align: "center" });
  }
}

function drawSensoryRow(doc: jsPDF, model: LaborChartModel, w: Win, xOf: (a: number, w: Win) => number, inWin: (a: number, w: Win) => boolean, y: number, h: number) {
  doc.setFontSize(FONT_VALUE_PT);
  for (const s of model.sensory) {
    if (!inWin(s.at, w)) continue;
    if (s.lateralized) doc.setTextColor(200, 60, 60);
    else doc.setTextColor(20, 20, 20);
    doc.text(`${s.left ?? "-"}/${s.right ?? "-"}`, xOf(s.at, w), y + h / 2 + 1, { align: "center" });
  }
}

function drawPumpRow(doc: jsPDF, model: LaborChartModel, w: Win, xOf: (a: number, w: Win) => number, inWin: (a: number, w: Win) => boolean, plotLeft: number, rightEdge: number, y: number, h: number) {
  const barY = y + h - 2.4;
  for (const seg of model.programs) {
    if (seg.to <= w.start || seg.from >= w.end) continue;
    const x1 = Math.max(xOf(seg.from, w), plotLeft);
    const x2 = Math.min(xOf(seg.to, w), rightEdge);
    doc.setDrawColor(80, 120, 200);
    doc.setFillColor(210, 224, 250);
    doc.setLineWidth(0.2);
    doc.rect(x1, barY - 0.9, Math.max(0.6, x2 - x1), 1.8, "FD");
    if (inWin(seg.changeAt, w)) {
      doc.setFontSize(FONT_VALUE_PT);
      doc.setTextColor(20);
      doc.text(seg.label, Math.max(xOf(seg.changeAt, w), plotLeft) + 0.6, barY - 1.6);
    }
  }
  // lecturas de la bomba como marcas con el volumen
  for (const r of model.readings) {
    if (!inWin(r.at, w)) continue;
    const x = xOf(r.at, w);
    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    doc.line(x, barY - 0.9, x, barY + 1.6);
    doc.setFontSize(FONT_AXIS_PT - 0.5);
    doc.setTextColor(90);
    doc.text(r.label, x + 0.6, barY + 2.2);
  }
}

function drawRescueRow(doc: jsPDF, model: LaborChartModel, w: Win, xOf: (a: number, w: Win) => number, inWin: (a: number, w: Win) => boolean, y: number, h: number) {
  const mid = y + h / 2;
  for (const r of model.rescues) {
    if (!inWin(r.at, w)) continue;
    const x = xOf(r.at, w);
    const s = 1;
    doc.setFillColor(40, 40, 40);
    doc.triangle(x - s, mid + s, x + s, mid + s, x, mid - s, "F");
    doc.setFontSize(FONT_VALUE_PT);
    doc.setTextColor(20);
    doc.text(r.label, x + s + 0.6, mid + 1);
  }
}
