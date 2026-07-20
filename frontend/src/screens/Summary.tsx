import { useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { CaseState } from "../domain/events";
import { useStore } from "../store/store";
import { TrendCharts } from "../components/TrendCharts";
import { dmy, hhmm, durationBetween } from "../utils/time";
import { STANDARD_PARAMS } from "../domain/monitoring";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
  onToast: (m: string) => void;
  canSign: boolean;
}

export function Summary({ cs, onToast, canSign }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const append = useStore((s) => s.append);
  const getTimeline = useStore((s) => s.getTimeline);
  const timeline = getTimeline(cs.caseId);
  const [busy, setBusy] = useState(false);

  const paramsForTable = [
    ...STANDARD_PARAMS.filter((p) => cs.monitoring.standard.includes(p.code)),
    ...cs.monitoring.custom,
  ];

  async function renderCanvas(): Promise<HTMLCanvasElement> {
    return html2canvas(sheetRef.current!, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  }

  async function exportPDF() {
    setBusy(true);
    try {
      const canvas = await renderCanvas();
      const pdf = new jsPDF("p", "mm", "a4");
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      const img = canvas.toDataURL("image/png");
      let pos = 0;
      let left = imgH;
      // Paginado si excede A4
      while (left > 0) {
        pdf.addImage(img, "PNG", 0, pos, pw, imgH);
        left -= ph;
        if (left > 0) {
          pdf.addPage();
          pos -= ph;
        }
      }
      pdf.save(`hoja-anestesica-${cs.ia}.pdf`);
      onToast("PDF generado");
    } finally {
      setBusy(false);
    }
  }

  async function exportPNG() {
    setBusy(true);
    try {
      const canvas = await renderCanvas();
      const link = document.createElement("a");
      link.download = `hoja-anestesica-${cs.ia}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      onToast("Imagen generada");
    } finally {
      setBusy(false);
    }
  }

  function sign() {
    const who = useStore.getState().user?.displayName ?? "";
    append(cs.caseId, "CASE_SIGNED", { signedBy: who });
    onToast("Hoja firmada por " + who);
  }

  function sendEmail() {
    const subject = `Hoja anestesica ${cs.ia}`;
    const body = buildTextSummary(cs, timeline);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div>
      <div className="card no-print">
        <h2>Finalizacion</h2>
        <p className="sub">Genera la hoja anestesica en A4 vertical, firma y envio.</p>
        <div className="grid2">
          <button className="btn primary lg" onClick={exportPDF} disabled={busy}>
            {busy ? "Generando..." : "Descargar PDF"}
          </button>
          <button className="btn lg" onClick={exportPNG} disabled={busy}>
            Descargar imagen
          </button>
          <button className="btn lg" onClick={() => window.print()}>
            Imprimir
          </button>
          <button className="btn lg" onClick={sendEmail}>
            Enviar por email
          </button>
        </div>
        {cs.signedAt ? (
          <div className="alert" style={{ marginTop: 12 }}>
            Firmada por {cs.signedBy} el {dmy(cs.signedAt)} a las {hhmm(cs.signedAt)}.
          </div>
        ) : canSign ? (
          <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={sign}>
            Firmar hoja (firma electronica)
          </button>
        ) : (
          <div className="alert" style={{ marginTop: 12 }}>
            Solo el anestesista responsable puede firmar esta hoja.
          </div>
        )}
      </div>

      {/* Hoja A4 */}
      <div className="sheet" ref={sheetRef}>
        <div className="sheet-head">
          <div>
            <h1>Hoja Anestesica</h1>
            <div className="muted">AnesHealth - Registro digital orientado a eventos</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sheet-ia">{cs.ia}</div>
            <div className="muted">{dmy(cs.createdAt)}</div>
          </div>
        </div>

        <table style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <td className="muted">Inicio</td>
              <td>{hhmm(cs.createdAt)}</td>
              <td className="muted">Fin</td>
              <td>{cs.endedAt ? hhmm(cs.endedAt) : "-"}</td>
              <td className="muted">Duracion</td>
              <td>{cs.endedAt ? durationBetween(cs.createdAt, cs.endedAt) : "-"}</td>
            </tr>
            <tr>
              <td className="muted">Talla</td>
              <td>{cs.preop.heightCm ?? "-"} cm</td>
              <td className="muted">Peso</td>
              <td>{cs.preop.weightKg ?? "-"} kg</td>
              <td className="muted">Firma</td>
              <td>{cs.signedBy ?? "Pendiente"}</td>
            </tr>
          </tbody>
        </table>

        <h2>Valoracion preanestesica</h2>
        <table>
          <tbody>
            <tr><td className="muted" style={{ width: 140 }}>Alergias</td><td>{cs.preop.allergies || "-"}</td></tr>
            <tr><td className="muted">Antecedentes</td><td>{cs.preop.history || "-"}</td></tr>
            <tr><td className="muted">Medicacion</td><td>{cs.preop.medication || "-"}</td></tr>
          </tbody>
        </table>

        <h2>Checklist de seguridad</h2>
        <table>
          <tbody>
            <tr>
              <td>Monitor: {yn(cs.safety.monitorChecked)}</td>
              <td>Respirador: {yn(cs.safety.ventilatorChecked)}</td>
              <td>Aspirador: {yn(cs.safety.suctionReady)}</td>
              <td>Ambu: {yn(cs.safety.ambuReady)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Tecnicas anestesicas</h2>
        {cs.techniques.length === 0 ? (
          <div className="muted">Sin registrar</div>
        ) : (
          <table>
            <tbody>
              {cs.techniques.map((t) => (
                <tr key={t.id}>
                  <td style={{ width: 60 }}>{hhmm(t.at)}</td>
                  <td><strong>{t.label}</strong></td>
                  <td>
                    {Object.entries(t.details)
                      .filter(([, v]) => v !== "" && v != null)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join("  |  ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Medicacion</h2>
        <table>
          <thead>
            <tr><th>Hora</th><th>Farmaco</th><th>Tipo</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            {cs.boluses.map((b) => (
              <tr key={b.id}>
                <td>{hhmm(b.at)}</td>
                <td>{b.drug}</td>
                <td>Bolus</td>
                <td>{formatNum(b.dose)} {b.unit}</td>
              </tr>
            ))}
            {cs.infusions.map((i) => (
              <tr key={i.id}>
                <td>{hhmm(i.startedAt)}</td>
                <td>{i.drug}</td>
                <td>Perfusion</td>
                <td>{i.summary} (conc. {formatNum(i.concentration)} {i.concentrationUnit}){i.stoppedAt ? ` - fin ${hhmm(i.stoppedAt)}` : ""}</td>
              </tr>
            ))}
            {cs.boluses.length === 0 && cs.infusions.length === 0 && (
              <tr><td colSpan={4} className="muted">Sin registrar</td></tr>
            )}
          </tbody>
        </table>

        <h2>Monitorizacion (registro seriado)</h2>
        {cs.vitals.length === 0 ? (
          <div className="muted">Sin registros</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                {paramsForTable.map((p) => (
                  <th key={p.code}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cs.vitals
                .slice()
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((v) => (
                  <tr key={v.id}>
                    <td>{hhmm(v.at)}</td>
                    {paramsForTable.map((p) => (
                      <td key={p.code}>{v.values[p.code] ?? "-"}</td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        <h2>Graficas de tendencias</h2>
        <TrendCharts cs={cs} light />

        <h2>Incidencias</h2>
        {cs.incidents.length === 0 ? (
          <div className="muted">Sin incidencias</div>
        ) : (
          <table>
            <tbody>
              {cs.incidents.map((i) => (
                <tr key={i.id}>
                  <td style={{ width: 60 }}>{hhmm(i.at)}</td>
                  <td>[{i.severity}]</td>
                  <td>{i.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>Cronologia completa</h2>
        <table>
          <tbody>
            {timeline.map((it) => (
              <tr key={it.id}>
                <td style={{ width: 60 }}>{hhmm(it.at)}</td>
                <td><strong>{it.label}</strong></td>
                <td>{it.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="foot">
          <span>Documento pseudonimizado (RGPD). Identificado unicamente por IA.</span>
          <span>{cs.signedAt ? `Firmado: ${cs.signedBy} - ${dmy(cs.signedAt)} ${hhmm(cs.signedAt)}` : "Sin firmar"}</span>
        </div>
      </div>
    </div>
  );
}

function yn(v: boolean | null): string {
  return v === true ? "Si" : v === false ? "No" : "-";
}

function buildTextSummary(cs: CaseState, timeline: { at: string; label: string; detail?: string }[]): string {
  const lines: string[] = [];
  lines.push(`HOJA ANESTESICA ${cs.ia}`);
  lines.push(`Fecha: ${dmy(cs.createdAt)}`);
  lines.push(`Peso: ${cs.preop.weightKg ?? "-"} kg  Talla: ${cs.preop.heightCm ?? "-"} cm`);
  lines.push("");
  lines.push("CRONOLOGIA:");
  timeline.forEach((it) => lines.push(`${hhmm(it.at)}  ${it.label}${it.detail ? " - " + it.detail : ""}`));
  return lines.join("\n");
}
