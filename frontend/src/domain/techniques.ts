// Definicion de tecnicas anestesicas y sus campos especificos.
export type FieldType = "text" | "number" | "select" | "yesno";

export interface TechniqueField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
}

export interface TechniqueDef {
  id: string;
  label: string;
  fields: TechniqueField[];
}

const HAN: TechniqueField = {
  key: "hanGrade",
  label: "Grado HAN",
  type: "select",
  options: ["I", "II", "III", "IV"],
};
const VENT: TechniqueField = {
  key: "ventilation",
  label: "Ventilacion",
  type: "select",
  options: ["Facil", "Dificil"],
};
const CORMACK: TechniqueField = {
  key: "cormack",
  label: "Cormack-Lehane",
  type: "select",
  options: ["I", "IIa", "IIb", "III", "IV"],
};

export const TECHNIQUES: TechniqueDef[] = [
  {
    id: "gen_mascarilla",
    label: "General con mascarilla",
    fields: [
      HAN,
      VENT,
      { key: "maskType", label: "Tipo de mascarilla", type: "text" },
      { key: "maskSize", label: "Numero de mascarilla", type: "number" },
    ],
  },
  {
    id: "gen_iot",
    label: "General con intubacion orotraqueal",
    fields: intubationFields(),
  },
  {
    id: "gen_int_naso",
    label: "General con intubacion nasotraqueal",
    fields: intubationFields(),
  },
  { id: "sedacion_profunda", label: "Sedacion profunda", fields: [{ key: "notes", label: "Observaciones", type: "text" }] },
  { id: "sedacion_moderada", label: "Sedacion moderada", fields: [{ key: "notes", label: "Observaciones", type: "text" }] },
  { id: "ansiolisis", label: "Ansiolisis", fields: [{ key: "notes", label: "Observaciones", type: "text" }] },
  { id: "intradural", label: "Anestesia intradural", fields: neuraxialFields() },
  { id: "epidural", label: "Anestesia epidural", fields: neuraxialFields() },
  { id: "combinada", label: "Combinada intradural-epidural", fields: neuraxialFields() },
  { id: "bloqueo_periferico", label: "Bloqueo nervioso periferico", fields: blockFields() },
  { id: "bloqueo_interfascial", label: "Bloqueo interfascial", fields: blockFields() },
];

function intubationFields(): TechniqueField[] {
  return [
    HAN,
    VENT,
    CORMACK,
    { key: "device", label: "Dispositivo utilizado", type: "text" },
    {
      key: "tubeType",
      label: "Tubo",
      type: "select",
      options: ["Orotraqueal", "Nasotraqueal"],
    },
    { key: "caliber", label: "Calibre", type: "number" },
    { key: "attempts", label: "Numero de intentos", type: "number" },
    { key: "stylet", label: "Uso de fiador", type: "yesno" },
    { key: "videolaryngoscope", label: "Videolaringoscopio", type: "yesno" },
    { key: "route", label: "Via", type: "select", options: ["Orotraqueal", "Nasotraqueal"], },
    { key: "incidents", label: "Incidencias", type: "text" },
  ];
}

function neuraxialFields(): TechniqueField[] {
  return [
    { key: "needleType", label: "Tipo de aguja", type: "text" },
    { key: "caliber", label: "Calibre", type: "text" },
    { key: "vertebralLevel", label: "Nivel vertebral", type: "text" },
    { key: "approach", label: "Abordaje", type: "select", options: ["Medial", "Paramedial"] },
    { key: "ease", label: "Facilidad", type: "select", options: ["Facil", "Dificil"] },
    { key: "incidents", label: "Incidencias", type: "text" },
  ];
}

function blockFields(): TechniqueField[] {
  return [
    { key: "blockType", label: "Tipo de bloqueo", type: "text" },
    { key: "technique", label: "Tecnica", type: "text" },
    { key: "ultrasound", label: "Ecografia", type: "yesno" },
    { key: "neurostimulation", label: "Neuroestimulacion", type: "yesno" },
    { key: "localAnesthetic", label: "Anestesico local", type: "text" },
    { key: "volume", label: "Volumen", type: "number", unit: "ml" },
    { key: "concentration", label: "Concentracion", type: "number", unit: "%" },
    { key: "adjuvants", label: "Adyuvantes", type: "text" },
  ];
}

export function techniqueById(id: string): TechniqueDef | undefined {
  return TECHNIQUES.find((t) => t.id === id);
}
