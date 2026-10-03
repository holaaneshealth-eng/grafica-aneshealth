import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
import type { BaseEvent, EventType } from "../src/domain/events";
import { projectCase } from "../src/store/projection";
import { buildChartModel } from "../src/pdf/model/buildChartModel";
import { renderChart, type Diagnostics } from "../src/pdf/render/renderChart";

const MIN = 60 * 1000;

class Builder {
  events: BaseEvent[] = [];
  private n = 0;
  constructor(private caseId: string, private actor = "Dr. Prueba") {}
  add(type: EventType, payload: Record<string, unknown>, at: number): void {
    const iso = new Date(at).toISOString();
    this.events.push({ eventId: `e${this.n++}`, caseId: this.caseId, type, occurredAt: iso, recordedAt: iso, actor: this.actor, payload });
  }
}

interface Scenario {
  name: string;
  ia: string;
  durationMin: number;
  drugs: number;
  rateInfusions: boolean;
}

const DRUG_POOL = [
  { name: "Propofol", dose: 200, unit: "mg" },
  { name: "Fentanilo", dose: 150, unit: "mcg" },
  { name: "Rocuronio", dose: 50, unit: "mg" },
  { name: "Midazolam", dose: 3, unit: "mg" },
  { name: "Dexametasona", dose: 8, unit: "mg" },
  { name: "Ondansetrón", dose: 4, unit: "mg" },
  { name: "Paracetamol", dose: 1000, unit: "mg" },
  { name: "Sugammadex", dose: 200, unit: "mg" },
  { name: "Efedrina", dose: 6, unit: "mg" },
  { name: "Atropina", dose: 0.5, unit: "mg" },
  { name: "Lidocaína", dose: 40, unit: "mg" },
  { name: "Cisatracurio", dose: 14, unit: "mg" },
];

