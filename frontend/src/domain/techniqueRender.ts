// Representación de los detalles de una técnica anestésica para la hoja/el PDF.
// Reglas:
//   - Campo de texto libre: solo el contenido, sin título.
//   - Campo numérico o de opciones (select): "Título: valor" (con unidad si la tiene).
//   - Campo sí/no: solo si es afirmativo, mostrando su título. Los negativos y vacíos no.
//   - Nunca se muestra el nombre interno del campo (en inglés).
import { techniqueById, type TechniqueField } from "./techniques";
import type { TechniqueRecord } from "./events";

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function isYes(v: unknown): boolean {
  return v === true || v === "true" || v === "Sí" || v === "sí" || v === "si";
}

export function techniqueDetailLines(t: TechniqueRecord): string[] {
  const def = techniqueById(t.type);
  const lines: string[] = [];
  const seen = new Set<string>();

  const emit = (field: TechniqueField | undefined, value: unknown) => {
    const type = field?.type ?? "text";
    const label = field?.label ?? "";
    if (type === "yesno" || typeof value === "boolean") {
      // Sí/no: solo si es afirmativo y tenemos un título en castellano.
      if (isYes(value) && label) lines.push(label);
      return;
    }
    if (isEmpty(value)) return;
    const v = String(value).trim();
    const unit = field?.unit ? ` ${field.unit}` : "";
    if (type === "text" || !label) lines.push(`${v}${unit}`); // texto libre: solo el contenido
    else lines.push(`${label}: ${v}${unit}`); // numérico/opciones: "Título: valor"
  };

  // Primero los campos definidos (orden estable y títulos en castellano).
  if (def) {
    for (const f of def.fields) {
      seen.add(f.key);
      if (f.key in t.details) emit(f, (t.details as Record<string, unknown>)[f.key]);
    }
  }
  // Claves sin definición (legado): mostrar solo el valor, nunca el nombre interno.
  for (const [k, val] of Object.entries(t.details)) {
    if (seen.has(k)) continue;
    emit(undefined, val);
  }
  return lines;
}
