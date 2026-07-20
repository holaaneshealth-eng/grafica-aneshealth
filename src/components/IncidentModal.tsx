import { useState } from "react";
import { Modal } from "./Modal";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const QUICK = [
  "Hipotension",
  "Bradicardia",
  "Desaturacion",
  "Broncoespasmo",
  "Laringoespasmo",
  "Sangrado significativo",
  "Reaccion alergica",
  "Extubacion accidental",
];

export function IncidentModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"leve" | "moderada" | "grave">("moderada");

  function save() {
    if (!text.trim()) return;
    append(cs.caseId, "INCIDENT", { id: "i-" + Date.now(), at: new Date().toISOString(), text: text.trim(), severity });
    onDone("Incidencia registrada");
    onClose();
  }

  return (
    <Modal title="Registrar incidencia" onClose={onClose}>
      <div className="field">
        <label>Frecuentes</label>
        <div className="chips">
          {QUICK.map((q) => (
            <button key={q} className="chip" onClick={() => setText((t) => (t ? t + ". " + q : q))}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Descripcion</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe la incidencia..." autoFocus />
      </div>
      <div className="field">
        <label>Gravedad</label>
        <div className="seg">
          {(["leve", "moderada", "grave"] as const).map((s) => (
            <button key={s} className={severity === s ? "on" : ""} onClick={() => setSeverity(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="alert">Se registra con su hora (timestamp) exacta.</div>
      <button className="btn primary block lg" onClick={save} disabled={!text.trim()}>
        Guardar incidencia
      </button>
    </Modal>
  );
}
