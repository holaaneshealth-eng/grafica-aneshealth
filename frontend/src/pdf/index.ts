import type { jsPDF } from "jspdf";
import type { CaseState } from "../domain/events";
import { buildChartModel, type BuildOptions } from "./model/buildChartModel";
import { renderChart, type Diagnostics } from "./render/renderChart";
import { buildLaborChartModel } from "./model/laborChartModel";
import { renderLaborChart } from "./render/renderLaborChart";

export { buildChartModel } from "./model/buildChartModel";
export { renderChart } from "./render/renderChart";
export { renderDataPage } from "./render/renderDataPage";
export type { Diagnostics } from "./render/renderChart";
export type { ChartModel, ChartPhoto } from "./model/chartModel";

export interface GraphicPagesOptions extends BuildOptions {
  reuseFirstPage?: boolean;
}

/** Dibuja las páginas de gráfica (A4 horizontal) en el documento dado. */
export function generateGraphicPages(doc: jsPDF, cs: CaseState, opts: GraphicPagesOptions = {}): Diagnostics {
  // Analgesia de parto: escala de parto (15 min/col). Si hay conversión a cesárea, se
  // añaden detrás las páginas de quirófano (escala 5 min) desde el momento de la conversión.
  if (cs.caseType === "analgesia_parto") {
    const laborModel = buildLaborChartModel(cs);
    const diag = renderLaborChart(doc, laborModel, opts.reuseFirstPage ?? true);
    if (cs.convertedAt) {
      const orModel = buildChartModel(cs, { via1: opts.via1, photos: opts.photos, fromAt: new Date(cs.convertedAt).getTime() });
      renderChart(doc, orModel, false);
    }
    return diag;
  }
  const model = buildChartModel(cs, { via1: opts.via1, photos: opts.photos });
  return renderChart(doc, model, opts.reuseFirstPage ?? true);
}
