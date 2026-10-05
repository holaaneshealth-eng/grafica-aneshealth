import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { findParam, paramsByGroup, type MonitoringParam, type ParamGroup } from "../domain/monitoring";
import { useStore } from "../store/store";
import type { CaseState, VitalsRecord } from "../domain/events";
import { nowLocalInput, isoFromLocalInput, isoToLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
  initialTime?: string; // ISO, cuando se abre tocando la gráfica
  edit?: VitalsRecord; // cuando se edita un registro existente
  group?: ParamGroup; // limitar a Respirador / Monitor (si no, muestra ambos)
}

export function VitalsModal({ cs, onClose, onDone, initialTime, edit, group }: Props) {
  const append = useStore((s) => s.append);

  // Secciones a mostrar: una (si se fija grupo) o las dos (Respirador + Monitor).
  const sections = useMemo(() => {
    const mk = (g: ParamGroup, title: string) => ({ g, title, params: paramsByGroup(g, cs.monitoring.custom) });
    if (group === "resp") return [mk("resp", "Respirador")];
    if (group === "monitor") return [mk("monitor", "Monitor")];
    return [mk("resp", "Respirador"), mk("monitor", "Monitor")];
  }, [cs.monitoring, group]);

  // Al editar se precarga el propio registro; si no, el último (arrastre de valores).
  const lastVitals = useMemo(() => cs.vitals.slice().sort((a, b) => b.at.localeCompare(a.at))[0], [cs.vitals]);
  const seed = edit ?? (initialTime ? undefined : lastVitals);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (seed) for (const [k, v] of Object.entries(seed.values)) init[k] = String(v);
    return init;
  });
  const [time, setTime] = useState(edit ? isoToLocalInput(edit.at) : initialTime ? isoToLocalInput(initialTime) : nowLocalInput());

  const shownCodes = useMemo(() => new Set(sections.flatMap((s) => s.params.map((p) => p.code))), [sections]);

  function bump(code: string, delta: number) {
    setValues((v) => {
      const cur = parseFloat((v[code] ?? "").replace(",", "."));
      const base = isFinite(cur) ? cur : 0;
      const nv = Math.round((base + delta) * 10) / 10;
      return { ...v, [code]: String(nv) };
    });
  }

  // Guarda SOLO los valores de las secciones mostradas. `atIso` permite forzar la hora
  // (p.ej. "Sin cambios" usa la hora actual sin tocar el selector).
  function save(atIso?: string) {
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!shownCodes.has(k)) continue;
      const n = parseFloat(v.replace(",", "."));
      if (isFinite(n)) parsed[k] = n;
    }
    if (Object.keys(parsed).length === 0) return;
    const at = atIso ?? isoFromLocalInput(time);
    if (edit) {
      append(cs.caseId, "VITALS_UPDATED", { id: edit.id, at, values: parsed }, at);
      onDone("Constantes modificadas");
    } else {
      append(cs.caseId, "VITALS_RECORDED", { id: "v-" + Date.now(), at, values: parsed, source: "manual" }, at);
      onDone(group === "resp" ? "Respirador registrado" : "Constantes registradas");
    }
    onClose();
  }

  const title = edit ? "Editar constantes" : group === "resp" ? "Registro del respirador" : group === "monitor" ? "Registro del monitor (manual)" : "Registro de constantes";

  return (
    <Modal title={title} onClose={onClose}>
      <TimeField value={time} onChange={setTime} label="Hora del registro" />
      {!edit && lastVitals && <div className="alert">Precargado con el último registro. Ajusta solo lo que cambie.</div>}
      {!edit && group === "resp" && (
        <button className="btn primary block lg" style={{ marginBottom: 10 }} onClick={() => save(new Date().toISOString())}>
          Sin cambios · registrar ahora
        </button>
      )}
      {sections.map((sec) => (
        <div key={sec.g}>
          {sections.length > 1 && <div className="section-title" style={{ margin: "10px 0 6px" }}>{sec.title}</div>}
          <div className="vital-grid">
            {sec.params.map((p: MonitoringParam) => {
              const def = findParam(p.code, cs.monitoring.custom);
              const raw = values[p.code];
              const num = raw ? parseFloat(raw.replace(",", ".")) : NaN;
              const out = def && isFinite(num) && ((def.min !== undefined && num < def.min) || (def.max !== undefined && num > def.max));
              const step = p.code === "TEMP" || p.code === "CAM" ? 0.1 : 1;
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
        </div>
      ))}
      <div className="alert">Rellena solo los campos que quieras. La hora es editable.</div>
      <button className="btn primary block lg" onClick={() => save()}>
        {edit ? "Guardar cambios" : "Guardar"}
      </button>
    </Modal>
  );
}
