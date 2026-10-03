import type { OcrWord } from "../src/vision/ocrTypes";
import { parseTrendTable, classifyLabel } from "../src/vision/trendTableParser";

function w(text: string, xc: number, yc: number, half = 12): OcrWord {
  return { text, x0: xc - half, x1: xc + half, y0: yc - 6, y1: yc + 6 };
}
function assert(c: boolean, m: string) {
  console.log((c ? "✓ " : "✗ ") + m);
  if (!c) process.exitCode = 1;
}

// Rejilla sintética: cabecera de horas + filas FC, NIBP (TA), SpO2, VT.
const words: OcrWord[] = [
  w("08:00", 200, 10), w("08:05", 300, 10), w("08:10", 400, 10),
  w("HR", 20, 50), w("70", 200, 50), w("72", 300, 50), w("75", 400, 50),
  w("NIBP", 22, 90), w("125/70", 200, 90), w("(88)", 226, 90), w("120/68", 300, 90), w("(84)", 326, 90),
  w("SpO2", 25, 130), w("98", 200, 130), w("99", 300, 130), w("97", 400, 130),
  w("VT", 20, 170), w("480", 200, 170), w("480", 300, 170), w("500", 400, 170),
];

assert(classifyLabel("NIBP").kind === "bp", "NIBP se clasifica como tensión arterial");
assert(classifyLabel("HR").code === "FC", "HR -> FC");
assert(classifyLabel("SpO2").code === "SPO2", "SpO2 -> SPO2");

const r = parseTrendTable(words);
assert(r.columns === 3, `detecta 3 columnas horarias (${r.columns})`);

const find = (p: string, h: string) => r.readings.find((x) => x.parametro === p && x.hora === h)?.valor;
assert(find("FC", "08:00") === 70 && find("FC", "08:10") === 75, "FC en sus columnas");
assert(find("TAS", "08:00") === 125 && find("TAD", "08:00") === 70 && find("TAM", "08:00") === 88, "TA 08:00 = 125/70 (88) -> TAS/TAD/TAM");
assert(find("TAS", "08:05") === 120 && find("TAM", "08:05") === 84, "TA 08:05 desglosada");
assert(find("SPO2", "08:05") === 99, "SpO2 en su columna");
assert(find("VT", "08:10") === 500, "VT leído (regla de fijados se aplica al volcar, no al leer)");

console.log(process.exitCode ? "\nRESULTADO: con fallos" : "\nRESULTADO: todo OK");
