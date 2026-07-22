import { useMemo, type ReactNode, type MouseEvent } from "react";
import type { CaseState } from "../domain/events";
import { hhmm } from "../utils/time";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
  light?: boolean;
  onTimeClick?: (iso: string) => void;
}

const PALETTE = ["#0ea5e9", "#f59e0b", "#22c55e", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#6366f1", "#d946ef", "#84cc16", "#ef4444"];

// Constantes representadas en la gráfica (se excluyen de la tabla seriada).
// SpO2 se retira de la gráfica y pasa a la cronología de constantes.
export const CHARTED = new Set(["FC", "TAS", "TAD", "TAM"]);

function col(code: string, light?: boolean): string {
  const dark: Record<string, string> = { TAS: "#f87171", TAD: "#fb923c", TAM: "#facc15", FC: "#34d399", SPO2: "#38bdf8" };
  const lite: Record<string, string> = { TAS: "#dc2626", TAD: "#ea580c", TAM: "#b45309", FC: "#059669", SPO2: "#0284c7" };
  return (light ? lite : dark)[code] ?? "#14b8a6";
}

const W = 1000;
const padL = 116; // columna de nombres de fármaco + etiquetas de valor
const padR = 16;
const topBand = 52; // espacio para etiquetas de evento inclinadas
const hemoTop = topBand;
const hemoH = 200;
const hemoBottom = hemoTop + hemoH;
const lanesTop = hemoBottom + 26;
const laneH = 32;

export function AnesthesiaChart({ cs, light, onTimeClick }: Props) {
  const gridColor = light ? "#e2e2e2" : "#2a3742";
  const axisText = light ? "#555" : "#9fb0bf";
  const strong = light ? "#222" : "#e8eef4";

  const model = useMemo(() => {
    const vitals = cs.vitals.slice().sort((a, b) => a.at.localeCompare(b.at));
    const drugs = Array.from(new Set([...cs.boluses.map((b) => b.drug), ...cs.infusions.map((i) => i.drug)]));
    const times: number[] = [new Date(cs.createdAt).getTime()];
    vitals.forEach((v) => times.push(new Date(v.at).getTime()));
    cs.boluses.forEach((b) => times.push(new Date(b.at).getTime()));
    cs.infusions.forEach((i) => {
      times.push(new Date(i.startedAt).getTime());
      (i.changes ?? []).forEach((c) => times.push(new Date(c.at).getTime()));
      if (i.stoppedAt) times.push(new Date(i.stoppedAt).getTime());
    });
    cs.milestones.forEach((m) => times.push(new Date(m.at).getTime()));
    cs.incidents.forEach((i) => times.push(new Date(i.at).getTime()));
    const end = cs.endedAt ? new Date(cs.endedAt).getTime() : Date.now();
    times.push(end);
    const t0 = Math.min(...times);
    const t1 = Math.max(...times, t0 + 60000);
    let maxVal = 160;
    vitals.forEach((v) => ["TAS", "TAM", "FC", "TAD"].forEach((k) => {
      const nn = v.values[k];
      if (typeof nn === "number" && nn > maxVal) maxVal = nn;
    }));
    return { vitals, drugs, t0, t1, span: Math.max(1, t1 - t0), yMax: Math.ceil((maxVal + 10) / 20) * 20 };
  }, [cs]);

  const lanesBottom = lanesTop + model.drugs.length * laneH;
  const totalH = lanesBottom + 28;
  const X = (iso: string) => padL + ((new Date(iso).getTime() - model.t0) / model.span) * (W - padL - padR);
  const Xn = (t: number) => padL + ((t - model.t0) / model.span) * (W - padL - padR);
  const Y = (v: number) => hemoBottom - (v / model.yMax) * hemoH;
  const clampX = (x: number) => Math.min(W - padR, Math.max(padL, x));

  if (model.vitals.length === 0 && model.drugs.length === 0) {
    return <div className="empty">Aún no hay datos para la gráfica.</div>;
  }

  const hlines: number[] = [];
  for (let g = 0; g <= model.yMax; g += 40) hlines.push(g);
  const TICKS = 6;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => model.t0 + (model.span * i) / TICKS);
  const events = [
    ...cs.milestones.map((m) => ({ at: m.at, label: m.label, color: light ? "#0e7c7b" : "#2dd4bf" })),
    ...cs.incidents.map((i) => ({ at: i.at, label: "⚠ Incidencia", color: "#ef4444" })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const tamPts = model.vitals.filter((v) => typeof v.values.TAM === "number").map((v) => `${X(v.at)},${Y(v.values.TAM)}`);

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    if (!onTimeClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const t = model.t0 + ((vbX - padL) / (W - padL - padR)) * model.span;
    onTimeClick(new Date(Math.min(model.t1, Math.max(model.t0, t))).toISOString());
  }

  return (
    <div style={{ overflowX: light ? "visible" : "auto", width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ display: "block", height: "auto", width: "100%", minWidth: light ? undefined : 880, cursor: onTimeClick ? "crosshair" : "default" }}
        onClick={handleClick}
      >
        {/* Rejilla horizontal + valores */}
        {hlines.map((g) => (
          <g key={"h" + g}>
            <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke={gridColor} strokeWidth={0.6} />
            <text x={padL - 6} y={Y(g) + 4} fontSize={11} fill={axisText} textAnchor="end">{g}</text>
          </g>
        ))}
        <line x1={padL} y1={Y(65)} x2={W - padR} y2={Y(65)} stroke="#ef4444" strokeWidth={0.6} strokeDasharray="4 3" opacity={0.55} />

        {/* Ticks verticales de tiempo */}
        {ticks.map((t, i) => (
          <line key={"v" + i} x1={Xn(t)} y1={hemoTop} x2={Xn(t)} y2={lanesBottom} stroke={gridColor} strokeWidth={0.6} />
        ))}

        {/* Eventos: línea vertical + etiqueta inclinada arriba */}
        {events.map((ev, i) => (
          <g key={"ev" + i}>
            <line x1={X(ev.at)} y1={hemoTop} x2={X(ev.at)} y2={lanesBottom} stroke={ev.color} strokeWidth={1} strokeDasharray="3 2" opacity={0.85} />
            <text x={X(ev.at)} y={hemoTop - 6} fontSize={12.5} fill={ev.color} textAnchor="start" transform={`rotate(-30 ${X(ev.at)} ${hemoTop - 6})`}>
              {ev.label.length > 20 ? ev.label.slice(0, 19) + "…" : ev.label}
            </text>
          </g>
        ))}

        {/* Tendencia TAM */}
        {tamPts.length > 1 && <polyline points={tamPts.join(" ")} fill="none" stroke={col("TAM", light)} strokeWidth={1.8} opacity={0.9} />}

        {/* Constantes hemodinámicas */}
        {model.vitals.map((v, i) => {
          const x = X(v.at);
          const els: ReactNode[] = [];
          const tas = v.values.TAS;
          const tad = v.values.TAD;
          if (typeof tas === "number" && typeof tad === "number") {
            els.push(<line key="ta" x1={x} y1={Y(tad)} x2={x} y2={Y(tas)} stroke={col("TAS", light)} strokeWidth={1.6} />);
            els.push(<line key="c1" x1={x - 3.5} y1={Y(tas)} x2={x + 3.5} y2={Y(tas)} stroke={col("TAS", light)} strokeWidth={1.6} />);
            els.push(<line key="c2" x1={x - 3.5} y1={Y(tad)} x2={x + 3.5} y2={Y(tad)} stroke={col("TAD", light)} strokeWidth={1.6} />);
          }
          if (typeof v.values.TAM === "number") els.push(<circle key="tam" cx={x} cy={Y(v.values.TAM)} r={2.7} fill={col("TAM", light)} />);
          if (typeof v.values.FC === "number") {
            const y = Y(v.values.FC);
            els.push(<path key="fc" d={`M${x} ${y - 3.6}L${x + 3.6} ${y}L${x} ${y + 3.6}L${x - 3.6} ${y}Z`} fill={col("FC", light)} />);
          }
          return <g key={i}>{els}</g>;
        })}

        {/* Separador de fármacos */}
        <line x1={padL} y1={lanesTop - 10} x2={W - padR} y2={lanesTop - 10} stroke={gridColor} strokeWidth={1} />

        {/* Carriles de fármacos */}
        {model.drugs.map((drug, idx) => {
          const color = PALETTE[idx % PALETTE.length];
          const y = lanesTop + idx * laneH + laneH / 2;
          const boluses = cs.boluses.filter((b) => b.drug === drug);
          const infusions = cs.infusions.filter((i) => i.drug === drug);
          return (
            <g key={drug}>
              <text x={4} y={y + 4} fontSize={12.5} fill={strong} fontWeight={700}>
                {drug.length > 17 ? drug.slice(0, 16) + "…" : drug}
              </text>
              {infusions.map((inf) => {
                const x1 = clampX(X(inf.startedAt));
                const x2 = clampX(inf.stoppedAt ? X(inf.stoppedAt) : Xn(model.t1));
                const changes = (inf.changes ?? []).filter((c) => !c.stop);
                return (
                  <g key={inf.id}>
                    <rect x={x1} y={y - 4} width={Math.max(1.5, x2 - x1)} height={8} rx={3} fill={color} opacity={0.6} />
                    {changes.map((c, ci) => (
                      <text key={ci} x={clampX(X(c.at))} y={y - 9} fontSize={11.5} fontWeight={600} fill={color} textAnchor="middle">
                        {inf.gas ? `${formatNum(c.gasPercent ?? 0)}%` : inf.fluid ? `${inf.volumeMl ?? 500}ml` : `${formatNum(c.rateMlH)}`}
                      </text>
                    ))}
                  </g>
                );
              })}
              {boluses.map((b, bi) => {
                const x = clampX(X(b.at));
                const ly = bi % 2 === 0 ? y - 9 : y - 18; // escalonado para no solapar
                return (
                  <g key={b.id}>
                    <path d={`M${x} ${y - 4}L${x + 4} ${y}L${x} ${y + 4}L${x - 4} ${y}Z`} fill={color} />
                    <text x={x} y={ly} fontSize={11.5} fontWeight={600} fill={color} textAnchor="middle">
                      {b.concentration && b.volumeMl ? `${formatNum(b.volumeMl)}ml` : `${formatNum(b.dose)}`}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Eje de tiempo */}
        {ticks.map((t, i) => (
          <text key={"t" + i} x={Xn(t)} y={lanesBottom + 18} fontSize={11} fill={axisText} textAnchor="middle">
            {hhmm(new Date(t).toISOString())}
          </text>
        ))}
      </svg>

      {/* Leyenda legible (HTML, no se escala) */}
      <div className="anes-legend">
        <span style={{ color: col("TAS", light) }}>▮ TA (sís/diás)</span>
        <span style={{ color: col("TAM", light) }}>● TAM</span>
        <span style={{ color: col("FC", light) }}>◆ FC</span>
        <span style={{ color: light ? "#0e7c7b" : "#2dd4bf" }}>┊ hitos</span>
        <span style={{ color: "#ef4444" }}>┊ incidencias</span>
      </div>
    </div>
  );
}
