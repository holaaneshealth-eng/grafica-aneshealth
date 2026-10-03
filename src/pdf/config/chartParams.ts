// Clasificación de parámetros para las bandas de la gráfica.

// Banda 1 (hemodinámica): se dibujan como barra TA + línea FC, no como celdas.
export const HEMO_CODES = ["TAS", "TAD", "TAM", "FC"];

// Banda 2 (constantes), parámetros FIJADOS por el anestesiólogo:
// la cifra aparece solo al inicio y cuando cambia (línea de mantenimiento entre medias).
export const FIXED_CODES = ["VT", "FR", "PEEP", "FIO2", "VENTMODE"];

// Código sintético para el modo ventilatorio (valor textual, no numérico).
export const VENTMODE_CODE = "VENTMODE";

export function isHemoCode(code: string): boolean {
  return HEMO_CODES.includes(code);
}

export function isFixedCode(code: string): boolean {
  return FIXED_CODES.includes(code);
}

// Modos ventilatorios disponibles (desplegable).
export const VENT_MODES = ["VC", "PC", "PRVC", "SIMV", "Presion soporte", "Espontanea"];

// Clasificación ASA (I a VI) con modificador "E" de urgencia.
export const ASA_CLASSES = ["I", "II", "III", "IV", "V", "VI"];
