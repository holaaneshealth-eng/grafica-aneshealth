import type { jsPDF } from "jspdf";
import type { CaseState } from "../../domain/events";
import { registerFonts, FONT } from "../fonts/register";
import { dmy, hhmm } from "../../utils/time";
import { milestoneCode } from "../config/milestones";
import { techniqueDetailLines } from "../../domain/techniqueRender";
import { WHO_PHASES } from "../../domain/clinical";
import { positionById, consciousnessLabel, airwayLabel, oxygenLabel, destinationLabel, tofLabel, PROTECTION_MEASURES } from "../../domain/positions";
import { laborTotals } from "../../domain/laborTotals";
import { deliveryLabel, instrumentalLabel, LABOR_COMPLICATIONS } from "../../domain/labor";
import { formatNum } from "../../domain/calculations";

// Página de datos en A4 vertical, dibujada directamente con jsPDF (idéntica en cualquier
// dispositivo). Solo se imprimen los apartados con datos.
const PW = 210;
const PH = 297;
const M = 12;
const BOTTOM = PH - M - 8; // margen inferior (deja hueco para el pie)

const TEAL: [number, number, number] = [14, 124, 123];
const DARK: [number, number, number] = [30, 30, 30];
const GREY: [number, number, number] = [110, 110, 110];

class Layout {
  y = M;
  constructor(public doc: jsPDF) {}

  ensure(h: number) {
    if (this.y + h > BOTTOM) {
      this.doc.addPage("a4", "portrait");
      this.y = M;
    }
  }
  gap(h = 2.5) {
    this.y += h;
  }
  heading(t: string) {
    this.gap(3);
    this.ensure(10);
    const d = this.doc;
    d.setFont(FONT, "normal");
    d.setFontSize(11);
    d.setTextColor(...TEAL);
    d.text(t, M, this.y + 3.5);
    d.setDrawColor(...TEAL);
    d.setLineWidth(0.3);
    d.line(M, this.y + 5, PW - M, this.y + 5);
    this.y += 9;
  }
  // Línea "etiqueta: valor" (o solo valor) con ajuste de línea.
  line(text: string, opts: { size?: number; color?: [number, number, number]; indent?: number } = {}) {
    const d = this.doc;
    const size = opts.size ?? 9.5;
    const indent = opts.indent ?? 0;
    d.setFont(FONT, "normal");
    d.setFontSize(size);
    d.setTextColor(...(opts.color ?? DARK));
    const lines = d.splitTextToSize(text, PW - 2 * M - indent) as string[];
    const lh = size * 0.42 + 1;
    for (const ln of lines) {
      this.ensure(lh);
      d.text(ln, M + indent, this.y + lh - 1.2);
      this.y += lh;
    }
  }
  kv(label: string, value: string, opts: { size?: number } = {}) {
    this.line(`${label}: ${value}`, opts);
  }
  // Fila de tabla simple: hora a la izquierda + texto.
  timeRow(time: string, text: string) {
    const d = this.doc;
    const size = 9;
    d.setFontSize(size);
    const lh = size * 0.42 + 1.2;
    const textW = PW - 2 * M - 16;
    const lines = d.splitTextToSize(text, textW) as string[];
    this.ensure(lines.length * lh);
    d.setTextColor(...GREY);
    d.setFont(FONT, "normal");
    d.text(time, M, this.y + lh - 1.2);
    d.setTextColor(...DARK);
    lines.forEach((ln, i) => d.text(ln, M + 16, this.y + (i + 1) * lh - 1.2));
    this.y += lines.length * lh;
  }
}

const milestoneAt = (cs: CaseState, code: string) => cs.milestones.find((m) => milestoneCode(m.label) === code)?.at ?? null;

