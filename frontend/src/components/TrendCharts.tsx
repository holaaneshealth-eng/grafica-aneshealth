import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { CaseState } from "../domain/events";
import { STANDARD_PARAMS, findParam } from "../domain/monitoring";
import { hhmm } from "../utils/time";

interface Props {
  cs: CaseState;
  light?: boolean;
  maxPoints?: number; // agrega los datos a un máximo de puntos (para A4)
}

interface Group {
  title: string;
  keys: { code: string; label: string; color: string }[];
}

type Row = Record<string, number | string>;

/** Agrega los datos a `max` puntos promediando por tramos (más agregación cuanto más larga la cirugía). */
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

export function TrendCharts({ cs, light, maxPoints }: Props) {
  const axis = light ? "#555" : "#93a4b3";
  const grid = light ? "#dddddd" : "#26333f";
  const data = useMemo(() => {
    const base: Row[] = cs.vitals
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((v) => ({ t: hhmm(v.at), ...v.values }));
    return maxPoints ? downsample(base, maxPoints) : base;
  }, [cs.vitals, maxPoints]);

  const selected = new Set(cs.monitoring.standard);
  const groups: Group[] = [];

  const taKeys = ["TAS", "TAD", "TAM"].filter((c) => selected.has(c));
  if (taKeys.length) {
    groups.push({
      title: "Tensión arterial (mmHg)",
      keys: taKeys.map((c) => {
        const p = STANDARD_PARAMS.find((x) => x.code === c)!;
        return { code: c, label: p.label, color: p.color! };
      }),
    });
  }
  for (const code of cs.monitoring.standard) {
    if (["TAS", "TAD", "TAM"].includes(code)) continue;
    const p = STANDARD_PARAMS.find((x) => x.code === code);
    if (!p) continue;
    groups.push({ title: `${p.label}${p.unit ? ` (${p.unit})` : ""}`, keys: [{ code, label: p.label, color: p.color! }] });
  }
  for (const p of cs.monitoring.custom) {
    if (STANDARD_PARAMS.some((s) => s.code === p.code)) continue;
    groups.push({ title: `${p.label}`, keys: [{ code: p.code, label: p.label, color: p.color ?? "#14b8a6" }] });
  }

  if (data.length === 0) {
    return <div className="empty">Aún no hay registros de constantes. Usa el botón "Constantes" para empezar.</div>;
  }

  return (
    <div className="grid2">
      {groups.map((g) => (
        <div
          className="card"
          key={g.title}
          style={light ? { marginBottom: 0, background: "#fff", border: "1px solid #ddd" } : { marginBottom: 0 }}
        >
          <div className="section-title" style={{ margin: "0 0 8px", color: light ? "#555" : undefined }}>
            {g.title}
          </div>
          <ResponsiveContainer width="100%" height={light ? 140 : 180}>
            <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="t" stroke={axis} fontSize={11} minTickGap={24} />
              <YAxis stroke={axis} fontSize={11} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#141d27", border: "1px solid #26333f", borderRadius: 10, color: "#e8eef4" }} />
              {g.keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {g.keys.map((k) => (
                <Line
                  key={k.code}
                  type="monotone"
                  dataKey={k.code}
                  name={k.label}
                  stroke={k.color}
                  strokeWidth={2.2}
                  dot={light ? false : { r: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

export function paramLabel(code: string, cs: CaseState): string {
  return findParam(code, cs.monitoring.custom)?.label ?? code;
}
