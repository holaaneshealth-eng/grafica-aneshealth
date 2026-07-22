import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { STANDARD_PARAMS, findParam } from "../domain/monitoring";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { nowLocalInput, isoFromLocalInput, isoToLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
  initialTime?: string; // ISO, cuando se abre tocando la gráfica
}

export function VitalsModal({ cs, onClose, onDone, initialTime }: Props) {
  const append = useStore((s) => s.append);

  const params = useMemo(() => {
    const custom = cs.monitoring.custom.filter((c) => !STANDARD_PARAMS.some((s) => s.code === c.code));
    return [...STANDARD_PARAMS, ...custom];
  }, [cs.monitoring]);

  // Arrastre de valores: precarga el último registro para editar solo lo que cambia.
  const lastVitals = useMemo(() => cs.vitals.slice().sort((a, b) => b.at.localeCompare(a.at))[0], [cs.vitals]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (lastVitals) for (const [k, v] of Object.entries(lastVitals.values)) init[k] = String(v);
    return init;
  });
  const [time, setTime] = useState(initialTime ? isoToLocalInput(initialTime) : nowLocalInput());

  function bump(code: string, delta: number) {
    setValues((v) => {
      const cur = parseFloat((v[code] ?? "").replace(",", "."));
      const base = isFinite(cur) ? cur : 0;
      const nv = Math.round((base + delta) * 10) / 10;
      return { ...v, [code]: String(nv) };
    });
  }

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
      {lastVitals && <div className="alert">Precargado con el último registro. Ajusta solo lo que cambie.</div>}
      <div className="vital-grid">
        {params.map((p) => {
          const def = findParam(p.code, cs.monitoring.custom);
          const raw = values[p.code];
          const num = raw ? parseFloat(raw.replace(",", ".")) : NaN;
          const out =
            def && isFinite(num) && ((def.min !== undefined && num < def.min) || (def.max !== undefined && num > def.max));
          const step = p.code === "TEMP" ? 0.1 : 1;
          return (
            <div className="vital-row" key={p.code} style={out ? { borderColor: "var(--warn)" } : undefined}>
              <span className="vname">{p.label}</span>
              <span className="vunit">{p.unit}</span>
              <button className="stepper" onClick={() => bump(p.code, -step)} aria-label="menos">
                −
              </button>
              <input
                inputMode="decimal"
                type="text"
                value={raw ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [p.code]: e.target.value }))}
              />
              <button className="stepper" onClick={() => bump(p.code, step)} aria-label="más">
                +
              </button>
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
