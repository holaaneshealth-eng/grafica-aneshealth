// Rangos de ALARMA para sombrear celdas de valores medidos fuera de rango.
// Son independientes de los min/max de validación "soft-stop" de monitoring.ts.
// Configurables: estos son los valores por defecto solicitados.

export interface AlarmRange {
  min?: number;
  max?: number;
}

export const DEFAULT_ALARM_RANGES: Record<string, AlarmRange> = {
  SPO2: { min: 92 },
  ETCO2: { min: 30, max: 45 },
  BIS: { min: 40, max: 60 },
  TEMP: { min: 36 },
};

// Palabras clave para resolver parámetros personalizados (p. ej. BIS llega como "C_BIS").
const ALIAS: { re: RegExp; key: keyof typeof DEFAULT_ALARM_RANGES }[] = [
  { re: /spo2|sato2|saturaci/i, key: "SPO2" },
  { re: /etco2|co2/i, key: "ETCO2" },
  { re: /\bbis\b/i, key: "BIS" },
  { re: /temp|temperatur/i, key: "TEMP" },
];

export function resolveAlarmRange(
  code: string,
  label: string,
  ranges: Record<string, AlarmRange> = DEFAULT_ALARM_RANGES,
): AlarmRange | undefined {
  if (ranges[code]) return ranges[code];
  const hay = `${code} ${label}`;
  for (const a of ALIAS) {
    if (a.re.test(hay) && ranges[a.key]) return ranges[a.key];
  }
  return undefined;
}

export function isOutOfRange(value: number, range: AlarmRange | undefined): boolean {
  if (!range) return false;
  if (range.min != null && value < range.min) return true;
  if (range.max != null && value > range.max) return true;
  return false;
}
