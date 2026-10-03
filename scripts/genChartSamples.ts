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
  add(type: EventType, payload: Record<string, unknown>, at: number): BaseEvent {
    const iso = new Date(at).toISOString();
    const ev: BaseEvent = {
      eventId: `e${this.n++}`,
      caseId: this.caseId,
      type,
      occurredAt: iso,
      recordedAt: iso,
      actor: this.actor,
      payload,
    };
    this.events.push(ev);
    return ev;
  }
}

interface Scenario {
  name: string;
  ia: string;
  durationMin: number;
  drugs: number; // nº de bolos distintos
  rateInfusions: boolean;
  fluids: boolean;
  outputs: boolean;
}

const DRUG_POOL: { name: string; dose: number; unit: string }[] = [
  { name: "Propofol", dose: 200, unit: "mg" },
  { name: "Fentanilo", dose: 150, unit: "mcg" },
  { name: "Rocuronio", dose: 50, unit: "mg" },
  { name: "Midazolam", dose: 3, unit: "mg" },
  { name: "Dexametasona", dose: 8, unit: "mg" },
  { name: "Ondansetron", dose: 4, unit: "mg" },
  { name: "Paracetamol", dose: 1000, unit: "mg" },
  { name: "Sugammadex", dose: 200, unit: "mg" },
  { name: "Efedrina", dose: 6, unit: "mg" },
  { name: "Atropina", dose: 0.5, unit: "mg" },
  { name: "Lidocaina", dose: 40, unit: "mg" },
  { name: "Cisatracurio", dose: 14, unit: "mg" },
];

