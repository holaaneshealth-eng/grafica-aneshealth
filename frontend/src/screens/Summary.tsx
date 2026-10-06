import { useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { CaseState } from "../domain/events";
import { useStore } from "../store/store";
import { AnesthesiaChart, CHARTED } from "../components/AnesthesiaChart";
import { generateGraphicPages, type ChartPhoto } from "../pdf";
import { api, ApiError } from "../api";
import { dmy, hhmm } from "../utils/time";
import { STANDARD_PARAMS } from "../domain/monitoring";
import { formatNum } from "../domain/calculations";
import { techniqueDetailLines } from "../domain/techniqueRender";
import { WHO_PHASES } from "../domain/clinical";

interface Props {
  cs: CaseState;
  onToast: (m: string) => void;
  canSign: boolean;
  canReopen: boolean;
}

export function Summary({ cs, onToast, canSign, canReopen }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const chartBlockRef = useRef<HTMLDivElement>(null); // gráfica SVG en pantalla (se oculta al generar el PDF vectorial)
  const imageSheetRef = useRef<HTMLDivElement>(null); // versión simplificada para la imagen
  const append = useStore((s) => s.append);
  const reopenCase = useStore((s) => s.reopenCase);
  const getTimeline = useStore((s) => s.getTimeline);
  const getCaseEvents = useStore((s) => s.getCaseEvents);
  const timeline = getTimeline(cs.caseId);

  // Nº de firmas del caso = versión de la hoja (1 la primera, 2 tras re-firmar, ...).
  const signatureCount = getCaseEvents(cs.caseId).filter((e) => e.type === "CASE_SIGNED").length;
  // ¿Hay un envío correcto para la versión firmada actual?
  const sentOkForCurrent = cs.emailSends.some((e) => e.ok && e.version === signatureCount);
  const emailPending = !!cs.signedAt && !sentOkForCurrent;
  const [busy, setBusy] = useState(false);
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // La tabla seriada excluye las constantes que ya se representan en la gráfica.
  const paramsForTable = [
    ...STANDARD_PARAMS.filter((p) => cs.monitoring.standard.includes(p.code) && !CHARTED.has(p.code)),
    ...cs.monitoring.custom.filter((c) => !STANDARD_PARAMS.some((s) => s.code === c.code)),
  ];

  const totalBleeding = cs.balances.reduce((s, x) => s + (x.bleedingMl ?? 0), 0);
  const totalDiuresis = cs.balances.reduce((s, x) => s + (x.diuresisMl ?? 0), 0);
  const totalInsensible = cs.balances.reduce((s, x) => s + (x.insensibleMl ?? 0), 0);

  // Resumen del checklist de la OMS (solo se plasma si se ha marcado algo).
  const whoDone = WHO_PHASES.map((ph) => ({
    phase: ph.phase,
    done: ph.items.filter((it) => cs.who[it.key] === true).length,
    total: ph.items.length,
  }));
  const whoAnyChecked = whoDone.some((p) => p.done > 0);

  // El checklist de seguridad se resume como OK (el gating impide llegar aquí si no lo está).
  const safetyOk = [cs.safety.monitorChecked, cs.safety.ventilatorChecked, cs.safety.suctionReady, cs.safety.ambuReady].every((v) => v === true);

  async function renderCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
    return html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  }

  // Construye el PDF completo (gráfica vectorial + fotos del monitor + resto de la hoja).
  async function buildPdfDoc(): Promise<jsPDF> {
    const chartBlock = chartBlockRef.current;
    try {
      const pdf = new jsPDF("l", "mm", "a4");
      // Vía 1: las fotos se incrustan DENTRO de las páginas de gráfica (sustituyen a la
      // banda hemodinámica y a las filas del monitor). Ya no hay página aparte.
      const via1 = cs.monitorVia === 1;
      const photos = via1 ? await loadVia1Photos(cs.caseId) : [];
      generateGraphicPages(pdf, cs, { reuseFirstPage: true, via1, photos });

      if (chartBlock) chartBlock.style.display = "none";
      const canvas = await renderCanvas(sheetRef.current!);
      if (chartBlock) chartBlock.style.display = "";

      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const headerH = 9;
      const footerH = 7;
      const contentH = ph - headerH - footerH;
      const pxPerMm = canvas.width / pw;
      const pageContentPx = contentH * pxPerMm;
      const pages = Math.max(1, Math.ceil(canvas.height / pageContentPx));
      for (let p = 0; p < pages; p++) {
        pdf.addPage("a4", "landscape");
        const slicePx = Math.min(pageContentPx, canvas.height - p * pageContentPx);
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = slicePx;
        const ctx = tmp.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tmp.width, tmp.height);
        ctx.drawImage(canvas, 0, p * pageContentPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(tmp.toDataURL("image/png"), "PNG", 0, headerH, pw, slicePx / pxPerMm);
        pdf.setFontSize(8);
        pdf.setTextColor(90);
        pdf.text(`Hoja Anestésica · ${cs.ia}`, 6, 6);
        pdf.text(dmy(cs.createdAt), pw - 6, 6, { align: "right" });
        pdf.text(cs.signedAt ? `Firmado: ${cs.signedBy}` : "Documento pseudonimizado (RGPD)", 6, ph - 2.5);
      }
      // Numeración ÚNICA y consecutiva de TODO el documento (gráfica + datos).
      stampPageNumbers(pdf);
      return pdf;
    } finally {
      if (chartBlock) chartBlock.style.display = "";
    }
  }

  async function exportPDF() {
    setBusy(true);
    try {
      const pdf = await buildPdfDoc();
      pdf.save(`${cs.ia}.pdf`);
      onToast("PDF generado");
    } finally {
      setBusy(false);
    }
  }

  // Genera el PDF y lo envía al backend, que lo manda por correo (Resend). Registra el
  // resultado como evento SHEET_EMAILED (persiste "pendiente de envío" tras recargar).
  async function sendPdfByEmail(version: number, signedAtIso: string) {
    setBusy(true);
    setMailMsg(null);
    try {
      // Espera un instante a que la hoja refleje la firma recién añadida antes de rasterizar.
      await new Promise((r) => setTimeout(r, 80));
      const pdf = await buildPdfDoc();
      const pdfBase64 = pdf.output("datauristring"); // data:application/pdf;base64,...
      const r = await api.sendSheetPdf({ pdfBase64, ia: cs.ia, version, signedAt: signedAtIso });
      append(cs.caseId, "SHEET_EMAILED", { at: new Date().toISOString(), to: r.to, subject: r.subject, version, ok: true });
      setMailMsg({ ok: true, text: `PDF enviado a ${r.to} · asunto: "${r.subject}". Revisa la bandeja de entrada y el correo no deseado.` });
      onToast(`PDF enviado a ${r.to}`);
    } catch (err) {
      const detail =
        err instanceof ApiError ? `${err.message} (código ${err.status}${err.code ? " · " + err.code : ""})` : err instanceof Error ? err.message : "error desconocido";
      // eslint-disable-next-line no-console
      console.error("[email] fallo al enviar el PDF:", err);
      append(cs.caseId, "SHEET_EMAILED", { at: new Date().toISOString(), to: "", subject: "", version, ok: false });
      setMailMsg({ ok: false, text: `No se pudo enviar el PDF: ${detail}. La firma es válida; el caso queda pendiente de envío.` });
      onToast("No se pudo enviar el correo");
    } finally {
      setBusy(false);
    }
  }

  // Genera la imagen SIMPLIFICADA (solo gráfica, técnicas y constantes) <= 870 KB.
  async function buildImageBlob(): Promise<{ blob: Blob; ext: string }> {
    const LIMIT = 870 * 1024;
    const base = await renderCanvas(imageSheetRef.current!);
    const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
      new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), type, q));
    const scaleCanvas = (src: HTMLCanvasElement, f: number) => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(src.width * f));
      c.height = Math.max(1, Math.round(src.height * f));
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return c;
    };

    let blob = await toBlob(base, "image/png");
    let ext = "png";
    // Si el PNG supera el límite, pasamos a JPG bajando calidad.
    if (blob.size > LIMIT) {
      ext = "jpg";
      for (const q of [0.92, 0.85, 0.75, 0.65, 0.55]) {
        blob = await toBlob(base, "image/jpeg", q);
        if (blob.size <= LIMIT) break;
      }
    }
    // Si aún no cabe, reducimos escala progresivamente (manteniéndolo legible).
    let f = 0.85;
    while (blob.size > LIMIT && f >= 0.3) {
      blob = await toBlob(scaleCanvas(base, f), "image/jpeg", 0.7);
      ext = "jpg";
      f -= 0.15;
    }
    return { blob, ext };
  }

  async function exportImage() {
    setBusy(true);
    try {
      const { blob, ext } = await buildImageBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `hoja-anestesica-${cs.ia}.${ext}`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      onToast(`Imagen ${ext.toUpperCase()} · ${Math.round(blob.size / 1024)} KB`);
    } finally {
      setBusy(false);
    }
  }

  // Firma la hoja y, acto seguido, envía el PDF por correo (sustituye al envío de imagen).
  function signAndSend() {
    // Aviso: perfusiones sin registrar su parada. Se ofrece registrarla antes de firmar.
    const open = cs.infusions.filter((i) => i.active);
    if (open.length > 0) {
      const salida = cs.milestones.find((m) => /salida/i.test(m.label));
      const stopIso = cs.endedAt ?? salida?.at ?? new Date().toISOString();
      const names = open.map((i) => i.drug).join(", ");
      const ok = window.confirm(
        `Hay ${open.length} perfusión(es) sin parar: ${names}.\n\n¿Registrar su parada a las ${hhmm(stopIso)} antes de firmar?\n\nAceptar: registra la parada y firma. Cancelar: firma sin pararlas (en la gráfica terminarán al fin de anestesia).`,
      );
      if (ok) {
        for (const inf of open) {
          const base = { id: inf.id, drug: inf.drug, rateMlH: 0, weightBasedDose: 0, summary: "Fin" };
          const payload = inf.gas
            ? { ...base, gas: true, gasPercent: 0, doseUnit: "% esp" }
            : inf.tci
              ? { ...base, tci: inf.tci, doseUnit: inf.doseUnit }
              : { ...base, doseUnit: inf.doseUnit || "ml/h" };
          append(cs.caseId, "INFUSION_RATE_CHANGED", payload, stopIso);
        }
      }
    }
    const prior = getCaseEvents(cs.caseId).filter((e) => e.type === "CASE_SIGNED").length;
    const who = useStore.getState().user?.displayName ?? "";
    append(cs.caseId, "CASE_SIGNED", { signedBy: who });
    onToast("Hoja firmada por " + who);
    void sendPdfByEmail(prior + 1, new Date().toISOString());
  }

  function retrySend() {
    void sendPdfByEmail(signatureCount, cs.signedAt ?? new Date().toISOString());
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
          <button className="btn lg" onClick={exportImage} disabled={busy}>
            Descargar imagen
          </button>
          <button className="btn lg" onClick={() => window.print()}>
            Imprimir
          </button>
          <button className="btn lg" onClick={sendEmail}>
            Email (texto)
          </button>
        </div>
        <p className="sub" style={{ marginTop: 8 }}>
          Al firmar, el PDF se envía automáticamente al correo configurado (asunto "Hoja anestesica {cs.ia}") para su archivado.
        </p>
        {mailMsg && (
          <div className={`alert ${mailMsg.ok ? "" : "danger"}`} style={{ marginTop: 8 }}>
            {mailMsg.text}
          </div>
        )}
        {cs.signedAt ? (
          <>
            <div className="alert" style={{ marginTop: 12 }}>
              Firmada por {cs.signedBy} el {dmy(cs.signedAt)} a las {hhmm(cs.signedAt)}.
              {signatureCount > 1 ? ` (versión ${signatureCount})` : ""}
            </div>
            {emailPending ? (
              <div className="alert danger" style={{ marginTop: 8 }}>
                <div>
                  <strong>Pendiente de envío por correo.</strong> La firma es válida; el PDF no se ha enviado todavía.
                </div>
                <button className="btn primary block lg" style={{ marginTop: 8 }} onClick={retrySend} disabled={busy}>
                  {busy ? "Enviando..." : "Reintentar envío"}
                </button>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>PDF enviado por correo ✓</div>
            )}
          </>
        ) : canSign ? (
          <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={signAndSend} disabled={busy}>
            {busy ? "Procesando..." : "Firmar y enviar PDF por correo"}
          </button>
        ) : (
          <div className="alert" style={{ marginTop: 12 }}>
            Solo el anestesista responsable puede firmar esta hoja.
          </div>
        )}
      </div>

      {/* Hoja A4 */}
      <div className="sheet" ref={sheetRef}>
        <div className="sheet-head2">
          <span className="sheet-title2">Hoja Anestésica</span>
          <span className="sheet-ia2">{cs.ia}</span>
          <span className="sheet-hdr">
            <b>Inicio</b> {hhmm(cs.createdAt)}
          </span>
          <span className="sheet-hdr">
            <b>Fin</b> {cs.endedAt ? hhmm(cs.endedAt) : "-"}
          </span>
          <span className="sheet-hdr">
            <b>Alergias:</b> {cs.preop.allergies || "-"}
          </span>
          <span className="sheet-hdr">
            <b>Antibiótico:</b> {antibioticLine}
          </span>
          {cs.preop.breastfeeding === true && (
            <span className="sheet-hdr">
              <b>Lactancia:</b> Sí
            </span>
          )}
          <span className="sheet-date2">{dmy(cs.createdAt)}</span>
        </div>

        {/* Bloque compacto en dos columnas */}
        <div className="sheet-cols">
          <div>
            <h2>Valoración preanestésica</h2>
            <table className="sheet-preop">
              <tbody>
                <tr>
                  <td className="muted" style={{ width: 96 }}>Antecedentes</td>
                  <td>{cs.preop.history || "-"}</td>
                </tr>
                <tr>
                  <td className="muted">Medicación</td>
                  <td>{cs.preop.medication || "-"}</td>
                </tr>
              </tbody>
            </table>
            <h2 className="sheet-h2-mini">Checklist de seguridad</h2>
            <div className="sheet-mini" style={{ fontWeight: 700, color: "#0e7c7b" }}>{safetyOk ? "✓ OK" : "—"}</div>
            {whoAnyChecked && (
              <>
                <h2 className="sheet-h2-mini">Checklist de la OMS</h2>
                <div className="sheet-mini">
                  {whoDone.map((p) => `${p.phase.split(" ·")[0]}: ${p.done}/${p.total}`).join(" · ")}
                </div>
              </>
            )}
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
                        <strong style={{ fontSize: 14 }}>{t.label}</strong>
                        <div style={{ fontSize: 12.5, color: "#222" }}>{techniqueDetailLines(t).join(" | ")}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Gráfica anestésica integrada (vista en pantalla; en el PDF va la versión vectorial) */}
        <div ref={chartBlockRef}>
          <h2>Gráfica anestésica</h2>
          <AnesthesiaChart cs={cs} light />
        </div>

        {/* Balance (solo si hay datos) */}
        {cs.balances.length > 0 && (
          <>
            <h2>Balance</h2>
            <div className="muted" style={{ fontSize: 12 }}>
              Sangrado total: <strong>{totalBleeding} ml</strong> · Diuresis total: <strong>{totalDiuresis} ml</strong>
              {totalInsensible > 0 && (
                <>
                  {" "}· Pérdidas insensibles: <strong>{totalInsensible} ml</strong>
                </>
              )}
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
                      <td>
                        {b.product}
                        {b.dose ? <div className="muted" style={{ fontSize: 10 }}>{b.dose}</div> : null}
                      </td>
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

        {/* Cronología de constantes: fuente pequeña y dos columnas para aprovechar el A4 horizontal */}
        {cs.vitals.length > 0 &&
          paramsForTable.length > 0 &&
          (() => {
            const rows = cs.vitals.slice().sort((a, b) => a.at.localeCompare(b.at));
            const renderTbl = (rs: typeof rows) => (
              <table className="const-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    {paramsForTable.map((p) => (
                      <th key={p.code}>{p.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rs.map((v) => (
                    <tr key={v.id}>
                      <td>{hhmm(v.at)}</td>
                      {paramsForTable.map((p) => (
                        <td key={p.code}>{v.values[p.code] ?? "-"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
            const twoCols = rows.length > 8;
            const mid = Math.ceil(rows.length / 2);
            return (
              <>
                <h2>Cronología de constantes</h2>
                {twoCols ? (
                  <div className="sheet-cols const-cols">
                    {renderTbl(rows.slice(0, mid))}
                    {renderTbl(rows.slice(mid))}
                  </div>
                ) : (
                  renderTbl(rows)
                )}
              </>
            );
          })()}

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

        <div className="foot">
          <span>Documento pseudonimizado (RGPD). Identificado únicamente por IA.</span>
          <span>{cs.signedAt ? `Firmado: ${cs.signedBy} · ${dmy(cs.signedAt)} ${hhmm(cs.signedAt)}` : "Sin firmar"}</span>
        </div>
      </div>

      {/* Imagen simplificada (fuera de pantalla) para adjuntar en el informe de SAP:
          solo gráfica, técnicas y cronología de constantes, con letra y símbolos grandes. */}
      <div aria-hidden="true" style={{ position: "fixed", left: "-10000px", top: 0 }}>
        <div className="sheet-img" ref={imageSheetRef}>
          <div className="img-code">
            {cs.ia} · {dmy(cs.createdAt)}
          </div>

          <h2>Técnicas anestésicas</h2>
          {cs.techniques.length === 0 ? (
            <div className="tech-detail">Sin registrar</div>
          ) : (
            <table>
              <tbody>
                {cs.techniques.map((t) => (
                  <tr key={t.id}>
                    <td style={{ width: 66, whiteSpace: "nowrap" }}>{hhmm(t.at)}</td>
                    <td>
                      <div className="tech-label">{t.label}</div>
                      <div className="tech-detail">{techniqueDetailLines(t).join(" | ")}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Gráfica anestésica</h2>
          <AnesthesiaChart cs={cs} light big hideLegend />

          {cs.vitals.length > 0 && paramsForTable.length > 0 && (
            <>
              <h2>Cronología de constantes</h2>
              <table className="const-img">
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
        </div>
      </div>
    </div>
  );
}

// ---- Fotos del monitor en el PDF (Vía 1) ----
function loadImgEl(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("img"));
    i.src = src;
  });
}
async function fetchPhotoDataUrl(caseId: string, photoId: string): Promise<string | null> {
  const r = await fetch(api.photoUrl(caseId, photoId), { credentials: "same-origin" });
  if (!r.ok) return null;
  const b = await r.blob();
  return await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("read"));
    fr.readAsDataURL(b);
  });
}
async function loadVia1Photos(caseId: string): Promise<ChartPhoto[]> {
  let metas: { id: string; taken_at: string }[] = [];
  try {
    metas = (await api.listPhotos(caseId)).photos;
  } catch {
    return [];
  }
  const sorted = metas.slice().sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const out: ChartPhoto[] = [];
  for (const ph of sorted) {
    try {
      const dataUrl = await fetchPhotoDataUrl(caseId, ph.id);
      if (!dataUrl) continue;
      const img = await loadImgEl(dataUrl);
      out.push({ at: new Date(ph.taken_at).getTime(), dataUrl, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    } catch {
      /* se omite la foto que no se pueda cargar */
    }
  }
  return out;
}

// Numeración ÚNICA y consecutiva "Página X de Y" en TODAS las páginas (gráfica + datos),
// abajo a la derecha, con fondo blanco para que siempre se lea.
function stampPageNumbers(pdf: jsPDF): void {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const label = `Página ${i} de ${total}`;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const tw = pdf.getTextWidth(label);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(pw - 6 - tw - 1.5, ph - 5.4, tw + 3, 4.4, "F");
    pdf.setTextColor(90, 90, 90);
    pdf.text(label, pw - 6, ph - 2.4, { align: "right" });
  }
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
