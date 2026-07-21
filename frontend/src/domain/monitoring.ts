// Catálogo de parámetros de monitorización estándar.
export interface MonitoringParam {
  code: string;
  label: string;
  unit: string;
  min?: number; // rango típico para validación suave (soft-stop)
  max?: number;
  chart?: boolean; // apto para gráfica de tendencia
  color?: string;
}

export const STANDARD_PARAMS: MonitoringParam[] = [
  { code: "FC", label: "FC", unit: "lpm", min: 20, max: 220, chart: true, color: "#34d399" },
  { code: "TAS", label: "TAS", unit: "mmHg", min: 40, max: 260, chart: true, color: "#f87171" },
  { code: "TAD", label: "TAD", unit: "mmHg", min: 20, max: 160, chart: true, color: "#fb923c" },
  { code: "TAM", label: "TAM", unit: "mmHg", min: 30, max: 200, chart: true, color: "#facc15" },
  { code: "SPO2", label: "SpO₂", unit: "%", min: 40, max: 100, chart: true, color: "#38bdf8" },
  { code: "PPICO", label: "Presión pico", unit: "cmH₂O", min: 0, max: 80, chart: true, color: "#a78bfa" },
  { code: "PEEP", label: "PEEP", unit: "cmH₂O", min: 0, max: 30, chart: true, color: "#c084fc" },
  { code: "VT", label: "Volumen corriente", unit: "ml", min: 0, max: 1500, chart: true, color: "#60a5fa" },
  { code: "FR", label: "Frec. respiratoria", unit: "rpm", min: 0, max: 60, chart: true, color: "#4ade80" },
  { code: "ETCO2", label: "ETCO₂", unit: "mmHg", min: 0, max: 100, chart: true, color: "#2dd4bf" },
  { code: "TEMP", label: "Temperatura", unit: "°C", min: 28, max: 42, chart: true, color: "#fbbf24" },
  { code: "PVC", label: "PVC", unit: "mmHg", min: -5, max: 40, chart: true, color: "#f472b6" },
  { code: "FIO2", label: "FiO₂", unit: "%", min: 21, max: 100, chart: true, color: "#818cf8" },
  { code: "BIS", label: "BIS", unit: "", min: 0, max: 100, chart: true, color: "#e879f9" },
];

export function findParam(code: string, custom: MonitoringParam[] = []): MonitoringParam | undefined {
  return STANDARD_PARAMS.find((p) => p.code === code) ?? custom.find((p) => p.code === code);
}