export function renderDataPage(doc: jsPDF, cs: CaseState): void {
  registerFonts(doc);
  doc.addPage("a4", "portrait");
  const L = new Layout(doc);
  const d = doc;

  // ---- Cabecera ----
  d.setFont(FONT, "normal");
  d.setFontSize(15);
  d.setTextColor(...DARK);
  d.text("Hoja anestésica", M, L.y + 6);
  d.setTextColor(...TEAL);
  d.text(cs.ia, M + d.getTextWidth("Hoja anestésica "), L.y + 6);
  d.setFontSize(9);
  d.setTextColor(...GREY);
  d.text(dmy(cs.createdAt), PW - M, L.y + 6, { align: "right" });
  L.y += 10;
  d.setDrawColor(...TEAL);
  d.setLineWidth(0.4);
  d.line(M, L.y, PW - M, L.y);
  L.y += 3;

  const inicio = milestoneAt(cs, "IAN") ?? milestoneAt(cs, "ENT");
  const fin = milestoneAt(cs, "FAN") ?? milestoneAt(cs, "SAL") ?? cs.endedAt ?? null;
  const facts: string[] = [];
  facts.push(`Inicio ${inicio ? hhmm(inicio) : "-"}`);
  facts.push(`Fin ${fin ? hhmm(fin) : "-"}`);
  facts.push(`Alergias: ${cs.preop.allergies || "-"}`);
  if (cs.preop.antibiotic) facts.push(`Antibiótico: ${cs.preop.antibiotic}${cs.preop.antibioticTime ? ` (${hhmm(cs.preop.antibioticTime)})` : ""}`);
  if (cs.preop.breastfeeding === true) facts.push("Lactancia: Sí");
  const bio: string[] = [];
  if (cs.preop.weightKg != null) bio.push(`Peso ${formatNum(cs.preop.weightKg)} kg`);
  if (cs.preop.heightCm != null) bio.push(`Talla ${formatNum(cs.preop.heightCm)} cm`);
  if (cs.preop.asa) bio.push(`ASA ${cs.preop.asa}${cs.preop.asaEmergency ? "E" : ""}`);
  L.line(facts.join("  ·  "), { size: 9.5 });
  if (bio.length) L.line(bio.join("  ·  "), { size: 9.5, color: GREY });

  // ---- Valoración preanestésica ----
  if (cs.preop.history || cs.preop.medication) {
    L.heading("Valoración preanestésica");
    if (cs.preop.history) L.kv("Antecedentes", cs.preop.history);
    if (cs.preop.medication) L.kv("Medicación", cs.preop.medication);
  }

  // ---- Seguridad / OMS ----
  const safetyOk = [cs.safety.monitorChecked, cs.safety.ventilatorChecked, cs.safety.suctionReady, cs.safety.ambuReady].every((v) => v === true);
  const whoDone = WHO_PHASES.map((ph) => ({ phase: ph.phase.split(" ·")[0], done: ph.items.filter((it) => cs.who[it.key] === true).length, total: ph.items.length }));
  const whoAny = whoDone.some((p) => p.done > 0);
  if (safetyOk || whoAny) {
    L.heading("Checklists");
    if (safetyOk) L.kv("Checklist de seguridad", "OK");
    if (whoAny) L.kv("Checklist de la OMS", whoDone.map((p) => `${p.phase}: ${p.done}/${p.total}`).join("  ·  "));
  }

  // ---- Técnicas ----
  if (cs.techniques.length > 0) {
    L.heading("Técnicas anestésicas");
    cs.techniques.forEach((t) => {
      const det = techniqueDetailLines(t).join(" | ");
      L.timeRow(hhmm(t.at), det ? `${t.label} — ${det}` : t.label);
    });
  }

  // ---- Analgesia neuroaxial de parto ----
  if (cs.caseType === "analgesia_parto") renderLabor(L, cs);

  // ---- Balance ----
  const tB = cs.balances.reduce((s, x) => s + (x.bleedingMl ?? 0), 0);
  const tD = cs.balances.reduce((s, x) => s + (x.diuresisMl ?? 0), 0);
  const tI = cs.balances.reduce((s, x) => s + (x.insensibleMl ?? 0), 0);
  if (cs.balances.length > 0) {
    L.heading("Balance");
    const parts = [`Sangrado total: ${tB} ml`, `Diuresis total: ${tD} ml`];
    if (tI > 0) parts.push(`Pérdidas insensibles: ${tI} ml`);
    L.line(parts.join("  ·  "));
  }

  // ---- Hemoderivados ----
  if (cs.bloodProducts.length > 0) {
    L.heading("Hemoderivados");
    cs.bloodProducts.forEach((b) => {
      const extra = [b.registryNumber ? `Nº ${b.registryNumber}` : "", b.adverseReaction === true ? "R.A. sí" : b.adverseReaction === false ? "R.A. no" : "", b.dose || ""].filter(Boolean).join(" · ");
      L.timeRow(hhmm(b.at), extra ? `${b.product} — ${extra}` : b.product);
    });
  }

  // ---- Analítica ----
  if (cs.labs.length > 0) {
    L.heading("Analítica intraoperatoria");
    cs.labs.forEach((l) => {
      const vals = Object.entries(l.values).map(([k, v]) => `${k} ${formatNum(v)}`).join(" · ");
      L.timeRow(hhmm(l.at), l.notes ? `${vals} · ${l.notes}` : vals);
    });
  }

  // ---- Incidencias ----
  if (cs.incidents.length > 0) {
    L.heading("Incidencias");
    cs.incidents.forEach((i) => L.timeRow(hhmm(i.at), `[${i.severity ?? "-"}] ${i.text}`));
  }

  // ---- Posición y medidas de protección ----
  const prot = cs.protection;
  const protList = prot ? [...PROTECTION_MEASURES.filter((m) => prot[m.key as keyof typeof prot]).map((m) => m.label), ...(prot.other?.trim() ? [prot.other.trim()] : [])] : [];
  if (cs.positions.length > 0 || protList.length > 0) {
    L.heading("Posición y medidas de protección");
    if (cs.positions.length > 0) {
      const pos = cs.positions.slice().sort((a, b) => a.at.localeCompare(b.at)).map((p) => `${hhmm(p.at)} ${p.label} (${positionById(p.position)?.abbr ?? "OTR"})`).join("  ·  ");
      L.kv("Posición", pos);
    }
    if (protList.length > 0) L.kv("Protección", protList.join("  ·  "));
  }

  // ---- Estado al finalizar la anestesia ----
  const es = cs.endState;
  if (es) {
    const rows: [string, string][] = [];
    if (es.consciousness) rows.push(["Consciencia", consciousnessLabel(es.consciousness)]);
    if (es.airway) rows.push(["Vía aérea", airwayLabel(es.airway)]);
    if (es.spontaneousVentilation != null) rows.push(["Ventilación espontánea", es.spontaneousVentilation ? "Sí" : "No"]);
    if (es.oxygen) rows.push(["Oxigenoterapia", oxygenLabel(es.oxygen)]);
    const consts: string[] = [];
    if (es.tas != null && es.tad != null) consts.push(`TA ${formatNum(es.tas)}/${formatNum(es.tad)}`);
    if (es.fc != null) consts.push(`FC ${formatNum(es.fc)}`);
    if (es.spo2 != null) consts.push(`SpO2 ${formatNum(es.spo2)}%`);
    if (es.temp != null) consts.push(`T ${formatNum(es.temp)}C`);
    if (consts.length) rows.push(["Constantes a la salida", consts.join(" · ")]);
    if (es.tofOk) rows.push(["Reversión BNM", tofLabel(es.tofOk)]);
    if (es.evn != null) rows.push(["Dolor (EVN)", `${formatNum(es.evn)}/10`]);
    if (es.nausea != null) rows.push(["Náuseas / vómitos", es.nausea ? "Sí" : "No"]);
    if (es.bromage) rows.push(["Bloqueo motor (Bromage)", es.bromage]);
    if (es.destination) rows.push(["Destino", destinationLabel(es.destination)]);
    if (es.notes) rows.push(["Observaciones", es.notes]);
    if (rows.length) {
      L.heading("Estado al finalizar la anestesia");
      rows.forEach(([k, v]) => L.kv(k, v));
    }
  }

  // ---- Pie ----
  L.gap(4);
  L.ensure(8);
  d.setDrawColor(...GREY);
  d.setLineWidth(0.2);
  d.line(M, L.y, PW - M, L.y);
  L.y += 3;
  d.setFontSize(8);
  d.setTextColor(...GREY);
  d.text("Documento pseudonimizado (RGPD). Identificado únicamente por IA.", M, L.y + 2);
  d.text(cs.signedAt ? `Firmado: ${cs.signedBy} · ${dmy(cs.signedAt)} ${hhmm(cs.signedAt)}` : "Sin firmar", PW - M, L.y + 2, { align: "right" });
}

