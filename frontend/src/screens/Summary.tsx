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
    ...cs.monitoring.custom.filter((c) => !STANDARD_PARAMS.some((s) => s.code === c.code)),
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
    const subject = `Hoja anestésica ${cs.ia}`;
    const body = buildTextSummary(cs, timeline);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const antibioticLine = cs.preop.antibiotic
    ? `${cs.preop.antibiotic}${cs.preop.antibioticTime ? ` (${hhmm(cs.preop.antibioticTime)})` : ""}`
    : "-";

  return (
    <div>
      <div className="card no-print">
        <h2>Finalización</h2>
        <p className="sub">Genera la hoja anestésica en A4 vertical, firma y envío.</p>
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
            Firmar hoja (firma electrónica)
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
            <h1>Hoja Anestésica</h1>
            <div className="muted">AnesHealth · Registro digital orientado a eventos</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sheet-ia">{cs.ia}</div>
            <div className="muted">{dmy(cs.createdAt)}</div>
          </div>
        </div>

        <table style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td className="muted">Inicio</td>
              <td>{hhmm(cs.createdAt)}</td>
              <td className="muted">Fin</td>
              <td>{cs.endedAt ? hhmm(cs.endedAt) : "-"}</td>
              <td className="muted">Duración</td>
              <td>{cs.endedAt ? durationBetween(cs.createdAt, cs.endedAt) : "-"}</td>
              <td className="muted">Talla / Peso</td>
              <td>
                {cs.preop.heightCm ?? "-"} cm / {cs.preop.weightKg ?? "-"} kg
              </td>
            </tr>
          </tbody>
        </table>

        {/* Bloque compacto en dos columnas */}
        <div className="sheet-cols">
          <div>
            <h2>Valoración preanestésica</h2>
            <table>
              <tbody>
                <tr>
                  <td className="muted" style={{ width: 110 }}>Alergias</td>
                  <td>{cs.preop.allergies || "-"}</td>
                </tr>
                <tr>
                  <td className="muted">Antecedentes</td>
                  <td>{cs.preop.history || "-"}</td>
                </tr>
                <tr>
                  <td className="muted">Medicación</td>
                  <td>{cs.preop.medication || "-"}</td>
                </tr>
                <tr>
                  <td className="muted">Antibiótico</td>
                  <td>{antibioticLine}</td>
                </tr>
              </tbody>
            </table>
            <h2>Checklist de seguridad</h2>
            <div className="muted" style={{ fontSize: 11 }}>
              Monitor: {yn(cs.safety.monitorChecked)} · Respirador: {yn(cs.safety.ventilatorChecked)} · Aspirador:{" "}
              {yn(cs.safety.suctionReady)} · Ambú: {yn(cs.safety.ambuReady)}
            </div>
          </div>
          <div>
            <h2>Técnicas anestésicas</h2>
            {cs.techniques.length === 0 ? (
              <div className="muted">Sin registrar</div>
            ) : (
              <table>
                <tbody>
                  {cs.techniques.map((t) => (
                    <tr key={t.id}>
                      <td style={{ width: 44 }}>{hhmm(t.at)}</td>
                      <td>
                        <strong>{t.label}</strong>
                        <div className="muted" style={{ fontSize: 10 }}>
                          {Object.entries(t.details)
                            .filter(([, v]) => v !== "" && v != null)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" | ")}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Gráficas: el elemento con más peso visual */}
        <h2>Gráficas de tendencias</h2>
        <TrendCharts cs={cs} light maxPoints={60} />

        {/* Medicación */}
        <h2>Medicación</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>Hora</th>
              <th>Fármaco</th>
              <th style={{ width: 66 }}>Tipo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {cs.boluses.map((b) => (
              <tr key={b.id}>
                <td>{hhmm(b.at)}</td>
                <td>{b.drug}</td>
                <td>Bolus</td>
                <td>
                  {formatNum(b.dose)} {b.unit}
                </td>
              </tr>
            ))}
            {cs.infusions.map((i) => (
              <tr key={i.id}>
                <td>{hhmm(i.startedAt)}</td>
                <td>{i.drug}</td>
                <td>Perfusión</td>
                <td>
                  {i.summary}
                  {!i.gas ? ` (conc. ${formatNum(i.concentration)} ${i.concentrationUnit})` : ""}
                  {i.stoppedAt ? ` · fin ${hhmm(i.stoppedAt)}` : " · en curso"}
                </td>
              </tr>
            ))}
            {cs.boluses.length === 0 && cs.infusions.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">Sin registrar</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Hemoderivados y analítica en dos columnas */}
        <div className="sheet-cols">
          <div>
            <h2>Hemoderivados</h2>
            {cs.bloodProducts.length === 0 ? (
              <div className="muted">Sin registrar</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>Hora</th>
                    <th>Producto</th>
                    <th>Nº</th>
                    <th>R.A.</th>
                  </tr>
                </thead>
                <tbody>
                  {cs.bloodProducts.map((b) => (
                    <tr key={b.id}>
                      <td>{hhmm(b.at)}</td>
                      <td>{b.product}</td>
                      <td>{b.registryNumber || "-"}</td>
                      <td>{b.adverseReaction === true ? "Sí" : b.adverseReaction === false ? "No" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h2>Analítica intraoperatoria</h2>
            {cs.labs.length === 0 ? (
              <div className="muted">Sin registrar</div>
            ) : (
              <table>
                <tbody>
                  {cs.labs.map((l) => (
                    <tr key={l.id}>
                      <td style={{ width: 44 }}>{hhmm(l.at)}</td>
                      <td>
                        {Object.entries(l.values)
                          .map(([k, v]) => `${k} ${formatNum(v)}`)
                          .join(" · ")}
                        {l.notes ? ` · ${l.notes}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Registro seriado numérico (datos completos, sin pérdida) */}
        <h2>Monitorización (registro seriado)</h2>
        {cs.vitals.length === 0 ? (
          <div className="muted">Sin registros</div>
        ) : (
          <table className="dense">
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

        {/* Incidencias y cronología */}
        <div className="sheet-cols">
          <div>
            <h2>Incidencias</h2>
            {cs.incidents.length === 0 ? (
              <div className="muted">Sin incidencias</div>
            ) : (
              <table>
                <tbody>
                  {cs.incidents.map((i) => (
                    <tr key={i.id}>
                      <td style={{ width: 44 }}>{hhmm(i.at)}</td>
                      <td>[{i.severity}] {i.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h2>Cronología</h2>
            <table>
              <tbody>
                {timeline.map((it) => (
                  <tr key={it.id}>
                    <td style={{ width: 44 }}>{hhmm(it.at)}</td>
                    <td>
                      <strong>{it.label}</strong>
                      {it.detail ? <span className="muted"> · {it.detail}</span> : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="foot">
          <span>Documento pseudonimizado (RGPD). Identificado únicamente por IA.</span>
          <span>{cs.signedAt ? `Firmado: ${cs.signedBy} · ${dmy(cs.signedAt)} ${hhmm(cs.signedAt)}` : "Sin firmar"}</span>
        </div>
      </div>
    </div>
  );
}

function yn(v: boolean | null): string {
  return v === true ? "Sí" : v === false ? "No" : "-";
}

function buildTextSummary(cs: CaseState, timeline: { at: string; label: string; detail?: string }[]): string {
  const lines: string[] = [];
  lines.push(`HOJA ANESTÉSICA ${cs.ia}`);
  lines.push(`Fecha: ${dmy(cs.createdAt)}`);
  lines.push(`Peso: ${cs.preop.weightKg ?? "-"} kg  Talla: ${cs.preop.heightCm ?? "-"} cm`);
  lines.push("");
  lines.push("CRONOLOGÍA:");
  timeline.forEach((it) => lines.push(`${hhmm(it.at)}  ${it.label}${it.detail ? " - " + it.detail : ""}`));
  return lines.join("\n");
}
