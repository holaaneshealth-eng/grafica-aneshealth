// PDF de ejemplo para el PR B: anestesiólogo responsable + relevo, y firma personal
// (Dr./Dra. · Nº colegiado · fecha/hora) en la página de datos.
import { jsPDF } from "jspdf";
import { writeFileSync, mkdirSync } from "node:fs";
import type { BaseEvent, EventType } from "../src/domain/events";
import { projectCase } from "../src/store/projection";
import { generateGraphicPages, renderDataPage } from "../src/pdf";

const MIN = 60 * 1000;
let n = 0;
const ev: BaseEvent[] = [];
const add = (type: EventType, payload: Record<string, unknown>, at: number) => {
  const iso = new Date(at).toISOString();
  ev.push({ eventId: `e${n++}`, caseId: "pr-b", type, occurredAt: iso, recordedAt: iso, actor: "quirofano3", payload });
};

const ent = new Date("2026-08-04T09:00:00").getTime();
const end = ent + 95 * MIN;

add("CASE_CREATED", { ia: "26-000051-B", year: 2026, ordinal: 51 }, ent - 15 * MIN);
// Responsable al iniciar el caso (sin PIN, solo selección).
add("RESPONSIBLE_SET", { anesthesiologistId: "an-1", name: "Ana García López", colegiado: "282812345", title: "Dra." }, ent - 14 * MIN);
add("PREOP_INFO_RECORDED", { allergies: "No conocidas", heightCm: 172, weightKg: 78, history: "HTA", medication: "Enalapril", asa: "II", asaEmergency: false }, ent - 12 * MIN);
add("MONITORING_SELECTED", { standard: ["TAS", "TAD", "TAM", "FC", "SPO2", "ETCO2", "VT", "FR", "PEEP", "FIO2"], custom: [] }, ent - 11 * MIN);

const hitos: [string, number][] = [
  ["Entrada a quirófano", 0], ["Inicio de anestesia", 6], ["Inicio de cirugía", 14],
  ["Fin de cirugía", 86], ["Fin de anestesia", 90], ["Salida de quirófano", 95],
];
hitos.forEach(([label, m], i) => add("MILESTONE", { id: `m${i}`, at: new Date(ent + m * MIN).toISOString(), label }, ent + m * MIN));

add("VENT_MODE_SET", { id: "vm1", at: new Date(ent + 8 * MIN).toISOString(), mode: "VC" }, ent + 8 * MIN);
for (let t = ent; t <= end; t += 5 * MIN) {
  const k = (t - ent) / MIN;
  add("VITALS_RECORDED", { id: `v${k}`, at: new Date(t).toISOString(), source: "manual", values: { TAS: 120 + Math.round(12 * Math.sin(k / 10)), TAD: 70 + Math.round(8 * Math.sin(k / 12)), TAM: 88, FC: 72 + Math.round(10 * Math.sin(k / 9)), SPO2: 98, ETCO2: 35, VT: 500, FR: 12, PEEP: 5, FIO2: 50 } }, t);
}
add("TECHNIQUE_ADDED", { id: "t1", type: "gen_iot", label: "General con intubación orotraqueal", details: { cormack: "I", tubeType: "Orotraqueal", caliber: "7.5" }, at: new Date(ent + 7 * MIN).toISOString() }, ent + 7 * MIN);
add("DRUG_BOLUS", { id: "b1", drug: "Propofol", dose: 200, unit: "mg", at: new Date(ent + 6 * MIN).toISOString() }, ent + 6 * MIN);
add("DRUG_BOLUS", { id: "b2", drug: "Fentanilo", dose: 150, unit: "mcg", at: new Date(ent + 7 * MIN).toISOString() }, ent + 7 * MIN);

// Relevo a mitad del caso: nuevo responsable y hora.
add("RESPONSIBLE_RELAY", { anesthesiologistId: "an-2", name: "Juan Pérez Ruiz", colegiado: "282899001", title: "Dr." }, ent + 50 * MIN);

add("SURGERY_ENDED", {}, end);
// Firma personal (como la graba el servidor tras validar el PIN): la firma el 2º responsable.
add("CASE_SIGNED", { signedBy: "Juan Pérez Ruiz", anesthesiologistId: "an-2", colegiado: "282899001", title: "Dr." }, end + 3 * MIN);

const cs = projectCase(ev)!;
const doc = new jsPDF("l", "mm", "a4");
generateGraphicPages(doc, cs, { reuseFirstPage: true });
renderDataPage(doc, cs);
mkdirSync("out", { recursive: true });
const outPath = "out/ejemplo-pr-b-firma-relevo.pdf";
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log("PDF escrito en " + outPath);
console.log("Responsable:", cs.responsible?.title, cs.responsible?.name, "· col.", cs.responsible?.colegiado);
console.log("Relevos:", cs.relays.map((r) => `${r.title} ${r.name} (${new Date(r.at).toISOString().slice(11, 16)})`).join(" | "));
console.log("Firmado por:", cs.signedTitle, cs.signedBy, "· Nº colegiado", cs.signedColegiado, "· signedAt", cs.signedAt);
