import { useState } from "react";
import { useStore } from "../store/store";
import type { CaseState, ProtectionInfo } from "../domain/events";
import { POSITIONS, PROTECTION_MEASURES, positionById } from "../domain/positions";
import { hhmm, nowLocalInput, isoFromLocalInput, isoToLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onToast?: (m: string) => void;
}

export function PositionProtectionSection({ cs, onToast }: Props) {
  const append = useStore((s) => s.append);
  const [posId, setPosId] = useState("");
  const [posOther, setPosOther] = useState("");
  const [posTime, setPosTime] = useState(nowLocalInput());

  function addPosition() {
    if (!posId) return;
    const def = positionById(posId);
    const label = posId === "otra" ? posOther.trim() || "Otra" : def?.label ?? posId;
    const at = isoFromLocalInput(posTime);
    append(
      cs.caseId,
      "POSITION_SET",
      { id: "pos-" + Date.now(), at, position: posId, label, ...(posId === "otra" && posOther.trim() ? { note: posOther.trim() } : {}) },
      at,
    );
    setPosId("");
    setPosOther("");
    setPosTime(nowLocalInput());
    onToast?.("Posición registrada");
  }
  function changePosTime(id: string, val: string) {
    // Reescribe el registro: se elimina y se vuelve a crear con la nueva hora.
    const rec = cs.positions.find((p) => p.id === id);
    if (!rec) return;
    const at = isoFromLocalInput(val);
    append(cs.caseId, "POSITION_REMOVED", { id });
    append(cs.caseId, "POSITION_SET", { id: "pos-" + Date.now(), at, position: rec.position, label: rec.label, ...(rec.note ? { note: rec.note } : {}) }, at);
  }
  function removePosition(id: string) {
    append(cs.caseId, "POSITION_REMOVED", { id });
    onToast?.("Posición eliminada");
  }

  const prot: ProtectionInfo = cs.protection ?? {};
  function toggleProtection(key: keyof ProtectionInfo) {
    const next: ProtectionInfo = { ...prot, [key]: !prot[key] };
    append(cs.caseId, "PROTECTION_SET", next as unknown as Record<string, unknown>);
  }
  function setOtherMeasures(text: string) {
    const next: ProtectionInfo = { ...prot, other: text };
    append(cs.caseId, "PROTECTION_SET", next as unknown as Record<string, unknown>);
  }

  return (
    <div className="card">
      <h2>Posición y medidas de protección</h2>
      <p className="sub">La posición puede cambiar durante la cirugía: cada cambio es un registro nuevo con su hora. Las medidas de protección se registran una vez y se pueden modificar.</p>

      <div className="section-title" style={{ margin: "4px 0 6px" }}>Posición</div>
      <div className="chips">
        {POSITIONS.map((p) => (
          <button key={p.id} className={`chip ${posId === p.id ? "on" : ""}`} onClick={() => setPosId(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {posId === "otra" && (
        <div className="field" style={{ marginTop: 8 }}>
          <label>Describe la posición</label>
          <input type="text" value={posOther} onChange={(e) => setPosOther(e.target.value)} placeholder="Ej. Navaja / Kraske" />
        </div>
      )}
      {posId && (
        <div className="field" style={{ marginTop: 8 }}>
          <label>Hora del cambio (por defecto la actual, modificable)</label>
          <input type="datetime-local" value={posTime} onChange={(e) => setPosTime(e.target.value)} />
        </div>
      )}
      {posId && (
        <button className="btn primary block" onClick={addPosition} disabled={posId === "otra" && !posOther.trim()}>
          Registrar posición
        </button>
      )}

      {cs.positions.length > 0 && (
        <>
          <div className="section-title" style={{ margin: "14px 0 6px" }}>Posiciones registradas (edita la hora o elimina)</div>
          <div className="pill-list">
            {cs.positions
              .slice()
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((p) => (
                <div className="pill" key={p.id}>
                  <span className="t">{hhmm(p.at)}</span>
                  <span className="m">
                    <strong>{p.label}</strong> <small className="muted">{positionById(p.position)?.abbr ?? "OTR"}</small>
                  </span>
                  <input type="datetime-local" className="ms-time" value={isoToLocalInput(p.at)} onChange={(e) => changePosTime(p.id, e.target.value)} />
                  <button className="btn ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => removePosition(p.id)} title="Eliminar posición">
                    ✕
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      <div className="section-title" style={{ margin: "16px 0 6px" }}>Medidas de protección</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PROTECTION_MEASURES.map((m) => (
          <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={!!prot[m.key as keyof ProtectionInfo]} onChange={() => toggleProtection(m.key as keyof ProtectionInfo)} />
            {m.label}
          </label>
        ))}
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Otras medidas</label>
        <input type="text" value={prot.other ?? ""} onChange={(e) => setOtherMeasures(e.target.value)} placeholder="Texto libre" />
      </div>
    </div>
  );
}
