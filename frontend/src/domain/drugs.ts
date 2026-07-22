// Catálogo de fármacos frecuentes (favoritos) para registro rápido.
export interface DrugDef {
  name: string;
  group: string;
  defaultUnit: string; // unidad de bolo por defecto
  commonBolus?: number[]; // dosis frecuentes para chips rápidos
  infusionDoseUnit?: string; // unidad típica en perfusión (dosis ponderada)
  gas?: boolean; // gas anestésico: solo % en aire espirado (sevoflurano)
  fluid?: boolean; // suero IV: 500 ml; al finalizar calcula el ritmo medio
  concVol?: boolean; // bolo neuroaxial: pide concentración (%) y volumen (ml)
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
  { name: "Metamizol", group: "Analgésico", defaultUnit: "mg", commonBolus: [2000] },
  { name: "Dexametasona", group: "Corticoide", defaultUnit: "mg", commonBolus: [4, 8] },
  { name: "Ondansetrón", group: "Antiemético", defaultUnit: "mg", commonBolus: [4, 8] },
  { name: "Droperidol", group: "Antiemético", defaultUnit: "mg", commonBolus: [0.625, 1.25, 2.5] },

  // Anestésicos locales (IV / infiltración)
  { name: "Ropivacaína", group: "Anestésico local", defaultUnit: "mg" },
  { name: "Bupivacaína", group: "Anestésico local", defaultUnit: "mg" },
  { name: "Lidocaína subcutánea", group: "Anestésico local", defaultUnit: "mg", commonBolus: [20, 40, 100] },

  // Anestésicos locales neuroaxiales (piden concentración % y volumen ml)
  { name: "Bupivacaína hiperbara intradural", group: "Neuroaxial", defaultUnit: "mg", concVol: true },
  { name: "Bupivacaína intradural", group: "Neuroaxial", defaultUnit: "mg", concVol: true },
  { name: "Prilocaína hiperbara intradural", group: "Neuroaxial", defaultUnit: "mg", concVol: true },
  { name: "Bupivacaína epidural", group: "Neuroaxial", defaultUnit: "mg", concVol: true },
  { name: "Lidocaína epidural", group: "Neuroaxial", defaultUnit: "mg", concVol: true },

  // Opioides neuroaxiales (dosis simple, sin concentración/volumen)
  { name: "Fentanilo intradural", group: "Neuroaxial", defaultUnit: "mcg", commonBolus: [10, 15, 25] },
  { name: "Fentanilo epidural", group: "Neuroaxial", defaultUnit: "mcg", commonBolus: [50, 100] },
  { name: "Morfina intradural", group: "Neuroaxial", defaultUnit: "mg", commonBolus: [0.1, 0.2, 0.3] },
  { name: "Morfina epidural", group: "Neuroaxial", defaultUnit: "mg", commonBolus: [1, 2, 3] },

  // Sueros (perfusión IV; 500 ml, ritmo medio al finalizar)
  { name: "Ringer lactato", group: "Suero", defaultUnit: "ml", fluid: true },
  { name: "Ringer acetato", group: "Suero", defaultUnit: "ml", fluid: true },
  { name: "Suero fisiológico", group: "Suero", defaultUnit: "ml", fluid: true },
];

export const DRUG_UNITS = ["mg", "mcg", "ml", "UI", "mEq", "g"];

// Biblioteca de diluciones estándar por fármaco (modificables en cada caso).
export interface Dilution {
  label: string;
  amount: number; // principio activo
  amountUnit: "mg" | "mcg";
  diluentMl: number; // volumen total
}

export const STANDARD_DILUTIONS: Record<string, Dilution[]> = {
  Noradrenalina: [
    { label: "5 mg / 50 ml", amount: 5, amountUnit: "mg", diluentMl: 50 },
    { label: "8 mg / 50 ml", amount: 8, amountUnit: "mg", diluentMl: 50 },
    { label: "10 mg / 100 ml", amount: 10, amountUnit: "mg", diluentMl: 100 },
  ],
  Remifentanilo: [
    { label: "2 mg / 40 ml (50 mcg/ml)", amount: 2, amountUnit: "mg", diluentMl: 40 },
    { label: "5 mg / 50 ml (100 mcg/ml)", amount: 5, amountUnit: "mg", diluentMl: 50 },
  ],
  Propofol: [{ label: "1000 mg / 50 ml (2%)", amount: 1000, amountUnit: "mg", diluentMl: 50 }],
  Dexmedetomidina: [{ label: "200 mcg / 50 ml (4 mcg/ml)", amount: 200, amountUnit: "mcg", diluentMl: 50 }],
  Rocuronio: [{ label: "50 mg / 50 ml", amount: 50, amountUnit: "mg", diluentMl: 50 }],
  Ketamina: [{ label: "250 mg / 50 ml", amount: 250, amountUnit: "mg", diluentMl: 50 }],
  Dobutamina: [{ label: "250 mg / 50 ml", amount: 250, amountUnit: "mg", diluentMl: 50 }],
  Dopamina: [{ label: "200 mg / 50 ml", amount: 200, amountUnit: "mg", diluentMl: 50 }],
  Nitroglicerina: [{ label: "50 mg / 50 ml", amount: 50, amountUnit: "mg", diluentMl: 50 }],
  Fenilefrina: [{ label: "10 mg / 100 ml (100 mcg/ml)", amount: 10, amountUnit: "mg", diluentMl: 100 }],
  Lidocaína: [{ label: "2000 mg / 500 ml", amount: 2000, amountUnit: "mg", diluentMl: 500 }],
  "Sulfato de magnesio": [{ label: "2000 mg / 100 ml", amount: 2000, amountUnit: "mg", diluentMl: 100 }],
  "Ácido tranexámico": [{ label: "1000 mg / 100 ml", amount: 1000, amountUnit: "mg", diluentMl: 100 }],
  Isoproterenol: [{ label: "1 mg / 50 ml (20 mcg/ml)", amount: 1000, amountUnit: "mcg", diluentMl: 50 }],
  Labetalol: [{ label: "100 mg / 100 ml", amount: 100, amountUnit: "mg", diluentMl: 100 }],
  Sufentanilo: [{ label: "250 mcg / 50 ml (5 mcg/ml)", amount: 250, amountUnit: "mcg", diluentMl: 50 }],
};

export function dilutionsFor(name: string): Dilution[] {
  return STANDARD_DILUTIONS[name] ?? [];
}

export function drugByName(name: string): DrugDef | undefined {
  return DRUGS.find((d) => d.name.toLowerCase() === name.toLowerCase());
}

/** Lista de fármacos para el modo indicado, ordenada alfabéticamente. */
export function drugsForMode(mode: "bolus" | "infusion"): DrugDef[] {
  const list = DRUGS.filter((d) => (mode === "bolus" ? !d.gas && !d.fluid : d.infusionDoseUnit || d.gas || d.fluid));
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, "es"));
}
