import type { OcrWord } from "../src/vision/ocrTypes";
import { parseTrendTable, classifyLabel } from "../src/vision/trendTableParser";

function w(text: string, xc: number, yc: number, half = 14): OcrWord {
  return { text, x0: xc - half, x1: xc + half, y0: yc - 6, y1: yc + 6 };
}
function assert(c: boolean, m: string) {
  console.log((c ? "✓ " : "✗ ") + m);
  if (!c) process.exitCode = 1;
}

// Clasificación de etiquetas Mindray
assert(classifyLabel("FP").kind === "ignore", "FP se ignora (duplica la FC)");
assert(classifyLabel("Origen: SpO2").kind === "ignore", "subtítulo 'Origen: SpO2' se ignora");
assert(classifyLabel("PANI").kind === "bp" && classifyLabel("PA").kind === "bp" && classifyLabel("ART").kind === "bp", "PANI/PA/ART -> tensión");
assert(classifyLabel("T1").code === "TEMP" && classifyLabel("T2").code === "TEMP", "T1/T2 -> TEMP");
assert(classifyLabel("PVC").code === "PVC" && classifyLabel("EtCO2").code === "ETCO2" && classifyLabel("FR").code === "FR", "PVC/EtCO2/FR");

// Rejilla sintética tipo Mindray ePM
const words: OcrWord[] = [
  w("2026-10-05", 60, 6, 40),
  w("07:40", 200, 30), w("07:45", 300, 30), w("07:50", 400, 30),
  w("FC", 20, 70), w("60", 200, 70), w("Origen:SpO2", 250, 70, 30), w("70", 300, 70), w("65", 400, 70),
  w("SpO2", 20, 110), w("100", 200, 110), w("84", 300, 110), w("95", 400, 110),
  w("PANI", 20, 150), w("157/87", 200, 150), w("(99)", 226, 150), w("07:39", 205, 162), w("--", 300, 150), w("--", 400, 150),
  w("FP", 20, 190), w("60", 200, 190), w("70", 300, 190), w("65", 400, 190),
  w("T1", 20, 230), w("18.0", 200, 230), w("18.1", 300, 230), w("18.1", 400, 230),
  w("PVC", 20, 270), w("8", 200, 270), w("9", 300, 270), w("7", 400, 270),
];

const r = parseTrendTable(words);
assert(r.detectedDate === "2026-10-05", `detecta la fecha de cabecera (${r.detectedDate})`);
const find = (p: string, h: string) => r.readings.find((x) => x.parametro === p && x.hora === h)?.valor;
assert(find("FC", "07:40") === 60 && find("FC", "07:50") === 65, "FC leída (subtítulo 'Origen' descartado)");
assert(find("TAS", "07:40") === 157 && find("TAD", "07:40") === 87 && find("TAM", "07:40") === 99, "PANI 157/87 (99) -> TAS/TAD/TAM (sello 07:39 descartado)");
assert(find("TEMP", "07:40") === 18 && find("TEMP", "07:45") === 18.1, "T1 -> TEMP");
assert(find("PVC", "07:50") === 7, "PVC leída");
assert(!r.readings.some((x) => x.parametro === "FP"), "FP NO se vuelca");
assert(!r.readings.some((x) => /origen/i.test(x.parametro) || x.parametro === "07:39"), "ni 'Origen' ni el sello de hora generan lecturas");

console.log(process.exitCode ? "\nRESULTADO: con fallos" : "\nRESULTADO: todo OK");
