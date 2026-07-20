// Catalogo de farmacos frecuentes (favoritos) para registro rapido.
// Agrupados por familia. Cada uno con unidad por defecto para minimizar toques.
export interface DrugDef {
  name: string;
  group: string;
  defaultUnit: string; // unidad de bolo por defecto
  commonBolus?: number[]; // dosis frecuentes para chips rapidos
  infusionDoseUnit?: string; // unidad tipica en perfusion
}

export const DRUGS: DrugDef[] = [
  // Hipnoticos
  { name: "Propofol", group: "Hipnotico", defaultUnit: "mg", commonBolus: [100, 150, 180, 200], infusionDoseUnit: "mcg/kg/min" },
  { name: "Etomidato", group: "Hipnotico", defaultUnit: "mg", commonBolus: [14, 16, 20] },
  { name: "Ketamina", group: "Hipnotico", defaultUnit: "mg", commonBolus: [20, 30, 50], infusionDoseUnit: "mcg/kg/min" },
  { name: "Midazolam", group: "Benzodiacepina", defaultUnit: "mg", commonBolus: [1, 2, 3, 5] },
  // Opioides
  { name: "Fentanilo", group: "Opioide", defaultUnit: "mcg", commonBolus: [50, 100, 150, 200] },
  { name: "Remifentanilo", group: "Opioide", defaultUnit: "mcg", commonBolus: [50, 100], infusionDoseUnit: "mcg/kg/min" },
  { name: "Morfina", group: "Opioide", defaultUnit: "mg", commonBolus: [2, 3, 5, 10] },
  // Relajantes
  { name: "Rocuronio", group: "Relajante", defaultUnit: "mg", commonBolus: [30, 40, 50, 60] },
  { name: "Cisatracurio", group: "Relajante", defaultUnit: "mg", commonBolus: [10, 14, 20] },
  { name: "Succinilcolina", group: "Relajante", defaultUnit: "mg", commonBolus: [50, 100] },
  { name: "Sugammadex", group: "Reversor", defaultUnit: "mg", commonBolus: [200, 400] },
  // Vasoactivos
  { name: "Noradrenalina", group: "Vasoactivo", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },
  { name: "Fenilefrina", group: "Vasoactivo", defaultUnit: "mcg", commonBolus: [50, 100, 200] },
  { name: "Efedrina", group: "Vasoactivo", defaultUnit: "mg", commonBolus: [5, 6, 10] },
  { name: "Atropina", group: "Vasoactivo", defaultUnit: "mg", commonBolus: [0.5, 1] },
  { name: "Dobutamina", group: "Vasoactivo", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },
  // Analgesia / antiemesis
  { name: "Dexametasona", group: "Otros", defaultUnit: "mg", commonBolus: [4, 8] },
  { name: "Ondansetron", group: "Otros", defaultUnit: "mg", commonBolus: [4, 8] },
  { name: "Paracetamol", group: "Analgesico", defaultUnit: "mg", commonBolus: [1000] },
  { name: "Dexketoprofeno", group: "Analgesico", defaultUnit: "mg", commonBolus: [50] },
  // Locales
  { name: "Ropivacaina", group: "Anestesico local", defaultUnit: "mg" },
  { name: "Bupivacaina", group: "Anestesico local", defaultUnit: "mg" },
  { name: "Lidocaina", group: "Anestesico local", defaultUnit: "mg" },
];

export const DRUG_UNITS = ["mg", "mcg", "ml", "UI", "mEq", "g"];

export function drugByName(name: string): DrugDef | undefined {
  return DRUGS.find((d) => d.name.toLowerCase() === name.toLowerCase());
}
