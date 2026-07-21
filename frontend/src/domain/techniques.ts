// Definición de técnicas anestésicas y sus campos específicos.
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

// Grado HAN de ventilación con mascarilla facial, con descripción en cada grado.
const HAN: TechniqueField = {
  key: "hanGrade",
  label: "Grado HAN (ventilación con mascarilla)",
  type: "select",
  options: [
    "No ventilado manualmente",
    "I. Fácilmente ventilable con mascarilla facial",
    "II. Ventilable con mascarilla facial y cánula orofaríngea/adyuvante",
    "III. Ventilación difícil (inadecuada, inestable o precisa dos personas)",
    "IV. Imposible ventilar con mascarilla facial",
  ],
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
      { key: "maskType", label: "Tipo de mascarilla", type: "text" },
      { key: "maskSize", label: "Número de mascarilla", type: "number" },
    ],
  },
  {
    id: "gen_iot",
    label: "General con intubación orotraqueal",
    fields: intubationFields(),
  },
  {
    id: "gen_int_naso",
    label: "General con intubación nasotraqueal",
    fields: intubationFields(),
  },
  { id: "sedacion_profunda", label: "Sedación profunda", fields: [{ key: "notes", label: "Observaciones", type: "text" }] },
  { id: "sedacion_moderada", label: "Sedación moderada", fields: [{ key: "notes", label: "Observaciones", type: "text" }] },
  { id: "ansiolisis", label: "Ansiólisis", fields: [{ key: "notes", label: "Observaciones", type: "text" }] },
  { id: "intradural", label: "Anestesia intradural", fields: neuraxialFields() },
  { id: "epidural", label: "Anestesia epidural", fields: neuraxialFields() },
  { id: "combinada", label: "Combinada intradural-epidural", fields: neuraxialFields() },
  { id: "bloqueo_periferico", label: "Bloqueo nervioso periférico", fields: blockFields() },
  { id: "bloqueo_interfascial", label: "Bloqueo interfascial", fields: blockFields() },
];

function intubationFields(): TechniqueField[] {
  return [
    HAN,
    CORMACK,
    { key: "device", label: "Dispositivo utilizado", type: "text" },
    { key: "tubeType", label: "Tubo", type: "select", options: ["Orotraqueal", "Nasotraqueal"] },
    { key: "caliber", label: "Calibre", type: "number" },
    { key: "attempts", label: "Número de intentos", type: "number" },
    { key: "stylet", label: "Uso de fiador", type: "yesno" },
    { key: "videolaryngoscope", label: "Videolaringoscopio", type: "yesno" },
    { key: "incidents", label: "Incidencias", type: "text" },
  ];
}

function neuraxialFields(): TechniqueField[] {
  return [
    { key: "needleType", label: "Tipo de aguja", type: "text" },
    { key: "caliber", label: "Calibre", type: "text" },
    { key: "vertebralLevel", label: "Nivel vertebral", type: "text" },
    { key: "approach", label: "Abordaje", type: "select", options: ["Medial", "Paramedial"] },
    { key: "ease", label: "Facilidad", type: "select", options: ["Fácil", "Difícil"] },
    { key: "incidents", label: "Incidencias", type: "text" },
  ];
}

function blockFields(): TechniqueField[] {
  return [
    { key: "blockType", label: "Tipo de bloqueo", type: "text" },
    { key: "technique", label: "Técnica", type: "text" },
    { key: "ultrasound", label: "Ecografía", type: "yesno" },
    { key: "neurostimulation", label: "Neuroestimulación", type: "yesno" },
    { key: "localAnesthetic", label: "Anestésico local", type: "text" },
    { key: "volume", label: "Volumen", type: "number", unit: "ml" },
    { key: "concentration", label: "Concentración", type: "number", unit: "%" },
    { key: "adjuvants", label: "Adyuvantes", type: "text" },
  ];
}

export function techniqueById(id: string): TechniqueDef | undefined {
  return TECHNIQUES.find((t) => t.id === id);
}
