import { useState } from "react";
import { Modal } from "./Modal";
import { useStore } from "../store/store";
import { api, ApiError } from "../api";
import type { CaseState } from "../domain/events";
import { formatNum } from "../domain/calculations";
import { buildReview, buildVitalsToWrite, type ReviewItem, type VisionReading } from "../domain/visionImport";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (m: string) => void;
}

type Phase = "capture" | "processing" | "review";

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

export function VisionImportModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [phase, setPhase] = useState<Phase>("capture");
  const [readings, setReadings] = useState<VisionReading[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [shiftMin, setShiftMin] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<Record<string, boolean>>({});

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNote(null);
    setPhase("processing");
    try {
      const dataUrl = await readAsDataURL(file);
      const r = await api.visionImport({ imageBase64: dataUrl, mimeType: file.type || "image/jpeg" });
      setReadings(r.readings);
      setItems(buildReview(r.readings, cs, 0));
      setShiftMin(0);
      setCustomFor({});
      setPhase("review");
      if (r.readings.length === 0) setNote("No se ha leído ningún valor con seguridad. Prueba con una foto más nítida, de frente y sin reflejos.");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === "VISION_NOT_CONFIGURED"
            ? "La importación desde foto aún no está configurada en el servidor (falta la clave de Claude)."
            : err.message
          : "No se pudo procesar la foto.";
      setError(msg);
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
    const toWrite = buildVitalsToWrite(items);
    for (const w of toWrite) {
      append(cs.caseId, "VITALS_RECORDED", { id: rid(), at: w.at, source: "foto", values: w.values }, w.at);
      count += Object.keys(w.values).length;
    }
    // No reconocidos marcados para añadir como constante personalizada.
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

  return (
    <Modal title="Importar constantes desde foto" onClose={onClose}>
      {phase === "capture" && (
        <>
          <p className="sub">
            Fotografía la pantalla de <strong>tendencias tabulares</strong> del monitor (columnas cada 5 min), de frente y sin reflejos.
            La foto se procesa y <strong>no se guarda</strong>. Revisarás los valores antes de volcarlos.
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
          Procesando la foto… Si el servicio estaba inactivo, la primera vez puede tardar unos segundos.
        </div>
      )}

      {phase === "review" && (
        <>
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
                      <input
                        type="checkbox"
                        checked={it.accept}
                        disabled={it.duplicatePhoto}
                        onChange={() => toggleAccept(it.id)}
                      />
                    </td>
                    <td>{it.timeLabel}</td>
                    <td>{it.label}{it.unit ? ` (${it.unit})` : ""}</td>
                    <td style={{ width: 72 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(it.value)}
                        onChange={(e) => setValue(it.id, e.target.value)}
                        style={{ width: 64 }}
                      />
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
                      <td>{formatNum(it.value)} {it.unit ?? ""}</td>
                      <td style={{ fontSize: 12 }} className="muted">añadir como personalizada</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="alert" style={{ marginTop: 10 }}>
            Se volcarán <strong>{willWrite}</strong> valores. Los parámetros fijados (VT, FR, PEEP, FiO₂) solo se registran cuando cambian.
            En conflicto con un valor manual, por defecto se conserva el manual.
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
