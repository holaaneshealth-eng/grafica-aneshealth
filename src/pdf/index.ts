import type { jsPDF } from "jspdf";
import type { BaseEvent, CaseState } from "../domain/events";
import { buildChartModel } from "./model/buildChartModel";
import { renderChart, type Diagnostics } from "./render/renderChart";

export { buildChartModel } from "./model/buildChartModel";
export { renderChart } from "./render/renderChart";
export type { Diagnostics } from "./render/renderChart";
export type { ChartModel } from "./model/chartModel";

/**
 * Dibuja las páginas de gráfica (A4 horizontal) en el documento dado.
 * Reutiliza la primera página del documento si reuseFirstPage=true.
 */
export function generateGraphicPages(
  doc: jsPDF,
  cs: CaseState,
  events: BaseEvent[],
  reuseFirstPage = true,
): Diagnostics {
  const model = buildChartModel(cs, events);
  return renderChart(doc, model, reuseFirstPage);
}