function makeCase(s: Scenario) {
  const caseId = s.name;
  const b = new Builder(caseId);
  // ENT a las 12:08 -> el eje empieza a las 12:00
  const ent = new Date("2026-02-10T12:08:00").getTime();
  const end = ent + s.durationMin * MIN;

  b.add("CASE_CREATED", { ia: s.ia, year: 2026, ordinal: 123 }, ent - 20 * MIN);
  b.add("PREOP_INFO_RECORDED", {
    allergies: "No conocidas", heightCm: 170, weightKg: 72, history: "HTA", medication: "Enalapril", asa: "II", asaEmergency: false,
  }, ent - 18 * MIN);
  b.add("MONITORING_SELECTED", {
    standard: ["TAS", "TAD", "TAM", "FC", "SPO2", "ETCO2", "TEMP", "VT", "FR", "PEEP", "FIO2"],
    custom: [{ code: "BIS", label: "BIS", unit: "", chart: true, color: "#a78bfa" }],
  }, ent - 17 * MIN);

  // hitos
  b.add("MILESTONE", { id: "m1", at: new Date(ent).toISOString(), label: "Entrada en quirofano" }, ent);
  b.add("MILESTONE", { id: "m2", at: new Date(ent + 2 * MIN).toISOString(), label: "Monitor conectado" }, ent + 2 * MIN);
  b.add("MILESTONE", { id: "m3", at: new Date(ent + 5 * MIN).toISOString(), label: "Preoxigenacion" }, ent + 5 * MIN);
  b.add("MILESTONE", { id: "m4", at: new Date(ent + 7 * MIN).toISOString(), label: "Induccion" }, ent + 7 * MIN);
  b.add("MILESTONE", { id: "m5", at: new Date(ent + 10 * MIN).toISOString(), label: "Intubacion" }, ent + 10 * MIN);
  b.add("MILESTONE", { id: "m6", at: new Date(ent + 15 * MIN).toISOString(), label: "Inicio cirugia" }, ent + 15 * MIN);
  b.add("MILESTONE", { id: "m7", at: new Date(end - 10 * MIN).toISOString(), label: "Fin cirugia" }, end - 10 * MIN);
  b.add("MILESTONE", { id: "m8", at: new Date(end - 5 * MIN).toISOString(), label: "Fin de anestesia" }, end - 5 * MIN);
  b.add("MILESTONE", { id: "m9", at: new Date(end).toISOString(), label: "Salida de quirofano" }, end);

  // modo ventilatorio: VC desde intubación, cambia a PC a mitad
  b.add("VENT_MODE_SET", { id: "v1", at: new Date(ent + 10 * MIN).toISOString(), mode: "VC" }, ent + 10 * MIN);
  b.add("VENT_MODE_SET", { id: "v2", at: new Date(ent + Math.floor(s.durationMin / 2) * MIN).toISOString(), mode: "PC" }, ent + Math.floor(s.durationMin / 2) * MIN);

  // vitales cada 5 min
  let vt = 480, fr = 12, peep = 5, fio2 = 50;
  for (let t = ent; t <= end; t += 5 * MIN) {
    const k = (t - ent) / MIN;
    const sys = 120 + Math.round(18 * Math.sin(k / 11)) ;
    const dia = 70 + Math.round(10 * Math.sin(k / 13));
    const map = Math.round((sys + 2 * dia) / 3);
    const fc = 72 + Math.round(14 * Math.sin(k / 9));
    let spo2 = 98 - (k % 37 === 0 ? 9 : 0); // alguna caída <92
    let etco2 = 35 + Math.round(4 * Math.sin(k / 7)) + (k % 41 === 0 ? 14 : 0); // alguna subida >45
    let temp = 36.5 - (k < 15 ? 0.9 : 0); // hipotermia inicial <36
    let bis = 45 + Math.round(6 * Math.sin(k / 5)) + (k % 53 === 0 ? 22 : 0); // alguna subida >60
    // cambios de parámetros fijados (una vez)
    if (k >= Math.floor(s.durationMin / 3) * 1) { vt = 500; }
    if (k >= Math.floor(s.durationMin / 2) * 1) { fr = 14; peep = 6; fio2 = 45; }
    b.add("VITALS_RECORDED", {
      id: `vit${k}`, at: new Date(t).toISOString(), source: "manual",
      values: { TAS: sys, TAD: dia, TAM: map, FC: fc, SPO2: spo2, ETCO2: etco2, TEMP: Math.round(temp * 10) / 10, BIS: bis, VT: vt, FR: fr, PEEP: peep, FIO2: fio2 },
    }, t);
  }

  // bolos
  const nDrugs = Math.min(s.drugs, DRUG_POOL.length);
  for (let i = 0; i < nDrugs; i++) {
    const d = DRUG_POOL[i];
    b.add("DRUG_BOLUS", { id: `b${i}`, drug: d.name, dose: d.dose, unit: d.unit, at: new Date(ent + (7 + i) * MIN).toISOString() }, ent + (7 + i) * MIN);
  }
  // segundo bolo de propofol más tarde (para total acumulado)
  b.add("DRUG_BOLUS", { id: "bp2", drug: "Propofol", dose: 50, unit: "mg", at: new Date(ent + 40 * MIN).toISOString() }, Math.min(end, ent + 40 * MIN));

  // perfusiones TCI
  b.add("INFUSION_STARTED", { id: "inf-remi", drug: "Remifentanilo", tci: true, targetType: "Ce", targetConc: 3, targetUnit: "ng/ml", tciModel: "Minto", rateMlH: 0, weightBasedDose: 0, doseUnit: "", amountUnit: "mcg", concentration: 50, concentrationUnit: "mcg/ml", summary: "TCI", startedAt: new Date(ent + 7 * MIN).toISOString(), active: true }, ent + 7 * MIN);
  b.add("INFUSION_RATE_CHANGED", { id: "inf-remi", targetConc: 4, targetType: "Ce", rateMlH: 0, weightBasedDose: 0 }, ent + 20 * MIN);
  if (s.durationMin > 60) b.add("INFUSION_RATE_CHANGED", { id: "inf-remi", targetConc: 2.5, targetType: "Ce", rateMlH: 0, weightBasedDose: 0 }, ent + 70 * MIN);

  b.add("INFUSION_STARTED", { id: "inf-prop", drug: "Propofol", tci: true, targetType: "Cp", targetConc: 3.5, targetUnit: "mcg/ml", tciModel: "Eleveld", rateMlH: 0, weightBasedDose: 0, doseUnit: "", amountUnit: "mg", concentration: 10, concentrationUnit: "mg/ml", summary: "TCI", startedAt: new Date(ent + 7 * MIN).toISOString(), active: true }, ent + 7 * MIN);
  b.add("INFUSION_RATE_CHANGED", { id: "inf-prop", targetConc: 3.0, targetType: "Cp", rateMlH: 0, weightBasedDose: 0 }, ent + 30 * MIN);

  if (s.rateInfusions) {
    // Noradrenalina en ritmo con cambios
    b.add("INFUSION_STARTED", { id: "inf-nora", drug: "Noradrenalina", rateMlH: 6, weightBasedDose: 0.05, doseUnit: "mcg/kg/min", amountUnit: "mcg", concentration: 16, concentrationUnit: "mcg/ml", summary: "", startedAt: new Date(ent + 25 * MIN).toISOString(), active: true }, ent + 25 * MIN);
    b.add("INFUSION_RATE_CHANGED", { id: "inf-nora", rateMlH: 10, weightBasedDose: 0.08, doseUnit: "mcg/kg/min" }, ent + 55 * MIN);
    b.add("INFUSION_RATE_CHANGED", { id: "inf-nora", rateMlH: 4, weightBasedDose: 0.03, doseUnit: "mcg/kg/min" }, ent + 120 * MIN);
    // Dexmedetomidina perfusión convencional µg/kg/h
    b.add("INFUSION_STARTED", { id: "inf-dex", drug: "Dexmedetomidina", rateMlH: 7, weightBasedDose: 0.5, doseUnit: "mcg/kg/h", amountUnit: "mcg", concentration: 4, concentrationUnit: "mcg/ml", summary: "", startedAt: new Date(ent + 30 * MIN).toISOString(), active: true }, ent + 30 * MIN);
    b.add("INFUSION_STOPPED", { id: "inf-dex", drug: "Dexmedetomidina" }, end - 20 * MIN);
  }

  if (s.fluids) {
    b.add("FLUID_IN", { id: "f1", at: new Date(ent + 5 * MIN).toISOString(), category: "cristaloide", label: "Ringer lactato", volumeMl: 500 }, ent + 5 * MIN);
    b.add("FLUID_IN", { id: "f2", at: new Date(ent + 60 * MIN).toISOString(), category: "cristaloide", label: "Ringer lactato", volumeMl: 500 }, Math.min(end, ent + 60 * MIN));
    b.add("FLUID_IN", { id: "f3", at: new Date(ent + 35 * MIN).toISOString(), category: "coloide", label: "Voluven", volumeMl: 250 }, Math.min(end, ent + 35 * MIN));
    if (s.rateInfusions) b.add("FLUID_IN", { id: "f4", at: new Date(ent + 90 * MIN).toISOString(), category: "sangre", label: "Conc. hematíes", volumeMl: 300 }, Math.min(end, ent + 90 * MIN));
  }
  if (s.outputs) {
    b.add("FLUID_OUT", { id: "o1", from: new Date(ent + 20 * MIN).toISOString(), to: new Date(ent + 80 * MIN).toISOString(), category: "sangrado", volumeMl: 350 }, ent + 80 * MIN);
    b.add("FLUID_OUT", { id: "o2", from: new Date(ent + 30 * MIN).toISOString(), to: new Date(end).toISOString(), category: "diuresis", volumeMl: 600 }, end);
  }

  b.add("SURGERY_ENDED", {}, end);

  const cs = projectCase(b.events)!;
  return { cs, events: b.events };
}

