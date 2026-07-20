import { useState } from "react";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { STANDARD_PARAMS } from "../domain/monitoring";
import { TECHNIQUES, techniqueById, type TechniqueField } from "../domain/techniques";
import { TrendCharts } from "../components/TrendCharts";
import { hhmm } from "../utils/time";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
}

type Tab = "safety" | "monitor" | "technique" | "record" | "charts";

const MILESTONES = ["Entrada en quirofano", "Monitor conectado", "Preoxigenacion", "Induccion", "Intubacion", "Inicio cirugia", "Fin cirugia"];

export function Phase2({ cs }: Props) {
  const [tab, setTab] = useState<Tab>("safety");
  return (
    <div>
      <div className="seg no-print" style={{ overflowX: "auto" }}>
        <button className={tab === "safety" ? "on" : ""} onClick={() => setTab("safety")}>
          Seguridad
        </button>
        <button className={tab === "monitor" ? "on" : ""} onClick={() => setTab("monitor")}>
          Monitor
        </button>
        <button className={tab === "technique" ? "on" : ""} onClick={() => setTab("technique")}>
          Tecnicas
        </button>
        <button className={tab === "record" ? "on" : ""} onClick={() => setTab("record")}>
          Registro
        </button>
        <button className={tab === "charts" ? "on" : ""} onClick={() => setTab("charts")}>
          Graficas
        </button>
      </div>

      {tab === "safety" && <SafetySection cs={cs} />}
      {tab === "monitor" && <MonitorSection cs={cs} />}
      {tab === "technique" && <TechniqueSection cs={cs} />}
      {tab === "record" && <RecordSection cs={cs} />}
      {tab === "charts" && (
        <div className="card">
          <h2>Graficas de tendencias</h2>
          <p className="sub">Generadas automaticamente a partir de los registros.</p>
          <TrendCharts cs={cs} />
        </div>
      )}
    </div>
  );
}