function makeCase(s: Scenario) {
  const b = new Builder(s.name);
  const ent = new Date("2026-02-10T12:08:00").getTime();
  const end = ent + s.durationMin * MIN;

  b.add("CASE_CREATED", { ia: s.ia, year: 2026, ordinal: 6 }, ent - 20 * MIN);
  b.add("PREOP_INFO_RECORDED", { allergies: "No conocidas", heightCm: 170, weightKg: 72, history: "HTA", medication: "Enalapril", antibiotic: "Cefazolina 2 g", asa: "II", asaEmergency: false }, ent - 18 * MIN);
  b.add("MONITORING_SELECTED", {
    standard: ["TAS", "TAD", "TAM", "FC", "SPO2", "ETCO2", "TEMP", "BIS", "VT", "FR", "PEEP", "FIO2"],
    custom: [],
  }, ent - 17 * MIN);

  const hitos: [string, number][] = [
    ["Entrada a quirófano", 0], ["Inicio de anestesia", 7], ["Inicio de cirugía", 15],
    ["Fin de cirugía", s.durationMin - 10], ["Fin de anestesia", s.durationMin - 5], ["Salida de quirófano", s.durationMin],
  ];
  hitos.forEach(([label, m], i) => b.add("MILESTONE", { id: `m${i}`, at: new Date(ent + m * MIN).toISOString(), label }, ent + m * MIN));

  b.add("VENT_MODE_SET", { id: "v1", at: new Date(ent + 10 * MIN).toISOString(), mode: "VC" }, ent + 10 * MIN);
  b.add("VENT_MODE_SET", { id: "v2", at: new Date(ent + Math.floor(s.durationMin / 2) * MIN).toISOString(), mode: "PC" }, ent + Math.floor(s.durationMin / 2) * MIN);

  let vt = 480, fr = 12, peep = 5, fio2 = 50;
  for (let t = ent; t <= end; t += 5 * MIN) {
    const k = (t - ent) / MIN;
    const sys = 120 + Math.round(18 * Math.sin(k / 11));
    const dia = 70 + Math.round(10 * Math.sin(k / 13));
    const map = Math.round((sys + 2 * dia) / 3);
    const fc = 72 + Math.round(14 * Math.sin(k / 9));
    const spo2 = 98 - (k % 37 === 0 ? 9 : 0);
    const etco2 = 35 + Math.round(4 * Math.sin(k / 7)) + (k % 41 === 0 ? 14 : 0);
    const temp = 36.5 - (k < 15 ? 0.9 : 0);
    const bis = 45 + Math.round(6 * Math.sin(k / 5)) + (k % 53 === 0 ? 22 : 0);
    if (k >= Math.floor(s.durationMin / 3)) vt = 500;
    if (k >= Math.floor(s.durationMin / 2)) { fr = 14; peep = 6; fio2 = 45; }
    b.add("VITALS_RECORDED", { id: `vit${k}`, at: new Date(t).toISOString(), source: "manual", values: { TAS: sys, TAD: dia, TAM: map, FC: fc, SPO2: spo2, ETCO2: etco2, TEMP: Math.round(temp * 10) / 10, BIS: bis, VT: vt, FR: fr, PEEP: peep, FIO2: fio2 } }, t);
  }

  const nDrugs = Math.min(s.drugs, DRUG_POOL.length);
  for (let i = 0; i < nDrugs; i++) {
    const d = DRUG_POOL[i];
    b.add("DRUG_BOLUS", { id: `b${i}`, drug: d.name, dose: d.dose, unit: d.unit, at: new Date(ent + (7 + i) * MIN).toISOString() }, ent + (7 + i) * MIN);
  }
  b.add("DRUG_BOLUS", { id: "bp2", drug: "Propofol", dose: 50, unit: "mg", at: new Date(Math.min(end, ent + 40 * MIN)).toISOString() }, Math.min(end, ent + 40 * MIN));

  // TCI remifentanilo (ng/ml, Minto) con cambios y fin con total infundido
  b.add("INFUSION_STARTED", { id: "inf-remi", drug: "Remifentanilo", tci: "efecto", tciUnit: "ng/ml", tciModel: "Minto", rateMlH: 3, weightBasedDose: 3, doseUnit: "ng/ml (Ce)", summary: "Ce 3 ng/ml (Minto)", startedAt: new Date(ent + 7 * MIN).toISOString(), active: true }, ent + 7 * MIN);
  b.add("INFUSION_RATE_CHANGED", { id: "inf-remi", tci: "efecto", rateMlH: 4, weightBasedDose: 4, doseUnit: "ng/ml (Ce)", summary: "Ce 4 ng/ml" }, ent + 20 * MIN);
  if (s.durationMin > 60) b.add("INFUSION_RATE_CHANGED", { id: "inf-remi", tci: "efecto", rateMlH: 2.5, weightBasedDose: 2.5, doseUnit: "ng/ml (Ce)", summary: "Ce 2,5 ng/ml" }, ent + 70 * MIN);
  b.add("INFUSION_RATE_CHANGED", { id: "inf-remi", tci: "efecto", rateMlH: 0, weightBasedDose: 0, doseUnit: "ng/ml (Ce)", summary: "Fin", totalInfused: 820, totalInfusedUnit: "µg" }, end - 6 * MIN);

  // TCI propofol (µg/ml, Eleveld)
  b.add("INFUSION_STARTED", { id: "inf-prop", drug: "Propofol", tci: "plasma", tciUnit: "µg/ml", tciModel: "Eleveld", rateMlH: 3.5, weightBasedDose: 3.5, doseUnit: "µg/ml (Cp)", summary: "Cp 3,5 µg/ml (Eleveld)", startedAt: new Date(ent + 7 * MIN).toISOString(), active: true }, ent + 7 * MIN);
  b.add("INFUSION_RATE_CHANGED", { id: "inf-prop", tci: "plasma", rateMlH: 3.0, weightBasedDose: 3.0, doseUnit: "µg/ml (Cp)", summary: "Cp 3 µg/ml" }, ent + 30 * MIN);

  if (s.rateInfusions) {
    b.add("INFUSION_STARTED", { id: "inf-nora", drug: "Noradrenalina", rateMlH: 6, weightBasedDose: 0.05, doseUnit: "mcg/kg/min", amount: 8, amountUnit: "mg", diluentVolumeMl: 50, concentration: 0.16, concentrationUnit: "mg/ml", summary: "6 ml/h · 0,05 mcg/kg/min", startedAt: new Date(ent + 25 * MIN).toISOString(), active: true }, ent + 25 * MIN);
    b.add("INFUSION_RATE_CHANGED", { id: "inf-nora", rateMlH: 10, weightBasedDose: 0.08, doseUnit: "mcg/kg/min", summary: "10 ml/h" }, ent + 55 * MIN);
    b.add("INFUSION_RATE_CHANGED", { id: "inf-nora", rateMlH: 4, weightBasedDose: 0.03, doseUnit: "mcg/kg/min", summary: "4 ml/h" }, ent + 120 * MIN);
    b.add("INFUSION_STARTED", { id: "inf-dex", drug: "Dexmedetomidina", rateMlH: 7, weightBasedDose: 0.5, doseUnit: "mcg/kg/h", amount: 200, amountUnit: "mcg", diluentVolumeMl: 50, concentration: 4, concentrationUnit: "mcg/ml", summary: "0,5 mcg/kg/h", startedAt: new Date(ent + 30 * MIN).toISOString(), active: true }, ent + 30 * MIN);
    b.add("INFUSION_RATE_CHANGED", { id: "inf-dex", rateMlH: 0, weightBasedDose: 0, doseUnit: "mcg/kg/h", summary: "Fin" }, end - 20 * MIN);
  }

  // sueros (fluid), hemoderivados, balance (incremental)
  b.add("INFUSION_STARTED", { id: "su1", drug: "Ringer lactato", fluid: true, volumeMl: 500, amount: 0, amountUnit: "ml", diluentVolumeMl: 0, concentration: 0, concentrationUnit: "ml", rateMlH: 0, weightBasedDose: 0, doseUnit: "ml", summary: "500 ml", startedAt: new Date(ent + 5 * MIN).toISOString(), active: true }, ent + 5 * MIN);
  b.add("INFUSION_STARTED", { id: "su2", drug: "Ringer lactato", fluid: true, volumeMl: 500, amount: 0, amountUnit: "ml", diluentVolumeMl: 0, concentration: 0, concentrationUnit: "ml", rateMlH: 0, weightBasedDose: 0, doseUnit: "ml", summary: "500 ml", startedAt: new Date(Math.min(end, ent + 60 * MIN)).toISOString(), active: true }, Math.min(end, ent + 60 * MIN));
  if (s.rateInfusions) b.add("BLOOD_PRODUCT", { id: "bp-1", at: new Date(Math.min(end, ent + 90 * MIN)).toISOString(), product: "Conc. hematíes", dose: "2 UCH", adverseReaction: false, registryNumber: "H-123" }, Math.min(end, ent + 90 * MIN));
  b.add("BALANCE", { id: "bal1", at: new Date(ent + 40 * MIN).toISOString(), bleedingMl: 200 }, ent + 40 * MIN);
  b.add("BALANCE", { id: "bal2", at: new Date(Math.min(end, ent + 90 * MIN)).toISOString(), bleedingMl: 150 }, Math.min(end, ent + 90 * MIN));
  b.add("BALANCE", { id: "bal3", at: new Date(Math.min(end, ent + 60 * MIN)).toISOString(), diuresisMl: 300 }, Math.min(end, ent + 60 * MIN));
  b.add("BALANCE", { id: "bal4", at: new Date(end).toISOString(), diuresisMl: 300 }, end);

  b.add("SURGERY_ENDED", {}, end);
  return projectCase(b.events)!;
}

