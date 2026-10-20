// Fármacos "Otro fármaco" añadidos por el usuario. Se guardan en el navegador
// (localStorage) para quedar disponibles en los siguientes casos, igual que los del
// catálogo. No contienen datos de paciente, solo la definición del fármaco.
import type { DrugDef } from "./drugs";

const KEY = "aneshealth-custom-drugs-v1";
let cache: DrugDef[] | null = null;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // entornos sin almacenamiento (p. ej. render en Node)
  }
}

export function loadCustomDrugs(): DrugDef[] {
  if (cache) return cache;
  const s = safeStorage();
  try {
    const raw = s?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as DrugDef[]) : [];
    cache = Array.isArray(parsed) ? parsed.filter((d) => d && typeof d.name === "string" && d.name.trim()) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Añade (o actualiza) un fármaco personalizado. Devuelve true si quedó registrado. */
export function addCustomDrug(def: DrugDef): boolean {
  const name = def.name.trim();
  if (!name) return false;
  const list = loadCustomDrugs();
  const idx = list.findIndex((d) => d.name.toLowerCase() === name.toLowerCase());
  const entry: DrugDef = { ...def, name };
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
  const s = safeStorage();
  try {
    s?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento no disponible: queda al menos en memoria durante la sesión */
  }
  cache = list;
  return true;
}
