import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { STANDARD_PARAMS, findParam } from "../domain/monitoring";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { nowLocalInput, isoFromLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export function VitalsModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);

  // Se muestran TODOS los parámetros posibles (estándar + adicionales seleccionados),
  // para poder registrar cualquier constante en cualquier momento.
  const params = useMemo(() => {
    const custom = cs.monitoring.custom.filter((c) => !STANDARD_PARAMS.some((s) => s.code === c.code));
    return [...STANDARD_PARAMS, ...custom];
  }, [cs.monitoring]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [time, setTime] = useState(nowLocalInput());

  function save() {
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = parseFloat(v.replace(",", "."));
      if (isFinite(n)) parsed[k] = n;
    }
    if (Object.keys(parsed).length === 0) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, "VITALS_RECORDED", { id: "v-" + Date.now(), at, values: parsed, source: "manual" }, at);
    onDone("Constantes registradas");
    onClose();
  }

  return (
    <Modal title="Registro de constantes" onClose={onClose}>
      <TimeField value={time} onChange={setTime} label="Hora del registro" />
      <div className="vital-grid">
        {params.map((p) => {
          const def = findParam(p.code, cs.monitoring.custom);
          const raw = values[p.code];
          const num = raw ? parseFloat(raw.replace(",", ".")) : NaN;
          const out =
            def && isFinite(num) && ((def.min !== undefined && num < def.min) || (def.max !== undefined && num > def.max));
          return (
            <div className="vital-row" key={p.code} style={out ? { borderColor: "var(--warn)" } : undefined}>
              <span className="vname">{p.label}</span>
              <span className="vunit">{p.unit}</span>
              <input
                inputMode="decimal"
                type="text"
                value={raw ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
              />
            </div>
          );
        })}
      </div>
      <div className="alert">Rellena solo los campos que quieras. La hora es editable.</div>
      <button className="btn primary block lg" onClick={save}>
        Guardar constantes
      </button>
    </Modal>
  );
}
