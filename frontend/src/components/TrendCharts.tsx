import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { CaseState } from "../domain/events";
import { STANDARD_PARAMS, findParam } from "../domain/monitoring";
import { hhmm } from "../utils/time";

interface Props {
  cs: CaseState;
  light?: boolean;
}

interface Group {
  title: string;
  keys: { code: string; label: string; color: string }[];
}

export function TrendCharts({ cs, light }: Props) {
  const axis = light ? "#555" : "#93a4b3";
  const grid = light ? "#dddddd" : "#26333f";
  const data = useMemo(
    () =>
      cs.vitals
        .slice()
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((v) => ({ t: hhmm(v.at), ...v.values })),
    [cs.vitals],
  );

  const selected = new Set(cs.monitoring.standard);
  const groups: Group[] = [];

  const taKeys = ["TAS", "TAD", "TAM"].filter((c) => selected.has(c));
  if (taKeys.length) {
    groups.push({
      title: "Tension arterial",
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
    groups.push({ title: `${p.label} (${p.unit})`, keys: [{ code, label: p.label, color: p.color! }] });
  }
  for (const p of cs.monitoring.custom) {
    groups.push({ title: `${p.label}`, keys: [{ code: p.code, label: p.label, color: p.color ?? "#14b8a6" }] });
  }

  if (data.length === 0) {
    return <div className="empty">Aun no hay registros de constantes. Usa el boton "Constantes" para empezar.</div>;
  }

  return (
    <div className="grid2">
      {groups.map((g) => (
        <div className="card" key={g.title} style={light ? { marginBottom: 0, background: "#fff", border: "1px solid #ddd" } : { marginBottom: 0 }}>
          <div className="section-title" style={{ margin: "0 0 8px", color: light ? "#555" : undefined }}>
            {g.title}
          </div>
          <ResponsiveContainer width="100%" height={light ? 150 : 180}>
            <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="t" stroke={axis} fontSize={11} />
              <YAxis stroke={axis} fontSize={11} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "#141d27", border: "1px solid #26333f", borderRadius: 10, color: "#e8eef4" }}
              />
              {g.keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {g.keys.map((k) => (
                <Line
                  key={k.code}
                  type="monotone"
                  dataKey={k.code}
                  name={k.label}
                  stroke={k.color}
                  strokeWidth={2.4}
                  dot={{ r: 2.5 }}
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
