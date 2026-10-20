// Aviso de dosis máxima de anestésicos locales en analgesia de parto.
// La toxicidad sistémica depende de los BOLOS (dosis de carga, rescates, extensión para la
// cesárea), NO de la perfusión de mantenimiento de la bomba, y las dosis se redistribuyen/
// metabolizan con el tiempo: solo se cuentan las administradas en las 2 horas previas.
import type { CaseState } from "./events";
import { localAnestheticMax } from "./clinical";

const TWO_H = 2 * 60 * 60 * 1000;

export interface LaBolusItem {
  drug: string;
  mg: number;
  at: string;
  adrenaline?: boolean;
}

/** Bolos de anestésico local del caso: dosis de carga, rescates y bolos (extensión/quirófano). */
export function laborLaBolusItems(cs: CaseState): LaBolusItem[] {
  const items: LaBolusItem[] = [];
  const ld = cs.labor.loadingDose;
  if (ld && localAnestheticMax(ld.drug)) items.push({ drug: ld.drug, mg: ld.doseMg, at: ld.at });
  cs.labor.rescues.forEach((r) => {
    if (localAnestheticMax(r.drug)) items.push({ drug: r.drug, mg: r.doseMg, at: r.at });
  });
  cs.boluses.forEach((b) => {
    if (!localAnestheticMax(b.drug)) return;
    const mg = b.unit === "mg" ? b.dose : b.unit === "mcg" ? b.dose / 1000 : 0;
    if (mg > 0) items.push({ drug: b.drug, mg, at: b.at, adrenaline: b.adrenaline });
  });
  return items;
}

export type LaborLaResult =
  | { kind: "noweight" }
  | { kind: "over"; total: number; lines: string }
  | null;

/**
 * Comprueba la dosis máxima de anestésico local al registrar un nuevo bolo. Suma el % de la
 * dosis máxima (según peso, con/sin adrenalina) de cada bolo en las 2 h previas al nuevo.
 * Devuelve null si no aplica o no supera el 100 %.
 */
export function laborLaWarning(cs: CaseState, newDrug: string, newMg: number, newAtIso: string, newAdr?: boolean): LaborLaResult {
  if (!localAnestheticMax(newDrug)) return null; // el nuevo bolo no es un anestésico local
  const w = cs.preop.weightKg;
  if (!w || w <= 0) return { kind: "noweight" };
  const newAt = new Date(newAtIso).getTime();
  const windowStart = newAt - TWO_H;
  const items = [...laborLaBolusItems(cs), { drug: newDrug, mg: newMg, at: newAtIso, adrenaline: newAdr }].filter((it) => {
    const t = new Date(it.at).getTime();
    return t >= windowStart && t <= newAt;
  });
  const byLabel = new Map<string, { mg: number; pct: number }>();
  let total = 0;
  for (const it of items) {
    const info = localAnestheticMax(it.drug, it.adrenaline);
    if (!info) continue;
    const maxMg = info.mgPerKg * w;
    const pct = maxMg > 0 ? (it.mg / maxMg) * 100 : 0;
    total += pct;
    const cur = byLabel.get(info.label) ?? { mg: 0, pct: 0 };
    cur.mg += it.mg;
    cur.pct += pct;
    byLabel.set(info.label, cur);
  }
  if (total <= 100) return null;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const lines = Array.from(byLabel.entries()).map(([l, v]) => `• ${l}: ${r1(v.mg)} mg (${Math.round(v.pct)} %)`).join("\n");
  return { kind: "over", total: Math.round(total), lines };
}

/** Texto del aviso para window.confirm (o null si no hay aviso). */
export function laborLaConfirmText(r: LaborLaResult): string | null {
  if (!r) return null;
  if (r.kind === "noweight") return "Sin peso registrado: no se puede comprobar la dosis máxima de anestésicos locales.\n\n¿Guardar de todas formas?";
  return `Dosis acumulada de anestésicos locales (bolos de las últimas 2 h): ${r.total} % de la máxima para el peso.\n\n${r.lines}\n\n¿Guardar de todas formas?`;
}
