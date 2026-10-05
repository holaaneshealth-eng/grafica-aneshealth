import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { useStore } from "../store/store";
import { api, ApiError } from "../api";
import type { CaseState } from "../domain/events";
import { formatNum } from "../domain/calculations";
import { buildReview, buildVitalsToWrite, type ReviewItem, type VisionReading } from "../domain/visionImport";
import { preprocessDataUrl } from "../vision/preprocess";
import { parseTrendTable } from "../vision/trendTableParser";
import { tesseractEngine } from "../vision/tesseractEngine";
import { paddleEngine } from "../vision/paddleEngine";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (m: string) => void;
}

type Phase = "capture" | "processing" | "review";
type EngineId = "tesseract" | "paddle" | "claude";
const ENGINE_KEY = "ah_ocr_engine";

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("No se pudo leer la foto"));
    fr.onload = () => res(String(fr.result));
    fr.readAsDataURL(file);
  });
}

function rid(): string {
  return "vf-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Extrae SIEMPRE algo útil del error, aunque no sea un Error (los workers de OCR a veces
// rechazan con un string, un evento o un objeto). Así nunca ocultamos la causa real.
function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.code === "VISION_NOT_CONFIGURED" ? "El motor de nube (Claude) no está configurado en el servidor." : err.message;
  }
  if (err instanceof Error) return err.message || err.name || "Error desconocido";
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const o = err as any;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    if (o.type) return `evento "${o.type}" (posible fallo del lector en el navegador)`;
    try {
      const s = JSON.stringify(o);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  return String(err);
}

