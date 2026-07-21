import { useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { nowLocalInput, isoFromLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const QUICK = [
  "Hipotensión",
  "Bradicardia",
  "Desaturación",
  "Broncoespasmo",
  "Laringoespasmo",
  "Sangrado significativo",
  "Reacción alérgica",
  "Extubación accidental",
];

export function IncidentModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"leve" | "moderada" | "grave">("moderada");
  const [time, setTime] = useState(nowLocalInput());

  function save() {
    if (!text.trim()) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, "INCIDENT", { id: "i-" + Date.now(), at, text: text.trim(), severity }, at);
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
        <label>Descripción</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe la incidencia..." autoFocus />
      </div>
      <TimeField value={time} onChange={setTime} label="Hora de la incidencia" />
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
      <button className="btn primary block lg" onClick={save} disabled={!text.trim()}>
        Guardar incidencia
      </button>
    </Modal>
  );
}
