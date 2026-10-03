// Clasificación de parámetros para las bandas de la gráfica.

// Banda 1 (hemodinámica): barra TA + línea FC. SpO2 NO va aquí (pasa a medidos).
export const HEMO_CODES = ["TAS", "TAD", "TAM", "FC"];

// Banda 2, parámetros FIJADOS por el anestesiólogo (cifra al inicio y en cambios).
export const VENTMODE_CODE = "VENTMODE";
export const FIXED_CODES = ["VT", "FR", "PEEP", "FIO2", VENTMODE_CODE];

export function isHemoCode(code: string): boolean {
  return HEMO_CODES.includes(code);
}
export function isFixedCode(code: string): boolean {
  return FIXED_CODES.includes(code);
}

// Modos ventilatorios disponibles (desplegable, control por eventos en intraoperatoria).
export const VENT_MODES = ["VC", "PC", "PRVC", "SIMV", "Presión soporte", "Espontánea"];

// Clasificación ASA (I a VI) con modificador "E" de urgencia.
export const ASA_CLASSES = ["I", "II", "III", "IV", "V", "VI"];