export function VisionImportModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [phase, setPhase] = useState<Phase>("capture");
  const [readings, setReadings] = useState<VisionReading[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [shiftMin, setShiftMin] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dateWarn, setDateWarn] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<Record<string, boolean>>({});
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [engine, setEngine] = useState<EngineId>(() => (localStorage.getItem(ENGINE_KEY) as EngineId) || "tesseract");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    api
      .visionStatus()
      .then((s) => {
        setClaudeAvailable(s.claudeAvailable);
        if (!s.claudeAvailable && engine === "claude") pickEngine("tesseract");
      })
      .catch(() => setClaudeAvailable(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickEngine(id: EngineId) {
    setEngine(id);
    localStorage.setItem(ENGINE_KEY, id);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNote(null);
    setProgress(0);
    setPhase("processing");
    try {
      const dataUrl = await readAsDataURL(file);
      let got: VisionReading[] = [];
      let detectedDate: string | null = null;
      if (engine === "claude") {
        const r = await api.visionImport({ imageBase64: dataUrl, mimeType: file.type || "image/jpeg" });
        got = r.readings;
        detectedDate = r.fecha ?? null;
      } else {
        const canvas = await preprocessDataUrl(dataUrl);
        const eng = engine === "paddle" ? paddleEngine : tesseractEngine;
        const result = await eng.recognize(canvas, (p) => setProgress(p));
        const parsed = parseTrendTable(result.words);
        got = parsed.readings;
        detectedDate = parsed.detectedDate ?? null;
        if (parsed.columns < 2) setNote("No se ha reconocido la rejilla de horas. Asegúrate de fotografiar la vista de tendencias tabulares, de frente y sin reflejos.");
      }
      // Aviso si la fecha de la cabecera del monitor no coincide con la del caso
      // (las columnas se fechan con la del caso).
      const caseDate = new Date(cs.createdAt).toLocaleDateString("sv-SE"); // YYYY-MM-DD local
      setDateWarn(detectedDate && detectedDate !== caseDate ? `La fecha del monitor (${detectedDate}) no coincide con la del caso (${caseDate}). Las columnas se fechan con la del caso; revisa las horas.` : null);
      setReadings(got);
      setItems(buildReview(got, cs, 0));
      setShiftMin(0);
      setCustomFor({});
      setPhase("review");
      if (got.length === 0 && !note) setNote("No se ha leído ningún valor con seguridad. Prueba con una foto más nítida o con el motor de nube (Claude) si está disponible.");
    } catch (err) {
      const engLabel = engine === "claude" ? "Claude (nube)" : engine === "paddle" ? "PaddleOCR" : "Tesseract";
      // eslint-disable-next-line no-console
      console.error("[vision import] fallo con", engLabel, err);
      setError(`No se pudo procesar la foto con ${engLabel}. Detalle: ${describeError(err)}`);
      setPhase("capture");
    }
  }

  function applyShift(delta: number) {
    const s = shiftMin + delta;
    setShiftMin(s);
    setItems(buildReview(readings, cs, s));
    setCustomFor({});
  }
  function setValue(id: string, raw: string) {
    const v = parseFloat(raw.replace(",", "."));
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, value: isFinite(v) ? v : it.value } : it)));
  }
  function toggleAccept(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, accept: !it.accept } : it)));
  }

  function confirm() {
    let count = 0;
    for (const w of buildVitalsToWrite(items)) {
      append(cs.caseId, "VITALS_RECORDED", { id: rid(), at: w.at, source: "foto", values: w.values }, w.at);
      count += Object.keys(w.values).length;
    }
    for (const it of items) {
      if (it.known || !customFor[it.id]) continue;
      const code = "C_" + (it.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "X");
      append(cs.caseId, "MONITORING_CUSTOM_ADDED", { code, label: it.label, unit: it.unit ?? "-", chart: true });
      const at = new Date(it.bucketMs).toISOString();
      append(cs.caseId, "VITALS_RECORDED", { id: rid(), at, source: "foto", values: { [code]: it.value } }, at);
      count++;
    }
    onDone(count > 0 ? `Importados ${count} valores desde la foto` : "No se importó ningún valor");
    onClose();
  }

  const known = items.filter((it) => it.known);
  const unknown = items.filter((it) => !it.known);
  const willWrite = buildVitalsToWrite(items).reduce((s, w) => s + Object.keys(w.values).length, 0);

  const engines: { id: EngineId; label: string; hint: string }[] = [
    { id: "tesseract", label: "Tesseract", hint: "gratuito · en el móvil" },
    { id: "paddle", label: "PaddleOCR", hint: "gratuito · en el móvil" },
    ...(claudeAvailable ? [{ id: "claude" as EngineId, label: "Claude (nube)", hint: "de pago · más preciso" }] : []),
  ];

  return (
    <Modal title="Importar constantes desde foto" onClose={onClose}>
      {phase === "capture" && (
        <>
          <div className="field">
            <label>Motor de lectura</label>
            <div className="seg">
              {engines.map((e) => (
                <button key={e.id} className={engine === e.id ? "on" : ""} onClick={() => pickEngine(e.id)}>
                  {e.label}
                </button>
              ))}
            </div>
            <p className="sub">
              {engine === "claude"
                ? "La foto se envía al servidor y a Claude (no se guarda)."
                : "La foto NO sale del móvil: se lee en el propio navegador."}
            </p>
          </div>
          <p className="sub">
            Fotografía la pantalla de <strong>tendencias tabulares</strong> (columnas cada 5 min), de frente y sin reflejos. Revisarás los valores antes de volcarlos.
          </p>
          {error && <div className="alert danger">{error}</div>}
          <label className="btn primary block lg" style={{ textAlign: "center", cursor: "pointer" }}>
            Abrir cámara / elegir foto
            <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
          </label>
          <p className="sub" style={{ marginTop: 8 }}>El registro manual sigue funcionando igual; esto es solo una vía más de entrada.</p>
        </>
      )}

      {phase === "processing" && (
        <div className="alert">
          Procesando la foto{engine !== "claude" ? ` (${Math.round(progress * 100)}%)` : "… si el servicio estaba inactivo, la primera vez puede tardar unos segundos"}…
          {engine !== "claude" && <div className="sub" style={{ marginTop: 6 }}>La primera vez se descarga el motor de lectura; puede tardar un poco.</div>}
        </div>
      )}

      {phase === "review" && (
        <>
          {dateWarn && <div className="alert danger">{dateWarn}</div>}
          {note && <div className="alert">{note}</div>}
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Ajuste de hora (si el reloj del monitor no coincide)</label>
              <div className="chips">
                <button className="chip" onClick={() => applyShift(-5)}>−5 min</button>
                <button className="chip" onClick={() => applyShift(-1)}>−1 min</button>
                <span className="chip on">{shiftMin >= 0 ? `+${shiftMin}` : shiftMin} min</span>
                <button className="chip" onClick={() => applyShift(1)}>+1 min</button>
                <button className="chip" onClick={() => applyShift(5)}>+5 min</button>
              </div>
            </div>
          </div>

          {known.length > 0 ? (
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Vol.</th>
                  <th>Hora</th>
                  <th>Constante</th>
                  <th>Valor</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {known.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <input type="checkbox" checked={it.accept} disabled={it.duplicatePhoto} onChange={() => toggleAccept(it.id)} />
                    </td>
                    <td>{it.timeLabel}</td>
                    <td>
                      {it.label}
                      {it.unit ? ` (${it.unit})` : ""}
                    </td>
                    <td style={{ width: 72 }}>
                      <input type="text" inputMode="decimal" value={String(it.value)} onChange={(e) => setValue(it.id, e.target.value)} style={{ width: 64 }} />
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {it.duplicatePhoto ? (
                        <span className="muted">Ya importado</span>
                      ) : it.conflict ? (
                        <span style={{ color: "#b45309" }}>Manual: {formatNum(it.manualValue!)} · marca para sustituir</span>
                      ) : (
                        <span style={{ color: "#0e7c7b" }}>Nuevo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">Sin valores reconocidos.</div>
          )}

          {unknown.length > 0 && (
            <>
              <div className="section-title" style={{ margin: "14px 0 6px" }}>No reconocidos (se descartan salvo que los añadas como personalizados)</div>
              <table>
                <tbody>
                  {unknown.map((it) => (
                    <tr key={it.id}>
                      <td style={{ width: 28 }}>
                        <input type="checkbox" checked={!!customFor[it.id]} onChange={() => setCustomFor((m) => ({ ...m, [it.id]: !m[it.id] }))} />
                      </td>
                      <td>{it.timeLabel}</td>
                      <td>{it.label}</td>
                      <td>
                        {formatNum(it.value)} {it.unit ?? ""}
                      </td>
                      <td style={{ fontSize: 12 }} className="muted">añadir como personalizada</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="alert" style={{ marginTop: 10 }}>
            Se volcarán <strong>{willWrite}</strong> valores. Los parámetros fijados (VT, FR, PEEP, FiO₂) solo se registran cuando cambian. En conflicto con un valor manual, por defecto se conserva el manual.
          </div>
          <div className="grid2">
            <button className="btn lg" onClick={() => setPhase("capture")}>Otra foto</button>
            <button className="btn primary lg" onClick={confirm}>Confirmar e importar</button>
          </div>
        </>
      )}
    </Modal>
  );
}