/** Caso "antiguo": sin ASA, sin modo ventilatorio ni campos TCI nuevos. Verifica compatibilidad. */
function makeLegacyCase() {
  const b = new Builder("legacy");
  const ent = new Date("2025-11-02T09:05:00").getTime();
  const end = ent + 90 * MIN;
  b.add("CASE_CREATED", { ia: "25-000123-7", year: 2025, ordinal: 123 }, ent - 10 * MIN);
  // payload antiguo de preanestesia (sin asa/asaEmergency)
  b.add("PREOP_INFO_RECORDED", { allergies: "No", heightCm: 165, weightKg: 68, history: "-", medication: "-" }, ent - 8 * MIN);
  b.add("MONITORING_SELECTED", { standard: ["TAS", "TAD", "TAM", "FC", "SPO2"], custom: [] }, ent - 7 * MIN);
  b.add("MILESTONE", { id: "lm1", at: new Date(ent).toISOString(), label: "Entrada a quirófano" }, ent);
  b.add("MILESTONE", { id: "lm2", at: new Date(end).toISOString(), label: "Salida de quirófano" }, end);
  for (let t = ent; t <= end; t += 5 * MIN) {
    const k = (t - ent) / MIN;
    b.add("VITALS_RECORDED", { id: `lv${k}`, at: new Date(t).toISOString(), source: "manual", values: { TAS: 120, TAD: 70, TAM: 87, FC: 70, SPO2: 98 } }, t);
  }
  b.add("DRUG_BOLUS", { id: "lb1", drug: "Propofol", dose: 150, unit: "mg", at: new Date(ent + 3 * MIN).toISOString() }, ent + 3 * MIN);
  // perfusión antigua SIN concentración (concentration 0) -> total debe caer a "ml de solución"
  b.add("INFUSION_STARTED", { id: "linf", drug: "Remifentanilo", rateMlH: 5, weightBasedDose: 0, doseUnit: "ml/h", amount: 0, amountUnit: "mg", diluentVolumeMl: 0, concentration: 0, concentrationUnit: "", summary: "5 ml/h", startedAt: new Date(ent + 5 * MIN).toISOString(), active: true }, ent + 5 * MIN);
  b.add("SURGERY_ENDED", {}, end);
  return projectCase(b.events)!;
}

