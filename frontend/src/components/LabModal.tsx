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

// Campos analíticos intraoperatorios frecuentes (gasometría + hemograma básico).
const LAB_FIELDS: { code: string; label: string; unit: string }[] = [
  { code: "pH", label: "pH", unit: "" },
  { code: "pCO2", label: "pCO₂", unit: "mmHg" },
  { code: "pO2", label: "pO₂", unit: "mmHg" },
  { code: "HCO3", label: "HCO₃", unit: "mmol/L" },
  { code: "EB", label: "Exceso de bases", unit: "mmol/L" },
  { code: "Lactato", label: "Lactato", unit: "mmol/L" },
  { code: "Hb", label: "Hb", unit: "g/dL" },
  { code: "Hto", label: "Hto", unit: "%" },
  { code: "Na", label: "Na", unit: "mmol/L" },
  { code: "K", label: "K", unit: "mmol/L" },
  { code: "Ca", label: "Ca iónico", unit: "mmol/L" },
  { code: "Glu", label: "Glucosa", unit: "mg/dL" },
];

export function LabModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState(nowLocalInput());

  function save() {
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = parseFloat(v.replace(",", "."));
      if (isFinite(n)) parsed[k] = n;
    }
    if (Object.keys(parsed).length === 0 && !notes.trim()) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, "LAB_RESULT", { id: "lab-" + Date.now(), at, values: parsed, notes: notes.trim() }, at);
    onDone("Analítica registrada");
    onClose();
  }

  return (
    <Modal title="Analítica intraoperatoria" onClose={onClose}>
      <TimeField value={time} onChange={setTime} label="Hora de la analítica" />
      <div className="vital-grid">
        {LAB_FIELDS.map((f) => (
          <div className="vital-row" key={f.code}>
            <span className="vname">{f.label}</span>
            <span className="vunit">{f.unit}</span>
            <input
              inputMode="decimal"
              type="text"
              value={values[f.code] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.code]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="field">
        <label>Observaciones</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Otros resultados o comentarios" />
      </div>
      <button className="btn primary block lg" onClick={save}>
        Guardar analítica
      </button>
    </Modal>
  );
}
