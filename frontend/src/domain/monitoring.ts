// Catálogo de parámetros de monitorización estándar.
export type ParamGroup = "resp" | "monitor"; // Respirador vs Monitor

export interface MonitoringParam {
  code: string;
  label: string;
  unit: string;
  group: ParamGroup; // a qué formulario pertenece (Respirador / Monitor)
  min?: number; // rango típico para validación suave (soft-stop)
  max?: number;
  chart?: boolean; // apto para gráfica de tendencia
  color?: string;
}

export const STANDARD_PARAMS: MonitoringParam[] = [
  // --- Monitor ---
  { code: "FC", label: "FC", unit: "lpm", group: "monitor", min: 20, max: 220, chart: true, color: "#34d399" },
  { code: "TAS", label: "TAS (no invasiva)", unit: "mmHg", group: "monitor", min: 40, max: 260, chart: true, color: "#f87171" },
  { code: "TAD", label: "TAD (no invasiva)", unit: "mmHg", group: "monitor", min: 20, max: 160, chart: true, color: "#fb923c" },
  { code: "TAM", label: "TAM (no invasiva)", unit: "mmHg", group: "monitor", min: 30, max: 200, chart: true, color: "#facc15" },
  { code: "PAIS", label: "PA sist. (invasiva)", unit: "mmHg", group: "monitor", min: 40, max: 260, chart: true, color: "#ef4444" },
  { code: "PAID", label: "PA diast. (invasiva)", unit: "mmHg", group: "monitor", min: 20, max: 160, chart: true, color: "#f97316" },
  { code: "PAIM", label: "PA media (invasiva)", unit: "mmHg", group: "monitor", min: 30, max: 200, chart: true, color: "#eab308" },
  { code: "SPO2", label: "SpO₂", unit: "%", group: "monitor", min: 40, max: 100, chart: true, color: "#38bdf8" },
  { code: "TEMP", label: "Temperatura", unit: "°C", group: "monitor", min: 28, max: 42, chart: true, color: "#fbbf24" },
  { code: "PVC", label: "PVC", unit: "mmHg", group: "monitor", min: -5, max: 40, chart: true, color: "#f472b6" },
  { code: "BIS", label: "BIS", unit: "", group: "monitor", min: 0, max: 100, chart: true, color: "#e879f9" },
  // --- Respirador ---
  { code: "PPICO", label: "Presión pico", unit: "cmH₂O", group: "resp", min: 0, max: 80, chart: true, color: "#a78bfa" },
  { code: "PEEP", label: "PEEP", unit: "cmH₂O", group: "resp", min: 0, max: 30, chart: true, color: "#c084fc" },
  { code: "VT", label: "Volumen corriente", unit: "ml", group: "resp", min: 0, max: 1500, chart: true, color: "#60a5fa" },
  { code: "FR", label: "Frec. respiratoria", unit: "rpm", group: "resp", min: 0, max: 60, chart: true, color: "#4ade80" },
  { code: "ETCO2", label: "ETCO₂", unit: "mmHg", group: "resp", min: 0, max: 100, chart: true, color: "#2dd4bf" },
  { code: "FIO2", label: "FiO₂", unit: "%", group: "resp", min: 21, max: 100, chart: true, color: "#818cf8" },
  { code: "CAM", label: "CAM", unit: "", group: "resp", min: 0, max: 3, chart: true, color: "#fca5a5" },
];

export function findParam(code: string, custom: MonitoringParam[] = []): MonitoringParam | undefined {
  return STANDARD_PARAMS.find((p) => p.code === code) ?? custom.find((p) => p.code === code);
}

/** Parámetros del grupo indicado (los personalizados se consideran de Monitor). */
export function paramsByGroup(group: ParamGroup, custom: MonitoringParam[] = []): MonitoringParam[] {
  const std = STANDARD_PARAMS.filter((p) => p.group === group);
  if (group === "monitor") return [...std, ...custom.filter((c) => !STANDARD_PARAMS.some((s) => s.code === c.code))];
  return std;
}

// Códigos del respirador que son "fijados" (modo + VT/FR/PEEP/FiO2) y "medidos" (resto).
export const RESP_FIXED_CODES = ["VT", "FR", "PEEP", "FIO2"]; // + VENTMODE (modo, aparte)
export const RESP_MEASURED_CODES = ["PPICO", "ETCO2", "CAM"];
