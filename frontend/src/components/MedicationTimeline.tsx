import { useMemo } from "react";
import type { CaseState } from "../domain/events";
import { hhmm } from "../utils/time";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
  light?: boolean;
}

const PALETTE = ["#34d399", "#f59e0b", "#60a5fa", "#f472b6", "#a78bfa", "#2dd4bf", "#fb923c", "#818cf8", "#e879f9", "#4ade80", "#f87171"];

// Representa los fármacos en una línea de tiempo:
//  - Bolus: rombos sobre el tiempo con la dosis.
//  - Perfusión: barra gruesa continua del inicio al fin, con los ritmos sobre cada cambio.
export function MedicationTimeline({ cs, light }: Props) {
  const model = useMemo(() => {
    const drugs = Array.from(new Set([...cs.boluses.map((b) => b.drug), ...cs.infusions.map((i) => i.drug)]));
    const times: number[] = [new Date(cs.createdAt).getTime()];
    cs.boluses.forEach((b) => times.push(new Date(b.at).getTime()));
    cs.infusions.forEach((i) => {
      times.push(new Date(i.startedAt).getTime());
      (i.changes ?? []).forEach((c) => times.push(new Date(c.at).getTime()));
      if (i.stoppedAt) times.push(new Date(i.stoppedAt).getTime());
    });
    const end = cs.endedAt ? new Date(cs.endedAt).getTime() : Date.now();
    times.push(end);
    const t0 = Math.min(...times);
    const t1 = Math.max(...times, t0 + 60000);
    return { drugs, t0, t1, span: Math.max(1, t1 - t0), end };
  }, [cs.boluses, cs.infusions, cs.createdAt, cs.endedAt]);

  if (model.drugs.length === 0) {
    return <div className="empty">Sin fármacos registrados.</div>;
  }

  const pct = (iso: string) => ((new Date(iso).getTime() - model.t0) / model.span) * 100;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  // Ticks del eje de tiempo
  const ticks: { at: string; left: number }[] = [];
  const TICKS = 5;
  for (let i = 0; i <= TICKS; i++) {
    const tms = model.t0 + (model.span * i) / TICKS;
    ticks.push({ at: new Date(tms).toISOString(), left: (i / TICKS) * 100 });
  }

  return (
    <div className={`medtl ${light ? "light" : ""}`}>
      {model.drugs.map((drug, idx) => {
        const color = PALETTE[idx % PALETTE.length];
        const boluses = cs.boluses.filter((b) => b.drug === drug);
        const infusions = cs.infusions.filter((i) => i.drug === drug);
        return (
          <div className="medtl-row" key={drug}>
            <div className="medtl-name" style={{ color }} title={drug}>
              {drug}
            </div>
            <div className="medtl-track">
              {infusions.map((inf) => {
                const startL = clamp(pct(inf.startedAt));
                const endL = clamp(inf.stoppedAt ? pct(inf.stoppedAt) : 100);
                const width = Math.max(0.5, endL - startL);
                const changes = inf.changes ?? [{ at: inf.startedAt, rateMlH: inf.rateMlH, summary: inf.summary, doseUnit: inf.doseUnit, weightBasedDose: inf.weightBasedDose, gasPercent: inf.gasPercent }];
                return (
                  <div key={inf.id}>
                    <div className="medtl-bar" style={{ left: `${startL}%`, width: `${width}%`, background: color }} />
                    {changes
                      .filter((c) => !c.stop)
                      .map((c, ci) => (
                        <span className="medtl-rate" key={ci} style={{ left: `${clamp(pct(c.at))}%`, color }}>
                          {inf.gas ? `${formatNum(c.gasPercent ?? 0)}%` : `${formatNum(c.rateMlH)} ml/h`}
                        </span>
                      ))}
                  </div>
                );
              })}
              {boluses.map((b) => (
                <div key={b.id}>
                  <span className="medtl-bolus-dose" style={{ left: `${clamp(pct(b.at))}%`, color }}>
                    {formatNum(b.dose)} {b.unit}
                  </span>
                  <span className="medtl-bolus" style={{ left: `${clamp(pct(b.at))}%`, background: color }} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="medtl-row medtl-axisrow">
        <div className="medtl-name" />
        <div className="medtl-track">
          {ticks.map((tk, i) => (
            <span className="medtl-tick" key={i} style={{ left: `${tk.left}%` }}>
              {hhmm(tk.at)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
