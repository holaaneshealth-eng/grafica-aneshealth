// Genera un PDF de ejemplo para el PR A: técnica "Anestesia local" (con fármaco
// infiltrado y adrenalina) y "Gafas nasales" junto a la FiO2 (fila "O2 gafas nasales").
import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
import type { BaseEvent, EventType } from "../src/domain/events";
import { projectCase } from "../src/store/projection";
import { generateGraphicPages, renderDataPage } from "../src/pdf";

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

const b = new Builder("pr-a");
const ent = new Date("2026-08-04T10:00:00").getTime();
const end = ent + 70 * MIN;

b.add("CASE_CREATED", { ia: "26-000042-A", year: 2026, ordinal: 42 }, ent - 15 * MIN);
b.add("PREOP_INFO_RECORDED", { allergies: "No conocidas", heightCm: 168, weightKg: 70, history: "Sano", medication: "-", asa: "I", asaEmergency: false }, ent - 12 * MIN);
b.add("MONITORING_SELECTED", { standard: ["TAS", "TAD", "TAM", "FC", "SPO2", "ETCO2", "VT", "FR", "PEEP", "FIO2", "O2GN"], custom: [] }, ent - 11 * MIN);

const hitos: [string, number][] = [
  ["Entrada a quirófano", 0], ["Inicio de anestesia", 5], ["Inicio de cirugía", 12],
  ["Extubación", 48], ["Fin de cirugía", 60], ["Salida de quirófano", 70],
];
hitos.forEach(([label, m], i) => b.add("MILESTONE", { id: `m${i}`, at: new Date(ent + m * MIN).toISOString(), label }, ent + m * MIN));

b.add("VENT_MODE_SET", { id: "vm1", at: new Date(ent + 6 * MIN).toISOString(), mode: "VC" }, ent + 6 * MIN);
b.add("VENT_MODE_SET", { id: "vm2", at: new Date(ent + 48 * MIN).toISOString(), mode: "Espontánea" }, ent + 48 * MIN);

// Fase 1 (intubado): VT/FR/PEEP/FiO2. Fase 2 (tras extubar, min 50): gafas nasales a 3 y luego 2 L/min, SIN FiO2.
for (let t = ent; t <= end; t += 5 * MIN) {
  const k = (t - ent) / MIN;
  const sys = 118 + Math.round(14 * Math.sin(k / 10));
  const dia = 68 + Math.round(8 * Math.sin(k / 12));
  const map = Math.round((sys + 2 * dia) / 3);
  const fc = 70 + Math.round(10 * Math.sin(k / 9));
  const spo2 = 98;
  if (k <= 48) {
    const fio2 = k < 25 ? 50 : 45;
    b.add("VITALS_RECORDED", { id: `vit${k}`, at: new Date(t).toISOString(), source: "manual", values: { TAS: sys, TAD: dia, TAM: map, FC: fc, SPO2: spo2, ETCO2: 35, VT: 480, FR: 12, PEEP: 5, FIO2: fio2 } }, t);
  } else {
    const o2gn = k < 60 ? 3 : 2; // gafas nasales: cambia de 3 a 2 L/min
    b.add("VITALS_RECORDED", { id: `vit${k}`, at: new Date(t).toISOString(), source: "manual", values: { TAS: sys, TAD: dia, TAM: map, FC: fc, SPO2: spo2, O2GN: o2gn } }, t);
  }
}

// Técnicas: anestesia local (infiltra el cirujano) + sedación moderada (combinación).
b.add("TECHNIQUE_ADDED", { id: "t1", type: "sedacion_moderada", label: "Sedación moderada", details: { notes: "Propofol a demanda" }, at: new Date(ent + 4 * MIN).toISOString() }, ent + 4 * MIN);
b.add("TECHNIQUE_ADDED", { id: "t2", type: "local", label: "Anestesia local", details: { infiltrador: "Cirujano" }, at: new Date(ent + 10 * MIN).toISOString() }, ent + 10 * MIN);

// Medicación de la anestesia local: anestésico local infiltrado, con adrenalina (vía Infiltración).
// 1 % · 10 ml = 100 mg de lidocaína.
b.add("DRUG_BOLUS", { id: "bl1", drug: "Lidocaína infiltración", dose: 100, unit: "mg", at: new Date(ent + 11 * MIN).toISOString(), route: "Infiltración", concentration: 1, volumeMl: 10, adrenaline: true }, ent + 11 * MIN);
b.add("DRUG_BOLUS", { id: "bl2", drug: "Lidocaína infiltración", dose: 50, unit: "mg", at: new Date(ent + 35 * MIN).toISOString(), route: "Infiltración", concentration: 1, volumeMl: 5, adrenaline: true }, ent + 35 * MIN);
// Un bolo IV normal para contraste.
b.add("DRUG_BOLUS", { id: "bp1", drug: "Propofol", dose: 60, unit: "mg", at: new Date(ent + 5 * MIN).toISOString() }, ent + 5 * MIN);

b.add("SURGERY_ENDED", {}, end);

const cs = projectCase(b.events)!;
const doc = new jsPDF("l", "mm", "a4");
generateGraphicPages(doc, cs, { reuseFirstPage: true });
renderDataPage(doc, cs);
mkdirSync("out", { recursive: true });
const outPath = "out/ejemplo-pr-a-local-gafas.pdf";
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log("PDF escrito en " + outPath);
console.log("Técnicas:", cs.techniques.map((t) => `${t.label}`).join(", "));
console.log("Bolos Infiltración:", cs.boluses.filter((x) => x.route === "Infiltración").map((x) => `${x.drug} ${x.dose} ${x.unit}${x.adrenaline ? " +adr" : ""}`).join(" | "));
const vitO2gn = cs.vitals.filter((v) => v.values.O2GN != null).map((v) => v.values.O2GN);
console.log("Valores O2GN registrados:", vitO2gn.join(", "));