// ---------- verificación ----------
function verify(name: string, diag: Diagnostics): string[] {
  const problems: string[] = [];
  if (diag.minFontPt < 7 - 1e-6) problems.push(`fuente < 7pt (${diag.minFontPt.toFixed(2)})`);
  if (diag.bandSplits > 0) problems.push(`${diag.bandSplits} banda(s) divididas por filas`);
  // colisiones dentro de página+grupo
  const byKey = new Map<string, typeof diag.labelBoxes>();
  for (const lb of diag.labelBoxes) {
    const key = `${lb.page}|${lb.group}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(lb);
  }
  let collisions = 0;
  for (const boxes of byKey.values()) {
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        const ov = a.x0 < c.x1 && a.x1 > c.x0 && a.y0 < c.y1 && a.y1 > c.y0;
        if (ov) collisions++;
      }
  }
  if (collisions > 0) problems.push(`${collisions} colisión(es) de etiquetas`);
  return problems;
}

// ---------- ejecución ----------
const scenarios: Scenario[] = [
  { name: "30min", ia: "26-000101-5", durationMin: 30, drugs: 4, rateInfusions: false, fluids: true, outputs: false },
  { name: "3h", ia: "26-000102-3", durationMin: 180, drugs: 7, rateInfusions: true, fluids: true, outputs: true },
  { name: "5h-12farmacos", ia: "26-000103-1", durationMin: 300, drugs: 12, rateInfusions: true, fluids: true, outputs: true },
];

mkdirSync("out", { recursive: true });
let anyProblem = false;
for (const s of scenarios) {
  const { cs, events } = makeCase(s);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const model = buildChartModel(cs, events);
  const diag = renderChart(doc, model, true);
  writeFileSync(`out/grafica-${s.name}.pdf`, Buffer.from(doc.output("arraybuffer")));
  const problems = verify(s.name, diag);
  const ok = problems.length === 0;
  if (!ok) anyProblem = true;
  console.log(
    `\n=== ${s.name} (${s.durationMin} min, ${s.drugs} fármacos) ===\n` +
      `  páginas: ${diag.pageCount}  minFont: ${diag.minFontPt.toFixed(2)}pt  llamadas: ${diag.footnotes}  bandSplits: ${diag.bandSplits}\n` +
      `  fármacos: ${model.drugRows.length}  medidas: ${model.measuredRows.length}  fijados: ${model.fixedRows.length}  líquidos: ${model.fluidInputs.length + model.fluidOutputs.length}\n` +
      `  ${ok ? "✓ OK" : "✗ PROBLEMAS: " + problems.join("; ")}`,
  );
}
console.log(anyProblem ? "\nRESULTADO: con problemas" : "\nRESULTADO: todo OK");
