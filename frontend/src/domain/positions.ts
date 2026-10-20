// Posiciones quirúrgicas y medidas de protección + opciones del estado al finalizar.

export interface PositionDef {
  id: string;
  label: string;
  abbr: string; // abreviatura corta para la franja de hitos de la gráfica
}

export const POSITIONS: PositionDef[] = [
  { id: "supino", label: "Decúbito supino", abbr: "SUP" },
  { id: "prono", label: "Decúbito prono", abbr: "PRO" },
  { id: "lateral_derecho", label: "Decúbito lateral derecho", abbr: "LDD" },
  { id: "lateral_izquierdo", label: "Decúbito lateral izquierdo", abbr: "LDI" },
  { id: "litotomia", label: "Litotomía", abbr: "LIT" },
  { id: "trendelenburg", label: "Trendelenburg", abbr: "TREN" },
  { id: "anti_trendelenburg", label: "Anti-Trendelenburg", abbr: "ANTI" },
  { id: "sedestacion", label: "Sedestación (silla de playa)", abbr: "SED" },
  { id: "lumbotomia", label: "Lumbotomía", abbr: "LUMB" },
  { id: "genupectoral", label: "Genupectoral", abbr: "GEN" },
  { id: "otra", label: "Otra", abbr: "OTR" },
];

export function positionById(id: string): PositionDef | undefined {
  return POSITIONS.find((p) => p.id === id);
}

// Medidas de protección (selección múltiple). `key` coincide con el campo en ProtectionInfo.
export const PROTECTION_MEASURES: { key: string; label: string }[] = [
  { key: "ocular", label: "Protección ocular (oclusión, pomada)" },
  { key: "padding", label: "Almohadillado de puntos de apoyo" },
  { key: "armsAbduction", label: "Brazos en abducción < 90°" },
  { key: "activeWarming", label: "Calentamiento activo (manta térmica)" },
  { key: "fluidWarmer", label: "Calentador de fluidos" },
  { key: "pneumaticCompression", label: "Compresión neumática intermitente / medias de compresión" },
  { key: "cauteryPad", label: "Placa de bisturí eléctrico colocada y revisada" },
];

// ---- Opciones del estado al finalizar la anestesia ----
export const CONSCIOUSNESS = [
  { id: "despierto", label: "Despierto y orientado" },
  { id: "somnoliento", label: "Somnoliento, responde a la voz" },
  { id: "estimulos", label: "Responde solo a estímulos" },
  { id: "sedado", label: "Sedado" },
];

export const AIRWAY = [
  { id: "extubado", label: "Extubado en quirófano" },
  { id: "supraglotico_retirado", label: "Dispositivo supraglótico retirado" },
  { id: "mantiene_intubacion", label: "Mantiene intubación" },
  { id: "sin_manipulacion", label: "Sin manipulación de la vía aérea" },
];

export const OXYGEN = [
  { id: "aire", label: "Aire ambiente" },
  { id: "gafas", label: "Gafas nasales" },
  { id: "mascarilla", label: "Mascarilla" },
];

export const DESTINATION = [
  { id: "urpa", label: "URPA" },
  { id: "reanimacion", label: "Reanimación" },
  { id: "uci", label: "UCI" },
  { id: "planta", label: "Planta" },
  { id: "cma", label: "Alta domiciliaria (CMA)" },
  { id: "partos", label: "Sala de partos" },
];

// Escala de Bromage clásica (0-3) con la descripción de cada grado.
export const BROMAGE = [
  { id: "0", label: "0 — Sin bloqueo (flexiona rodilla y tobillo)" },
  { id: "1", label: "1 — No eleva la pierna extendida; flexiona la rodilla" },
  { id: "2", label: "2 — No flexiona la rodilla; mueve el tobillo" },
  { id: "3", label: "3 — Bloqueo completo (no mueve rodilla ni tobillo)" },
];

export const TOF_OPTIONS = [
  { id: "si", label: "TOF ≥ 0,9 (Sí)" },
  { id: "no", label: "TOF < 0,9 (No)" },
  { id: "no_monitorizado", label: "No monitorizado" },
];

const labelFrom = (list: { id: string; label: string }[], id?: string): string => list.find((o) => o.id === id)?.label ?? "";
export const consciousnessLabel = (id?: string) => labelFrom(CONSCIOUSNESS, id);
export const airwayLabel = (id?: string) => labelFrom(AIRWAY, id);
export const oxygenLabel = (id?: string) => labelFrom(OXYGEN, id);
export const destinationLabel = (id?: string) => labelFrom(DESTINATION, id);
export const bromageLabel = (id?: string) => labelFrom(BROMAGE, id);
export const tofLabel = (id?: string) => labelFrom(TOF_OPTIONS, id);