function renderLabor(L: Layout, cs: CaseState): void {
  const lab = cs.labor;
  L.heading("Analgesia neuroaxial de parto");
  if (lab.testDose) L.kv("Dosis de prueba", `${lab.testDose.drug} ${formatNum(lab.testDose.concentration)} % · ${formatNum(lab.testDose.volumeMl)} ml (${formatNum(lab.testDose.doseMg)} mg) · ${hhmm(lab.testDose.at)}`);
  if (lab.loadingDose) L.kv("Dosis de carga", `${lab.loadingDose.drug} ${formatNum(lab.loadingDose.concentration)} % · ${formatNum(lab.loadingDose.volumeMl)} ml (${formatNum(lab.loadingDose.doseMg)} mg) · ${hhmm(lab.loadingDose.at)}`);

  if (lab.pumpPrograms.length > 0) {
    L.line("Programación de la bomba:", { color: GREY });
    lab.pumpPrograms.slice().sort((a, b) => a.at.localeCompare(b.at)).forEach((p) => {
      L.timeRow(hhmm(p.at), `${p.laName} ${formatNum(p.laPct)} %${p.opioidName ? ` + ${p.opioidName} ${formatNum(p.opioidUgMl ?? 0)} µg/ml` : ""} · PIEB ${formatNum(p.piebVolMl)} ml/${formatNum(p.piebIntervalMin)} min · PCEA ${formatNum(p.pceaBolusMl)} ml/${formatNum(p.pceaLockoutMin)} min${p.pceaHourlyMaxMl ? ` · máx ${formatNum(p.pceaHourlyMaxMl)} ml/h` : ""}`);
    });
  }
  if (lab.ambulationTests.length > 0) {
    L.line("Tests de deambulación:", { color: GREY });
    lab.ambulationTests.slice().sort((a, b) => a.at.localeCompare(b.at)).forEach((t) => {
      const yn = (v?: boolean) => (v == null ? "-" : v ? "sí" : "no");
      L.timeRow(hhmm(t.at), `Bromage 6: ${yn(t.bromage6)} · Toe test: ${yn(t.toeTest)} · Romberg: ${yn(t.romberg)} · Deambulación ${t.authorized ? "autorizada" : "no autorizada"}`);
    });
  }
  const tot = laborTotals(cs);
  const rd = lab.readings.slice().sort((a, b) => a.at.localeCompare(b.at));
  const lastReading = rd[rd.length - 1];
  L.kv("Totales", `anestésico local ≈ ${formatNum(tot.alMg)} mg · opioide ≈ ${formatNum(tot.opioidUg)} µg${lastReading ? ` · bomba: ${formatNum(lastReading.totalMl)} ml infundidos${lastReading.pceaGiven != null ? ` · PCEA ${formatNum(lastReading.pceaGiven)}/${formatNum(lastReading.pceaRequested ?? 0)}` : ""}` : ""}`);
  if (lab.delivery) L.kv("Parto", `${deliveryLabel(lab.delivery.type)}${lab.delivery.instrumental ? ` (${instrumentalLabel(lab.delivery.instrumental)})` : ""} · ${hhmm(lab.delivery.at)}`);
  if (lab.catheter) L.kv("Retirada del catéter", `${hhmm(lab.catheter.at)} · íntegro: ${lab.catheter.intact == null ? "-" : lab.catheter.intact ? "sí" : "no"}`);
  const comp = lab.complications ?? {};
  const compList = [...LABOR_COMPLICATIONS.filter((c) => comp[c.key as keyof typeof comp]).map((c) => c.label), ...(comp.other?.trim() ? [comp.other.trim()] : [])];
  if (compList.length > 0) L.kv("Complicaciones", compList.join("  ·  "));
  if (cs.convertedAt) L.kv("Conversión a cesárea", hhmm(cs.convertedAt));
}
