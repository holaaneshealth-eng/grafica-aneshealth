import { useState } from "react";
import { TimeField } from "./TimeField";
import { TEMPLATES, type SurgeryTemplate } from "../domain/templates";
import { drugByName } from "../domain/drugs";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { nowLocalInput, isoFromLocalInput } from "../utils/time";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
  onDone: (msg: string) => void;
  onClose: () => void;
  onStartInfusion: (drugName: string) => void;
}

interface Sel {
  dose: string;
  conc: string;
  vol: string;
}

export function TemplatePanel({ cs, onDone, onClose, onStartInfusion }: Props) {
  const append = useStore((s) => s.append);
  const [surgery, setSurgery] = useState<SurgeryTemplate | null>(null);
  const [time, setTime] = useState(nowLocalInput());
  const [selected, setSelected] = useState<Record<string, Sel>>({});

  function toggle(name: string) {
    setSelected((s) => {
      if (s[name]) {
        const { [name]: _omit, ...rest } = s;
        void _omit;
        return rest;
      }
      const def = drugByName(name);
      const dose = def?.commonBolus?.[0] != null ? String(def.commonBolus[0]) : "";
      return { ...s, [name]: { dose, conc: "", vol: "" } };
    });
  }

  function setField(name: string, field: keyof Sel, value: string) {
    setSelected((s) => ({ ...s, [name]: { ...s[name], [field]: value } }));
  }

  function register() {
    const at = isoFromLocalInput(time);
    let count = 0;
    for (const [name, v] of Object.entries(selected)) {
      const def = drugByName(name);
      let dose = 0;
      const extra: Record<string, unknown> = {};
      if (def?.concVol) {
        const c = parseFloat(v.conc.replace(",", "."));
        const vol = parseFloat(v.vol.replace(",", "."));
        if (!c || !vol) continue;
        dose = c * 10 * vol; // 1% = 10 mg/ml
        extra.concentration = c;
        extra.volumeMl = vol;
      } else {
        dose = parseFloat(v.dose.replace(",", "."));
        if (!dose) continue;
      }
      append(cs.caseId, "DRUG_BOLUS", { id: "r-" + Math.random().toString(36).slice(2, 8), drug: name, dose, unit: def?.defaultUnit ?? "mg", at, ...extra }, at);
      count++;
    }
    onDone(count > 0 ? `${count} fármaco(s) registrados` : "Nada que registrar");
    onClose();
  }

  if (!surgery) {
    return (
      <div>
        <p className="sub">Elige el tipo de cirugía/anestesia para desplegar su medicación habitual.</p>
        <div className="pill-list">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="btn block" style={{ justifyContent: "flex-start" }} onClick={() => setSurgery(t)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const selectedCount = Object.keys(selected).length;

  return (
    <div>
      <button className="btn ghost" onClick={() => setSurgery(null)} style={{ marginBottom: 10 }}>
        ← Cambiar cirugía
      </button>
      <h3 style={{ margin: "0 0 8px" }}>{surgery.label}</h3>
      <TimeField value={time} onChange={setTime} label="Hora (común a los seleccionados)" />

      <div className="section-title">Bolus (marca los administrados)</div>
      {surgery.boluses.map((name) => {
        const def = drugByName(name);
        const sel = selected[name];
        return (
          <div key={name} style={{ marginBottom: 8 }}>
            <button className={`chip ${sel ? "on" : ""}`} onClick={() => toggle(name)} style={{ width: "100%", justifyContent: "flex-start" }}>
              {sel ? "☑" : "☐"} {name}
            </button>
            {sel &&
              (def?.concVol ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <input inputMode="decimal" placeholder="conc %" value={sel.conc} onChange={(e) => setField(name, "conc", e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <input inputMode="decimal" placeholder="vol ml" value={sel.vol} onChange={(e) => setField(name, "vol", e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0, flex: "0 0 70px", display: "flex", alignItems: "center", color: "var(--text-dim)", fontSize: 13 }}>
                    {sel.conc && sel.vol
                      ? `${formatNum(parseFloat(sel.conc.replace(",", ".")) * 10 * parseFloat(sel.vol.replace(",", ".")) || 0)} mg`
                      : "mg"}
                  </div>
                </div>
              ) : (
                <div className="row" style={{ marginTop: 6 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <input inputMode="decimal" placeholder="dosis" value={sel.dose} onChange={(e) => setField(name, "dose", e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0, flex: "0 0 70px", display: "flex", alignItems: "center", color: "var(--text-dim)" }}>
                    {def?.defaultUnit ?? "mg"}
                  </div>
                </div>
              ))}
          </div>
        );
      })}

      {surgery.infusions.length > 0 && (
        <>
          <div className="section-title">Perfusiones (pulsa para iniciar)</div>
          <div className="chips">
            {surgery.infusions.map((name) => (
              <button key={name} className="chip" onClick={() => onStartInfusion(name)}>
                {name}
              </button>
            ))}
          </div>
        </>
      )}

      <button className="btn primary block lg" style={{ marginTop: 14 }} onClick={register} disabled={selectedCount === 0}>
        Registrar {selectedCount > 0 ? `${selectedCount} bolus` : "bolus seleccionados"}
      </button>
    </div>
  );
}