/* ---------------- Safety ---------------- */
function SafetySection({ cs }: Props) {
  const append = useStore((s) => s.append);
  const items: { key: keyof CaseState["safety"]; label: string }[] = [
    { key: "monitorChecked", label: "Monitor comprobado" },
    { key: "ventilatorChecked", label: "Respirador comprobado" },
    { key: "suctionReady", label: "Aspirador disponible y operativo" },
    { key: "ambuReady", label: "Ambu localizado y operativo" },
  ];
  function set(key: string, value: boolean) {
    append(cs.caseId, "SAFETY_CHECK_SET", { item: key, value });
  }
  return (
    <div className="card">
      <h2>Checklist de seguridad</h2>
      <p className="sub">Obligatorio confirmar cada punto. "No" queda registrado explicitamente.</p>
      {items.map((it) => (
        <div className="check-row" key={it.key}>
          <span className="label">{it.label}</span>
          <div style={{ width: 180 }}>
            <div className="yesno">
              <button className={`yes ${cs.safety[it.key] === true ? "on" : ""}`} onClick={() => set(it.key, true)}>
                Si
              </button>
              <button className={`no ${cs.safety[it.key] === false ? "on" : ""}`} onClick={() => set(it.key, false)}>
                No
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Monitoring ---------------- */
function MonitorSection({ cs }: Props) {
  const append = useStore((s) => s.append);
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("");

  function toggle(code: string) {
    const has = cs.monitoring.standard.includes(code);
    const next = has ? cs.monitoring.standard.filter((c) => c !== code) : [...cs.monitoring.standard, code];
    append(cs.caseId, "MONITORING_SELECTED", { standard: next, custom: cs.monitoring.custom });
  }
  function addCustom() {
    if (!customName.trim()) return;
    const code = "C_" + customName.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 12);
    const custom = [...cs.monitoring.custom, { code, label: customName.trim(), unit: customUnit.trim() || "-", chart: true, color: "#14b8a6" }];
    append(cs.caseId, "MONITORING_SELECTED", { standard: cs.monitoring.standard, custom });
    setCustomName("");
    setCustomUnit("");
  }
  function removeCustom(code: string) {
    append(cs.caseId, "MONITORING_SELECTED", {
      standard: cs.monitoring.standard,
      custom: cs.monitoring.custom.filter((c) => c.code !== code),
    });
  }

  return (
    <div className="card">
      <h2>Seleccion de monitorizacion</h2>
      <p className="sub">Los parametros elegidos apareceran en el registro seriado y en las graficas.</p>
      <div className="chips">
        {STANDARD_PARAMS.map((p) => (
          <button key={p.code} className={`chip ${cs.monitoring.standard.includes(p.code) ? "on" : ""}`} onClick={() => toggle(p.code)}>
            {p.label} <small>{p.unit}</small>
          </button>
        ))}
      </div>

      <div className="section-title">Monitorizacion adicional</div>
      <p className="sub">Ej. BIS, Saturacion cerebral, ETE, PiCCO, Swan-Ganz...</p>
      {cs.monitoring.custom.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {cs.monitoring.custom.map((c) => (
            <button key={c.code} className="chip on" onClick={() => removeCustom(c.code)}>
              {c.label} <small>{c.unit}</small> &times;
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Nombre</label>
          <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ej. BIS" />
        </div>
        <div className="field">
          <label>Unidad</label>
          <input type="text" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="-" />
        </div>
      </div>
      <button className="btn block" onClick={addCustom} disabled={!customName.trim()}>
        + Anadir monitorizacion adicional
      </button>
    </div>
  );
}

/* ---------------- Technique ---------------- */
function TechniqueSection({ cs }: Props) {
  const append = useStore((s) => s.append);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string | boolean | number>>({});

  function saveTechnique(id: string) {
    const def = techniqueById(id);
    if (!def) return;
    append(cs.caseId, "TECHNIQUE_ADDED", {
      id: "t-" + Date.now(),
      type: id,
      label: def.label,
      details,
      at: new Date().toISOString(),
    });
    setOpenId(null);
    setDetails({});
  }

  return (
    <div className="card">
      <h2>Tipo de anestesia</h2>
      <p className="sub">Puede seleccionarse mas de una tecnica. Cada una despliega sus campos.</p>

      {cs.techniques.length > 0 && (
        <div className="pill-list" style={{ marginBottom: 14 }}>
          {cs.techniques.map((t) => (
            <div className="pill" key={t.id}>
              <span className="t">{hhmm(t.at)}</span>
              <span className="m">
                <strong>{t.label}</strong>
                <div className="sm">
                  {Object.entries(t.details)
                    .filter(([, v]) => v !== "" && v != null)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join("  |  ")}
                </div>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="chips">
        {TECHNIQUES.map((t) => (
          <button
            key={t.id}
            className={`chip ${openId === t.id ? "on" : ""}`}
            onClick={() => {
              setOpenId(openId === t.id ? null : t.id);
              setDetails({});
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {openId && (
        <div className="card" style={{ marginTop: 14, background: "var(--bg)" }}>
          <h2 style={{ fontSize: 16 }}>{techniqueById(openId)?.label}</h2>
          {techniqueById(openId)!.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} />
          ))}
          <button className="btn primary block" onClick={() => saveTechnique(openId)}>
            Anadir tecnica
          </button>
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: TechniqueField;
  value: string | boolean | number | undefined;
  onChange: (v: string | boolean | number) => void;
}) {
  return (
    <div className="field">
      <label>{field.label}{field.unit ? ` (${field.unit})` : ""}</label>
      {field.type === "select" && (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">-</option>
          {field.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )}
      {field.type === "yesno" && (
        <div className="yesno">
          <button className={`yes ${value === true ? "on" : ""}`} onClick={() => onChange(true)}>
            Si
          </button>
          <button className={`no ${value === false ? "on" : ""}`} onClick={() => onChange(false)}>
            No
          </button>
        </div>
      )}
      {(field.type === "text" || field.type === "number") && (
        <input
          type="text"
          inputMode={field.type === "number" ? "decimal" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.type === "number" ? parseFloat(e.target.value.replace(",", ".")) || 0 : e.target.value)}
        />
      )}
    </div>
  );
}

/* ---------------- Record (timeline + drugs) ---------------- */
function RecordSection({ cs }: Props) {
  const append = useStore((s) => s.append);
  const getTimeline = useStore((s) => s.getTimeline);
  const timeline = getTimeline(cs.caseId);

  function milestone(label: string) {
    append(cs.caseId, "MILESTONE", { id: "m-" + Date.now(), at: new Date().toISOString(), label });
  }
  function stopInfusion(id: string, drug: string) {
    append(cs.caseId, "INFUSION_STOPPED", { id, drug });
  }

  const activeInfusions = cs.infusions.filter((i) => i.active);

  return (
    <div>
      <div className="card">
        <h2>Hitos rapidos</h2>
        <p className="sub">Un toque = un evento con hora automatica.</p>
        <div className="chips">
          {MILESTONES.map((m) => (
            <button key={m} className="chip" onClick={() => milestone(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {activeInfusions.length > 0 && (
        <div className="card">
          <h2>Perfusiones activas</h2>
          {activeInfusions.map((inf) => (
            <div className="pill" key={inf.id}>
              <span className="t">{hhmm(inf.startedAt)}</span>
              <span className="m">
                <strong>{inf.drug}</strong>
                <div className="sm">{inf.summary}</div>
                <div className="sm">
                  Conc. {formatNum(inf.concentration)} {inf.concentrationUnit}
                </div>
              </span>
              <button className="btn danger" onClick={() => stopInfusion(inf.id, inf.drug)}>
                Detener
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Cronologia</h2>
        <p className="sub">La hoja se reconstruye a partir de esta secuencia de eventos.</p>
        {timeline.length === 0 && <div className="empty">Sin eventos todavia.</div>}
        <div className="timeline">
          {timeline.map((it) => (
            <div className="tl-item" key={it.id}>
              <span className="tl-time">{hhmm(it.at)}</span>
              <div className={`tl-body ${it.kind}`}>
                <div className="tl-label">{it.label}</div>
                {it.detail && <div className="tl-detail">{it.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function phase2Ready(cs: CaseState): boolean {
  const s = cs.safety;
  const safetyDone = [s.monitorChecked, s.ventilatorChecked, s.suctionReady, s.ambuReady].every((v) => v !== null);
  return safetyDone && cs.monitoring.standard.length + cs.monitoring.custom.length > 0 && cs.techniques.length > 0;
}
