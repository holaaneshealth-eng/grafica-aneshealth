import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { CaseState } from "../domain/events";
import { STANDARD_PARAMS, findParam } from "../domain/monitoring";
import { hhmm } from "../utils/time";

interface Props {
  cs: CaseState;
  light?: boolean;
  maxPoints?: number;
}

type Row = Record<string, number | string>;

// Parámetros que se representan en la gráfica (el resto va al registro seriado).
export const CHARTED = new Set(["FC", "TAS", "TAD", "TAM", "SPO2"]);

const colorOf = (code: string): string => STANDARD_PARAMS.find((p) => p.code === code)?.color ?? "#14b8a6";

function downsample(data: Row[], max: number): Row[] {
  if (data.length <= max) return data;
  const bucket = data.length / max;
  const out: Row[] = [];
  for (let i = 0; i < max; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(Math.floor((i + 1) * bucket), start + 1);
    const slice = data.slice(start, end);
    const mid = slice[Math.floor(slice.length / 2)] ?? slice[0];
    const agg: Row = { t: mid.t };
    const keys = new Set<string>();
    slice.forEach((r) => Object.keys(r).forEach((k) => k !== "t" && keys.add(k)));
    keys.forEach((k) => {
      const vals = slice.map((r) => r[k]).filter((v): v is number => typeof v === "number");
      if (vals.length) agg[k] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    });
    out.push(agg);
  }
  return out;
}

// Marcadores personalizados (rombo para FC, cruz para SpO2) sin línea continua.
/* eslint-disable @typescript-eslint/no-explicit-any */
function diamondDot(color: string) {
  return (p: any) => {
    if (p.cx == null || p.cy == null || p.value == null) return <g key={p.key ?? p.index} />;
    const { cx, cy } = p;
    return <path key={p.key ?? p.index} d={`M${cx} ${cy - 4}L${cx + 4} ${cy}L${cx} ${cy + 4}L${cx - 4} ${cy}Z`} fill={color} />;
  };
}
function crossDot(color: string) {
  return (p: any) => {
    if (p.cx == null || p.cy == null || p.value == null) return <g key={p.key ?? p.index} />;
    const { cx, cy } = p;
    return (
      <path key={p.key ?? p.index} d={`M${cx - 4} ${cy - 4}L${cx + 4} ${cy + 4}M${cx + 4} ${cy - 4}L${cx - 4} ${cy + 4}`} stroke={color} strokeWidth={1.6} />
    );
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function TrendCharts({ cs, light, maxPoints }: Props) {
  const axisColor = light ? "#555" : "#93a4b3";
  const grid = light ? "#dddddd" : "#26333f";
  const data = useMemo(() => {
    const base: Row[] = cs.vitals
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((v) => ({ t: hhmm(v.at), ...v.values }));
    return maxPoints ? downsample(base, maxPoints) : base;
  }, [cs.vitals, maxPoints]);

  const has = (code: string) => cs.monitoring.standard.includes(code) && data.some((r) => typeof r[code] === "number");

  if (data.length === 0 || !["FC", "TAS", "TAD", "TAM", "SPO2"].some(has)) {
    return <div className="empty">Aún no hay constantes hemodinámicas registradas.</div>;
  }

  return (
    <div className="card" style={light ? { marginBottom: 0, background: "#fff", border: "1px solid #ddd" } : { marginBottom: 0 }}>
      <div className="section-title" style={{ margin: "0 0 8px", color: light ? "#555" : undefined }}>
        Presión arterial · FC (♦) · SpO₂ (✕)
      </div>
      <ResponsiveContainer width="100%" height={light ? 200 : 260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="t" stroke={axisColor} fontSize={11} minTickGap={26} />
          <YAxis stroke={axisColor} fontSize={11} domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "#141d27", border: "1px solid #26333f", borderRadius: 10, color: "#e8eef4" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {has("TAS") && <Line type="monotone" dataKey="TAS" name="TAS" stroke={colorOf("TAS")} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
          {has("TAD") && <Line type="monotone" dataKey="TAD" name="TAD" stroke={colorOf("TAD")} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
          {has("TAM") && <Line type="monotone" dataKey="TAM" name="TAM" stroke={colorOf("TAM")} strokeWidth={1.6} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />}
          {has("FC") && <Line dataKey="FC" name="FC ♦" stroke="none" dot={diamondDot(colorOf("FC"))} isAnimationActive={false} legendType="diamond" />}
          {has("SPO2") && <Line dataKey="SPO2" name="SpO₂ ✕" stroke="none" dot={crossDot(colorOf("SPO2"))} isAnimationActive={false} legendType="cross" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function paramLabel(code: string, cs: CaseState): string {
  return findParam(code, cs.monitoring.custom)?.label ?? code;
}
