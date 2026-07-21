// Catálogo de fármacos frecuentes (favoritos) para registro rápido.
// Agrupados por familia. Cada uno con unidad por defecto para minimizar pulsaciones.
export interface DrugDef {
  name: string;
  group: string;
  defaultUnit: string; // unidad de bolo por defecto
  commonBolus?: number[]; // dosis frecuentes para chips rápidos
  infusionDoseUnit?: string; // unidad típica en perfusión (dosis ponderada)
  gas?: boolean; // gas anestésico: solo se registra el % en aire espirado (sevoflurano)
}

export const DRUGS: DrugDef[] = [
  // Hipnóticos / sedantes
  { name: "Propofol", group: "Hipnótico", defaultUnit: "mg", commonBolus: [100, 150, 180, 200], infusionDoseUnit: "mg/kg/h" },
  { name: "Etomidato", group: "Hipnótico", defaultUnit: "mg", commonBolus: [14, 16, 20] },
  { name: "Ketamina", group: "Hipnótico", defaultUnit: "mg", commonBolus: [10, 20, 30, 50], infusionDoseUnit: "mcg/kg/min" },
  { name: "Midazolam", group: "Benzodiacepina", defaultUnit: "mg", commonBolus: [1, 2, 3, 5] },
  { name: "Dexmedetomidina", group: "Sedante", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/h" },

  // Gas anestésico
  { name: "Sevoflurano", group: "Gas anestésico", defaultUnit: "%", gas: true },

  // Opioides
  { name: "Fentanilo", group: "Opioide", defaultUnit: "mcg", commonBolus: [50, 100, 150, 200] },
  { name: "Remifentanilo", group: "Opioide", defaultUnit: "mcg", commonBolus: [50, 100], infusionDoseUnit: "mcg/kg/min" },
  { name: "Sufentanilo", group: "Opioide", defaultUnit: "mcg", commonBolus: [10, 20, 30], infusionDoseUnit: "mcg/kg/h" },
  { name: "Morfina", group: "Opioide", defaultUnit: "mg", commonBolus: [2, 3, 5, 10] },

  // Relajantes / reversores
  { name: "Rocuronio", group: "Relajante", defaultUnit: "mg", commonBolus: [30, 40, 50, 60], infusionDoseUnit: "mcg/kg/min" },
  { name: "Cisatracurio", group: "Relajante", defaultUnit: "mg", commonBolus: [10, 14, 20] },
  { name: "Succinilcolina", group: "Relajante", defaultUnit: "mg", commonBolus: [50, 100] },
  { name: "Sugammadex", group: "Reversor", defaultUnit: "mg", commonBolus: [200, 400] },
  { name: "Neostigmina", group: "Reversor", defaultUnit: "mg", commonBolus: [0.5, 1, 2.5] },

  // Vasoactivos / cardiovascular
  { name: "Noradrenalina", group: "Vasoactivo", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },
  { name: "Adrenalina", group: "Vasoactivo", defaultUnit: "mcg", commonBolus: [10, 50, 100, 1000], infusionDoseUnit: "mcg/kg/min" },
  { name: "Fenilefrina", group: "Vasoactivo", defaultUnit: "mcg", commonBolus: [50, 100, 200], infusionDoseUnit: "mcg/kg/min" },
  { name: "Efedrina", group: "Vasoactivo", defaultUnit: "mg", commonBolus: [5, 6, 10] },
  { name: "Dobutamina", group: "Vasoactivo", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },
  { name: "Dopamina", group: "Vasoactivo", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },
  { name: "Isoproterenol", group: "Vasoactivo", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },
  { name: "Atropina", group: "Vasoactivo", defaultUnit: "mg", commonBolus: [0.5, 1] },
  { name: "Esmolol", group: "Cardiovascular", defaultUnit: "mg", commonBolus: [10, 20, 50], infusionDoseUnit: "mcg/kg/min" },
  { name: "Labetalol", group: "Cardiovascular", defaultUnit: "mg", commonBolus: [5, 10, 20], infusionDoseUnit: "mg/kg/h" },
  { name: "Urapidil", group: "Cardiovascular", defaultUnit: "mg", commonBolus: [10, 25, 50] },
  { name: "Nitroglicerina", group: "Cardiovascular", defaultUnit: "mcg", infusionDoseUnit: "mcg/kg/min" },

  // Antiarrítmico / analgésico IV
  { name: "Lidocaína", group: "Antiarrítmico/Analgésico", defaultUnit: "mg", commonBolus: [50, 100], infusionDoseUnit: "mcg/kg/min" },

  // Electrolitos
  { name: "Cloruro cálcico", group: "Electrolito", defaultUnit: "mg", commonBolus: [500, 1000] },
  { name: "Gluconato cálcico", group: "Electrolito", defaultUnit: "mg", commonBolus: [1000, 2000] },
  { name: "Sulfato de magnesio", group: "Electrolito", defaultUnit: "mg", commonBolus: [1000, 2000], infusionDoseUnit: "mg/kg/h" },

  // Hemostasia / anticoagulación
  { name: "Ácido tranexámico", group: "Hemostasia", defaultUnit: "mg", commonBolus: [500, 1000], infusionDoseUnit: "mg/kg/h" },
  { name: "Heparina sódica", group: "Hemostasia", defaultUnit: "UI", commonBolus: [3000, 5000] },
  { name: "Sulfato de protamina", group: "Hemostasia", defaultUnit: "mg", commonBolus: [25, 50] },

  // Analgésicos / antieméticos / corticoides
  { name: "Paracetamol", group: "Analgésico", defaultUnit: "mg", commonBolus: [1000] },
  { name: "Dexketoprofeno", group: "Analgésico", defaultUnit: "mg", commonBolus: [50] },
  { name: "Dexametasona", group: "Corticoide", defaultUnit: "mg", commonBolus: [4, 8] },
  { name: "Ondansetrón", group: "Antiemético", defaultUnit: "mg", commonBolus: [4, 8] },

  // Anestésicos locales
  { name: "Ropivacaína", group: "Anestésico local", defaultUnit: "mg" },
  { name: "Bupivacaína", group: "Anestésico local", defaultUnit: "mg" },
];

export const DRUG_UNITS = ["mg", "mcg", "ml", "UI", "mEq", "g"];

export function drugByName(name: string): DrugDef | undefined {
  return DRUGS.find((d) => d.name.toLowerCase() === name.toLowerCase());
}
