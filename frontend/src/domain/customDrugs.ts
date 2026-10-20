// Fármacos "Otro fármaco" añadidos a mano. La fuente de verdad es el SERVIDOR (tabla
// custom_drugs, compartida por todos los usuarios y dispositivos). Aquí solo se mantiene
// un registro EN MEMORIA que el store rellena al arrancar, para que las funciones
// síncronas del catálogo (drugByName / drugsForMode) lo tengan disponible.
import type { DrugDef } from "./drugs";

let registry: DrugDef[] = [];

const clean = (list: unknown): DrugDef[] =>
  Array.isArray(list) ? (list as DrugDef[]).filter((d) => d && typeof d.name === "string" && d.name.trim()) : [];

/** Catálogo personalizado actual (en memoria). */
export function getCustomDrugs(): DrugDef[] {
  return registry;
}

/** Compatibilidad con drugs.ts: devuelve el catálogo personalizado en memoria. */
export function loadCustomDrugs(): DrugDef[] {
  return registry;
}

/** Reemplaza el registro con la lista traída del servidor. */
export function setCustomDrugs(list: DrugDef[]): void {
  registry = clean(list);
}

/** Añade/actualiza un fármaco en memoria (actualización optimista; el store lo persiste). */
export function upsertCustomDrugLocal(def: DrugDef): void {
  const name = def.name.trim();
  if (!name) return;
  const i = registry.findIndex((d) => d.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) registry = registry.map((d, j) => (j === i ? { ...d, ...def, name } : d));
  else registry = [...registry, { ...def, name }];
}

// --- Migración de los fármacos guardados en el navegador por la versión anterior ---
const LEGACY_KEY = "aneshealth-custom-drugs-v1";

export function readLegacyCustomDrugs(): DrugDef[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(LEGACY_KEY);
    return clean(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function clearLegacyCustomDrugs(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
