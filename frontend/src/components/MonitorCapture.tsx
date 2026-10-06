import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/store";
import { api } from "../api";
import type { CaseState } from "../domain/events";
import { hhmm } from "../utils/time";
import { compressMonitorPhoto, formatBytes, VIA1_PHOTO_MODE } from "../vision/compress";
import { VitalsModal } from "./VitalsModal";
import { VisionImportModal } from "./VisionImportModal";
import { PhotoCropModal } from "./PhotoCropModal";

interface Props {
  cs: CaseState;
  onToast?: (m: string) => void;
}

interface PhotoMeta {
  id: string;
  taken_at: string;
  mime: string;
  byte_size: number;
}

export function MonitorCapture({ cs, onToast }: Props) {
  const append = useStore((s) => s.append);
  const canWrite = useStore((s) => s.canWrite(cs.caseId));
  const [claudeAvailable, setClaudeAvailable] = useState(false);
  const [photosEnabled, setPhotosEnabled] = useState(true); // optimista hasta conocer el estado
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [vision, setVision] = useState<{ initial?: { dataUrl: string; mime: string }[] } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const via = cs.monitorVia;

  async function refreshPhotos() {
    try {
      const r = await api.listPhotos(cs.caseId);
      setPhotos(r.photos);
    } catch {
      /* sin conexión: se mantiene lo que haya */
    }
  }

  useEffect(() => {
    api
      .visionStatus()
      .then((s) => {
        setClaudeAvailable(s.claudeAvailable);
        setPhotosEnabled(s.photosEnabled);
      })
      .catch(() => {
        setClaudeAvailable(false);
        setPhotosEnabled(false);
      });
    void refreshPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cs.caseId]);

  function chooseVia(v: 1 | 2) {
    append(cs.caseId, "MONITOR_MODE_SET", { via: v });
    onToast?.(v === 1 ? "Vía 1: foto sin análisis" : "Vía 2: análisis con Claude");
    if (v === 2 && photos.length > 0) {
      if (window.confirm(`Hay ${photos.length} foto(s) ya guardada(s). ¿Analizarlas ahora con Claude?`)) void analyzeSaved();
    }
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setCropFile(file); // primero el recorte manual (o "usar foto entera")
  }

  async function onCropped(blob: Blob) {
    setCropFile(null);
    setBusy(true);
    try {
      const c = await compressMonitorPhoto(blob, { mode: VIA1_PHOTO_MODE });
      const r = await api.addPhoto(cs.caseId, { imageBase64: c.dataUrl, mimeType: "image/jpeg", takenAt: new Date().toISOString() });
      await refreshPhotos();
      onToast?.(`Foto guardada · ${formatBytes(r.photo.byte_size)}`);
    } catch (err) {
      onToast?.(`No se pudo guardar la foto: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(id: string) {
    if (!window.confirm("¿Eliminar esta foto del monitor?")) return;
    try {
      await api.deletePhoto(cs.caseId, id);
      await refreshPhotos();
      onToast?.("Foto eliminada");
    } catch {
      onToast?.("No se pudo eliminar la foto");
    }
  }

  async function analyzeSaved() {
    setBusy(true);
    try {
      const imgs: { dataUrl: string; mime: string }[] = [];
      for (const p of photos) {
        const res = await fetch(api.photoUrl(cs.caseId, p.id), { credentials: "same-origin" });
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error("read"));
          fr.readAsDataURL(blob);
        });
        imgs.push({ dataUrl, mime: p.mime });
      }
      setVision({ initial: imgs });
    } catch {
      onToast?.("No se pudieron leer las fotos guardadas");
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = photos.reduce((s, p) => s + p.byte_size, 0);

  return (
    <div className="card no-print" style={{ paddingTop: 10, paddingBottom: 10 }}>
      <h2 style={{ fontSize: 16 }}>Registro del monitor</h2>

      {via == null ? (
        <>
          <p className="sub" style={{ margin: "4px 0 8px" }}>Elige cómo registrarás el monitor en este caso (puedes cambiar de Vía 1 a Vía 2 más tarde):</p>
          <div className="grid2">
            <button className="btn primary lg" disabled={!canWrite || !photosEnabled} onClick={() => chooseVia(1)}>
              Vía 1 · Foto sin análisis
            </button>
            <button className="btn lg" disabled={!canWrite || !claudeAvailable} onClick={() => chooseVia(2)}>
              Vía 2 · Análisis con Claude
            </button>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>
            Vía 1: la foto se guarda y va al PDF (cirugías cortas). Vía 2: se analiza y rellena la gráfica (cirugías largas).
            {!claudeAvailable && " La Vía 2 requiere la clave del servidor (ANTHROPIC_API_KEY)."}
            {!photosEnabled && " La Vía 1 no está disponible ahora mismo en el servidor; usa el registro manual."}
          </p>
          <button className="btn block" style={{ marginTop: 8 }} disabled={!canWrite} onClick={() => setManual(true)}>
            ✍️ Registro manual del monitor
          </button>
        </>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 8 }}>
            <span className="chip on">{via === 1 ? "Vía 1 · foto sin análisis" : "Vía 2 · análisis con Claude"}</span>
            {via === 1 && claudeAvailable && (
              <button className="chip" disabled={busy} onClick={() => chooseVia(2)}>Cambiar a Vía 2 (análisis)</button>
            )}
          </div>

          {via === 1 ? (
            <>
              {photosEnabled ? (
                <>
                  <label className="btn primary block lg" style={{ textAlign: "center", cursor: canWrite ? "pointer" : "not-allowed", opacity: canWrite ? 1 : 0.6 }}>
                    {busy ? "Procesando…" : "📷 Añadir foto del monitor"}
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPickPhoto} disabled={!canWrite || busy} style={{ display: "none" }} />
                  </label>
                  <p className="sub" style={{ marginTop: 6 }}>La foto se comprime en el móvil (≈1600 px) y se guarda con su hora. No se analiza; irá al PDF.</p>
                </>
              ) : (
                <div className="alert danger">La Vía 1 (fotos) no está disponible ahora mismo en el servidor. Usa el registro manual del monitor.</div>
              )}
            </>
          ) : (
            <>
              <button className="btn primary block lg" disabled={!canWrite} onClick={() => setVision({})}>📷 Analizar foto del monitor (nube)</button>
              <p className="sub" style={{ marginTop: 6 }}>Se lee con Claude y revisas los valores antes de volcarlos a la gráfica.</p>
            </>
          )}

          <button className="btn block" style={{ marginTop: 8 }} disabled={!canWrite} onClick={() => setManual(true)}>
            ✍️ Registro manual del monitor
          </button>

          {photos.length > 0 && (
            <>
              <div className="section-title" style={{ margin: "12px 0 6px" }}>
                Fotos guardadas ({photos.length}) · {formatBytes(totalBytes)}
              </div>
              <div className="pill-list">
                {photos.map((p) => (
                  <div className="pill" key={p.id}>
                    <span className="t">{hhmm(p.taken_at)}</span>
                    <span className="m">
                      <div className="sm">{formatBytes(p.byte_size)}</div>
                    </span>
                    {canWrite && (
                      <button className="btn ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => removePhoto(p.id)} title="Eliminar foto">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {cropFile && <PhotoCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={onCropped} />}
      {manual && <VitalsModal cs={cs} group="monitor" onClose={() => setManual(false)} onDone={(m) => onToast?.(m)} />}
      {vision && (
        <VisionImportModal
          cs={cs}
          initialImages={vision.initial}
          onClose={() => setVision(null)}
          onDone={(m) => {
            onToast?.(m);
            setVision(null);
          }}
        />
      )}
    </div>
  );
}
