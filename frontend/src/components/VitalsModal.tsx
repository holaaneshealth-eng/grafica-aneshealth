import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { STANDARD_PARAMS, findParam } from "../domain/monitoring";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export function VitalsModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const params = useMemo(() => {
    const std = STANDARD_PARAMS.filter((p) => cs.monitoring.standard.includes(p.code));
    return [...std, ...cs.monitoring.custom];
  }, [cs.monitoring]);

  const [values, setValues] = useState<Record<string, string>>({});

  function save() {
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = parseFloat(v.replace(",", "."));
      if (isFinite(n)) parsed[k] = n;
    }
    if (Object.keys(parsed).length === 0) return;
    append(cs.caseId, "VITALS_RECORDED", { id: "v-" + Date.now(), at: new Date().toISOString(), values: parsed, source: "manual" });
    onDone("Constantes registradas");
    onClose();
  }

  if (params.length === 0) {
    return (
      <Modal title="Registro de constantes" onClose={onClose}>
        <div className="empty">Primero selecciona los parametros de monitorizacion en la Fase 2.</div>
      </Modal>
    );
  }

  return (
    <Modal title="Registro de constantes" onClose={onClose}>
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
      <div className="alert">Cada registro queda asociado automaticamente a su hora exacta.</div>
      <button className="btn primary block lg" onClick={save}>
        Guardar constantes
      </button>
    </Modal>
  );
}
