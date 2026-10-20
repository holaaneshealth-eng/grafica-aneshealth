import type { CaseState } from "./events";

const ms = (s: string) => new Date(s).getTime();

// Dosis total de anestésico local (mg) y de opioide (µg): dosis de carga + rescates +
// volumen infundido por la bomba según la concentración de cada tramo (programa).
// El volumen por tramo se estima interpolando el volumen acumulado de las lecturas de bomba.
export function laborTotals(cs: CaseState): { alMg: number; opioidUg: number } {
  const L = cs.labor;
  let alMg = (L.loadingDose?.doseMg ?? 0) + L.rescues.reduce((s, r) => s + (r.doseMg || 0), 0);
  let opioidUg = 0;

  const progs = L.pumpPrograms.slice().sort((a, b) => a.at.localeCompare(b.at));
  const readings = L.readings.slice().sort((a, b) => a.at.localeCompare(b.at));

  if (progs.length && readings.length) {
    const firstT = ms(readings[0].at);
    const lastT = ms(readings[readings.length - 1].at);
    const lastVol = readings[readings.length - 1].totalMl;
    const volAt = (t: number): number => {
      if (t <= firstT) return 0; // antes de la primera lectura se asume poco volumen
      if (t >= lastT) return lastVol;
      for (let i = 0; i < readings.length - 1; i++) {
        const a = ms(readings[i].at);
        const b = ms(readings[i + 1].at);
        if (t >= a && t <= b) {
          const va = readings[i].totalMl;
          const vb = readings[i + 1].totalMl;
          return b > a ? va + ((vb - va) * (t - a)) / (b - a) : va;
        }
      }
      return lastVol;
    };
    const endAll = Math.max(lastT, cs.convertedAt ? ms(cs.convertedAt) : 0, L.delivery ? ms(L.delivery.at) : 0);
    for (let i = 0; i < progs.length; i++) {
      const start = ms(progs[i].at);
      const end = i + 1 < progs.length ? ms(progs[i + 1].at) : endAll || lastT;
      const v = Math.max(0, volAt(end) - volAt(start));
      alMg += v * (progs[i].laPct * 10); // % -> mg/ml
      opioidUg += v * (progs[i].opioidUgMl ?? 0);
    }
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { alMg: r1(alMg), opioidUg: r1(opioidUg) };
}