function verify(diag: Diagnostics): string[] {
  const problems: string[] = [];
  if (diag.minFontPt < 7 - 1e-6) problems.push(`fuente < 7pt (${diag.minFontPt.toFixed(2)})`);
  if (diag.bandSplits > 0) problems.push(`${diag.bandSplits} banda(s) divididas`);
  const byKey = new Map<string, typeof diag.labelBoxes>();
  for (const lb of diag.labelBoxes) {
    const key = `${lb.page}|${lb.group}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(lb);
  }
  let collisions = 0;
  for (const boxes of byKey.values())
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.x0 < c.x1 && a.x1 > c.x0 && a.y0 < c.y1 && a.y1 > c.y0) collisions++;
      }
  if (collisions > 0) problems.push(`${collisions} colisión(es)`);
  return problems;
}

const scenarios: Scenario[] = [
  { name: "30min", ia: "26-000006-R", durationMin: 30, drugs: 4, rateInfusions: false },
  { name: "3h", ia: "26-000007-S", durationMin: 180, drugs: 7, rateInfusions: true },
  { name: "5h-12farmacos", ia: "26-000008-T", durationMin: 300, drugs: 12, rateInfusions: true },
];

mkdirSync("out", { recursive: true });
let anyProblem = false;
for (const s of scenarios) {
  const cs = makeCase(s);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const model = buildChartModel(cs);
  const diag = renderChart(doc, model, true);
  writeFileSync(`out/grafica-${s.name}.pdf`, Buffer.from(doc.output("arraybuffer")));
  const problems = verify(diag);
  if (problems.length) anyProblem = true;
  console.log(
    `\n=== ${s.name} (${s.durationMin} min, ${s.drugs} fármacos) ===\n` +
      `  páginas: ${diag.pageCount}  minFont: ${diag.minFontPt.toFixed(2)}pt  llamadas: ${diag.footnotes}  bandSplits: ${diag.bandSplits}\n` +
      `  ancho columna 5 min: ${diag.colWidthMm.toFixed(2)} mm  (col. etiquetas: ${diag.labelColWMm.toFixed(1)} mm)\n` +
      `  fármacos: ${model.drugRows.length}  medidas: ${model.measuredRows.length}  fijados: ${model.fixedRows.length}  líquidos: ${model.fluidInputs.length + model.fluidOutputs.length}\n` +
      `  totales fármacos: ${model.drugRows.map((d) => d.total?.text).filter(Boolean).join(" | ")}\n` +
      `  ${problems.length === 0 ? "✓ OK" : "✗ " + problems.join("; ")}`,
  );
}

// Compatibilidad con caso antiguo
try {
  const cs = makeLegacyCase();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const model = buildChartModel(cs);
  const diag = renderChart(doc, model, true);
  writeFileSync("out/grafica-legacy.pdf", Buffer.from(doc.output("arraybuffer")));
  const problems = verify(diag);
  console.log(
    `\n=== caso ANTIGUO (sin ASA/modo vent./TCI) ===\n` +
      `  páginas: ${diag.pageCount}  minFont: ${diag.minFontPt.toFixed(2)}pt  ASA: ${cs.preop.asa ?? "null"}  ventModes: ${cs.ventModes.length}\n` +
      `  total Remifentanilo (sin concentración): ${model.drugRows.find((d) => d.name === "Remifentanilo")?.total?.text ?? "-"}\n` +
      `  ${problems.length === 0 ? "✓ abre y exporta OK" : "✗ " + problems.join("; ")}`,
  );
  if (problems.length) anyProblem = true;
} catch (e) {
  anyProblem = true;
  console.log(`\n=== caso ANTIGUO ===\n  ✗ EXCEPCIÓN: ${(e as Error).message}`);
}

console.log(anyProblem ? "\nRESULTADO: con problemas" : "\nRESULTADO: todo OK");
