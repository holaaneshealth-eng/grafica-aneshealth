import type { jsPDF } from "jspdf";
import type { CaseState } from "../domain/events";
import { buildChartModel, type BuildOptions } from "./model/buildChartModel";
import { renderChart, type Diagnostics } from "./render/renderChart";

export { buildChartModel } from "./model/buildChartModel";
export { renderChart } from "./render/renderChart";
export type { Diagnostics } from "./render/renderChart";
export type { ChartModel, ChartPhoto } from "./model/chartModel";

export interface GraphicPagesOptions extends BuildOptions {
  reuseFirstPage?: boolean;
}

/** Dibuja las páginas de gráfica (A4 horizontal) en el documento dado. */
export function generateGraphicPages(doc: jsPDF, cs: CaseState, opts: GraphicPagesOptions = {}): Diagnostics {
  const model = buildChartModel(cs, { via1: opts.via1, photos: opts.photos });
  return renderChart(doc, model, opts.reuseFirstPage ?? true);
}
