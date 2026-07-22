import { useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { CaseState } from "../domain/events";
import { useStore } from "../store/store";
import { AnesthesiaChart, CHARTED } from "../components/AnesthesiaChart";
import { dmy, hhmm, durationBetween } from "../utils/time";
import { STANDARD_PARAMS } from "../domain/monitoring";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
  onToast: (m: string) => void;
  canSign: boolean;
  canReopen: boolean;
}

export function Summary({ cs, onToast, canSign, canReopen }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const append = useStore((s) => s.append);
  const reopenCase = useStore((s) => s.reopenCase);
  const getTimeline = useStore((s) => s.getTimeline);
  const timeline = getTimeline(cs.caseId);
  const [busy, setBusy] = useState(false);

  // La tabla seriada excluye las constantes que ya se representan en la gráfica.
  const paramsForTable = [
    ...STANDARD_PARAMS.filter((p) => cs.monitoring.standard.includes(p.code) && !CHARTED.has(p.code)),
    ...cs.monitoring.custom.filter((c) => !STANDARD_PARAMS.some((s) => s.code === c.code)),
  ];

  // Totales acumulados de fármacos (bolus) por fármaco + unidad.
  const drugTotals = (() => {
    const map = new Map<string, { drug: string; unit: string; total: number }>();
    for (const b of cs.boluses) {
      const key = `${b.drug}|${b.unit}`;
      const e = map.get(key) ?? { drug: b.drug, unit: b.unit, total: 0 };
      e.total += b.dose;
      map.set(key, e);
    }
    return Array.from(map.values());
  })();

  const totalBleeding = cs.balances.reduce((s, x) => s + (x.bleedingMl ?? 0), 0);
  const totalDiuresis = cs.balances.reduce((s, x) => s + (x.diuresisMl ?? 0), 0);

  async function renderCanvas(): Promise<HTMLCanvasElement> {
    return html2canvas(sheetRef.current!, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  }

  async function exportPDF() {
    setBusy(true);
    try {
      const canvas = await renderCanvas();
      const pdf = new jsPDF("l", "mm", "a4"); // A4 horizontal
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const headerH = 9;
      const footerH = 7;
      const contentH = ph - headerH - footerH;
      const pxPerMm = canvas.width / pw;
      const pageContentPx = contentH * pxPerMm;
      const pages = Math.max(1, Math.ceil(canvas.height / pageContentPx));
      for (let p = 0; p < pages; p++) {
        if (p > 0) pdf.addPage();
        const slicePx = Math.min(pageContentPx, canvas.height - p * pageContentPx);
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = slicePx;
        const ctx = tmp.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, p * pageContentPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(tmp.toDataURL("image/png"), "PNG", 0, headerH, pw, slicePx / pxPerMm);
        // Cabecera y pie repetidos en cada página
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        pdf.text(`Hoja Anestésica · ${cs.ia}`, 6, 6);
        pdf.text(dmy(cs.createdAt), pw - 6, 6, { align: "right" });
        pdf.text(`Página ${p + 1}/${pages}`, pw - 6, ph - 2.5, { align: "right" });
        pdf.text(cs.signedAt ? `Firmado: ${cs.signedBy}` : "Documento pseudonimizado (RGPD)", 6, ph - 2.5);
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
      {canReopen && (
        <div className="card no-print" style={{ borderColor: "var(--accent)" }}>
          <h2 style={{ fontSize: 16 }}>¿Falta algo por registrar?</h2>
          <p className="sub">El caso está cerrado pero aún no firmado. Puedes reabrirlo para seguir completando.</p>
          <button
            className="btn block lg"
            onClick={() => {
              reopenCase(cs.caseId);
              onToast("Caso reabierto para completar");
            }}
          >
            ← Volver a completar
          </button>
        </div>
      )}

      <div className="card no-print">
        <h2>Finalización</h2>
        <p className="sub">
          Genera la hoja anestésica en A4 vertical, firma y envío.
          {!cs.signedAt && " La firma es el punto de no retorno: tras firmar no se puede reabrir."}
        </p>
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

        {/* Gráfica anestésica integrada (hemodinámica + fármacos + eventos) */}
        <h2>Gráfica anestésica</h2>
        <AnesthesiaChart cs={cs} light />

        {/* Totales acumulados de fármacos (bolus) */}
        {drugTotals.length > 0 && (
          <>
            <h2>Totales de fármacos (bolus)</h2>
            <div className="muted" style={{ fontSize: 11 }}>
              {drugTotals.map((t) => `${t.drug}: ${formatNum(t.total)} ${t.unit}`).join("  ·  ")}
            </div>
          </>
        )}

        {/* Balance (solo si hay datos) */}
        {cs.balances.length > 0 && (
          <>
            <h2>Balance</h2>
            <div className="muted" style={{ fontSize: 12 }}>
              Sangrado total: <strong>{totalBleeding} ml</strong> · Diuresis total: <strong>{totalDiuresis} ml</strong>
            </div>
          </>
        )}

        {/* Hemoderivados y analítica (solo si hay datos) */}
        {(cs.bloodProducts.length > 0 || cs.labs.length > 0) && (
          <div className="sheet-cols">
            {cs.bloodProducts.length > 0 && (
              <div>
                <h2>Hemoderivados</h2>
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
              </div>
            )}
            {cs.labs.length > 0 && (
              <div>
                <h2>Analítica intraoperatoria</h2>
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
              </div>
            )}
          </div>
        )}

        {/* Registro seriado (excluye las constantes ya representadas en la gráfica) */}
        {cs.vitals.length > 0 && paramsForTable.length > 0 && (
          <>
            <h2>Monitorización (registro seriado)</h2>
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
          </>
        )}

        {/* Incidencias (solo si hay) */}
        {cs.incidents.length > 0 && (
          <>
            <h2>Incidencias</h2>
            <table>
              <tbody>
                {cs.incidents.map((i) => (
                  <tr key={i.id}>
                    <td style={{ width: 44 }}>{hhmm(i.at)}</td>
                    <td>
                      [{i.severity}] {i.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

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
