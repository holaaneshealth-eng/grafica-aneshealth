import { emptyCaseState, type CaseState } from "../src/domain/events";
import { buildReview, buildVitalsToWrite, type VisionReading } from "../src/domain/visionImport";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("✗ " + msg);
    process.exitCode = 1;
  } else {
    console.log("✓ " + msg);
  }
}

const cs: CaseState = emptyCaseState("c1", "26-000009-U", 2026, 9, "2026-02-10T12:00:00");
// valor MANUAL existente (FC a las 12:05) y uno importado por FOTO (SpO2 a las 12:10)
cs.vitals.push({ id: "m1", at: "2026-02-10T12:05:00", source: "manual", values: { FC: 80 } });
cs.vitals.push({ id: "f0", at: "2026-02-10T12:10:00", source: "foto", values: { SPO2: 97 } });

const readings: VisionReading[] = [
  { hora: "12:05", parametro: "FC", valor: 82 }, // conflicto con manual 80
  { hora: "12:05", parametro: "SPO2", valor: 98 }, // nuevo
  { hora: "12:10", parametro: "SPO2", valor: 97 }, // duplicado (ya hay foto)
  { hora: "12:00", parametro: "VT", valor: 480 }, // fijado
  { hora: "12:05", parametro: "VT", valor: 480 }, // fijado SIN cambio -> se omite
  { hora: "12:10", parametro: "VT", valor: 500 }, // fijado cambia -> se mantiene
  { hora: "12:05", parametro: "XYZ", valor: 5 }, // desconocido
];

const items = buildReview(readings, cs, 0);
const fc = items.find((i) => i.code === "FC")!;
assert(fc.conflict && fc.manualValue === 80 && fc.accept === false, "FC en conflicto conserva el manual por defecto");
const spoDup = items.find((i) => i.code === "SPO2" && i.timeLabel === "12:10")!;
assert(spoDup.duplicatePhoto && spoDup.accept === false, "SpO2 duplicada no se reimporta");
const spoNew = items.find((i) => i.code === "SPO2" && i.timeLabel === "12:05")!;
assert(spoNew.accept === true && !spoNew.conflict, "SpO2 nueva se acepta");
assert(items.some((i) => !i.known && i.code === "XYZ"), "XYZ aparece como no reconocido");

const w1 = buildVitalsToWrite(items);
const flat1 = w1.flatMap((w) => Object.entries(w.values).map(([c, v]) => `${c}@${new Date(w.at).toISOString().slice(11, 16)}=${v}`));
assert(flat1.includes("SPO2@12:05=98"), "vuelca SpO2 nueva");
assert(!flat1.some((s) => s.startsWith("FC@")), "no vuelca FC en conflicto (por defecto)");
assert(!flat1.includes("SPO2@12:10=97"), "no vuelca SpO2 duplicada");
assert(flat1.includes("VT@12:00=480") && flat1.includes("VT@12:10=500") && !flat1.includes("VT@12:05=480"), "fijado VT: solo inicio y cambio (omite el repetido)");

// El usuario decide sustituir el manual de FC:
const items2 = items.map((i) => (i.code === "FC" ? { ...i, accept: true } : i));
const flat2 = buildVitalsToWrite(items2).flatMap((w) => Object.keys(w.values).map((c) => `${c}@${new Date(w.at).toISOString().slice(11, 16)}`));
assert(flat2.includes("FC@12:05"), "si el usuario acepta, FomboFC entra");

console.log(process.exitCode ? "\nRESULTADO: con fallos" : "\nRESULTADO: todo OK");
