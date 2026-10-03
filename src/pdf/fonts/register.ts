import type { jsPDF } from "jspdf";
import { ROBOTO_REGULAR_B64 } from "./roboto";

let cached = false;

/** Registra Roboto (Unicode) en el documento y la deja como fuente activa. */
export function registerFonts(doc: jsPDF): void {
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_REGULAR_B64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.setFont("Roboto", "normal");
  cached = true;
}

export const FONT = "Roboto";
void cached;
