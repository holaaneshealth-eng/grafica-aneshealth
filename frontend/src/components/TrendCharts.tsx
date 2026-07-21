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

type Row = Record<string, number | string>;

interface Series {
  code: string;
  label: string;
  axis: "left" | "right";
}
interface ChartDef {
  title: string;
  series: Series[];
}

// Gráficas agrupadas por sistema fisiológico. Las unidades distintas usan doble eje.
const CHART_DEFS: ChartDef[] = [
  {
    title: "Presión arterial y FC (mmHg · lpm)",
    series: [
      { code: "TAS", label: "TAS", axis: "left" },
      { code: "TAD", label: "TAD", axis: "left" },
      { code: "TAM", label: "TAM", axis: "left" },
      { code: "FC", label: "FC", axis: "left" },
    ],
  },
  {
    title: "Oxigenación y ventilación",
    series: [
      { code: "SPO2", label: "SpO₂ %", axis: "left" },
      { code: "FIO2", label: "O₂ %", axis: "left" },
      { code: "ETCO2", label: "ETCO₂ mmHg", axis: "right" },
    ],
  },
  {
    title: "Presiones de vía aérea (cmH₂O)",
    series: [
      { code: "PPICO", label: "P. pico", axis: "left" },
      { code: "PEEP", label: "PEEP", axis: "left" },
    ],
  },
  {
    title: "BIS y temperatura",
    series: [
      { code: "BIS", label: "BIS", axis: "left" },
      { code: "TEMP", label: "Tª °C", axis: "right" },
    ],
  },
];

// Parámetros que NO generan gráfica (baja variabilidad); quedan en el registro seriado.
const TABLE_ONLY = new Set(["VT", "FR", "PVC"]);

const colorOf = (code: string): string => STANDARD_PARAMS.find((p) => p.code === code)?.color ?? "#14b8a6";

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
  const axisColor = light ? "#555" : "#93a4b3";
  const grid = light ? "#dddddd" : "#26333f";
  const data = useMemo(() => {
    const base: Row[] = cs.vitals
      .slice()
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((v) => ({ t: hhmm(v.at), ...v.values }));
    return maxPoints ? downsample(base, maxPoints) : base;
  }, [cs.vitals, maxPoints]);

  const selected = new Set(cs.monitoring.standard);

  if (data.length === 0) {
    return <div className="empty">Aún no hay registros de constantes. Usa el botón "Constantes" para empezar.</div>;
  }

  // Gráficas agrupadas: solo las series seleccionadas con datos.
  const charts = CHART_DEFS.map((def) => ({
    title: def.title,
    series: def.series.filter((s) => selected.has(s.code)),
  })).filter((c) => c.series.length > 0);

  // Parámetros adicionales (personalizados): una gráfica pequeña cada uno.
  const customCharts = cs.monitoring.custom.filter((p) => !STANDARD_PARAMS.some((s) => s.code === p.code));

  function renderChart(title: string, series: { code: string; label: string; axis: "left" | "right"; color: string }[]) {
    const hasRight = series.some((s) => s.axis === "right");
    return (
      <div
        className="card"
        key={title}
        style={light ? { marginBottom: 0, background: "#fff", border: "1px solid #ddd" } : { marginBottom: 0 }}
      >
        <div className="section-title" style={{ margin: "0 0 8px", color: light ? "#555" : undefined }}>
          {title}
        </div>
        <ResponsiveContainer width="100%" height={light ? 150 : 190}>
          <LineChart data={data} margin={{ top: 6, right: hasRight ? 6 : 10, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="t" stroke={axisColor} fontSize={11} minTickGap={24} />
            <YAxis yAxisId="left" stroke={axisColor} fontSize={11} domain={["auto", "auto"]} />
            {hasRight && (
              <YAxis yAxisId="right" orientation="right" stroke={axisColor} fontSize={11} domain={["auto", "auto"]} width={34} />
            )}
            <Tooltip contentStyle={{ background: "#141d27", border: "1px solid #26333f", borderRadius: 10, color: "#e8eef4" }} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Line
                key={s.code}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.code}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.2}
                dot={light ? false : { r: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="grid2">
      {charts.map((c) =>
        renderChart(
          c.title,
          c.series.map((s) => ({ ...s, color: colorOf(s.code) })),
        ),
      )}
      {customCharts.map((p) =>
        renderChart(p.label, [{ code: p.code, label: p.label, axis: "left", color: p.color ?? "#14b8a6" }]),
      )}
    </div>
  );
}

export function paramLabel(code: string, cs: CaseState): string {
  return findParam(code, cs.monitoring.custom)?.label ?? code;
}

export { TABLE_ONLY };
