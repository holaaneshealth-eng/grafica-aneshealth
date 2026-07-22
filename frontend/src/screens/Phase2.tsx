import { useState } from "react";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { STANDARD_PARAMS } from "../domain/monitoring";
import { TECHNIQUES, techniqueById, type TechniqueField } from "../domain/techniques";
import { AnesthesiaChart } from "../components/AnesthesiaChart";
import { MedicationTimeline } from "../components/MedicationTimeline";
import { BloodProductModal } from "../components/BloodProductModal";
import { LabModal } from "../components/LabModal";
import { hhmm, nowLocalInput, isoFromLocalInput, isoToLocalInput } from "../utils/time";
import { formatNum } from "../domain/calculations";
import { EXPOSURE_OPTIONS, insensibleLoss, WHO_PHASES } from "../domain/clinical";

interface Props {
  cs: CaseState;
  onToast?: (m: string) => void;
  onAddVitalsAt?: (iso: string) => void;
}

type Tab = "safety" | "monitor" | "technique" | "record" | "charts";

const MILESTONES = [
  "Entrada en quirófano",
  "Monitor conectado",
  "Preoxigenación",
  "Inducción",
  "Intubación",
  "Inicio cirugía",
  "Fin cirugía",
];

export function Phase2({ cs, onToast, onAddVitalsAt }: Props) {
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
          Técnicas
        </button>
        <button className={tab === "record" ? "on" : ""} onClick={() => setTab("record")}>
          Registro
        </button>
        <button className={tab === "charts" ? "on" : ""} onClick={() => setTab("charts")}>
          Gráficas
        </button>
      </div>

      {tab === "safety" && (
        <>
          <SafetySection cs={cs} />
          <WhoSection cs={cs} />
        </>
      )}
      {tab === "monitor" && <MonitorSection cs={cs} />}
      {tab === "technique" && <TechniqueSection cs={cs} />}
      {tab === "record" && <RecordSection cs={cs} onToast={onToast} />}
      {tab === "charts" && (
        <div className="card">
          <h2>Gráfica anestésica</h2>
          <p className="sub">Hemodinámica, fármacos y eventos sobre el mismo eje de tiempo. Toca la gráfica para añadir constantes en ese momento.</p>
          <AnesthesiaChart cs={cs} onTimeClick={onAddVitalsAt} />
        </div>
      )}
    </div>
  );
}

/* ---------------- Seguridad ---------------- */
function SafetySection({ cs }: { cs: CaseState }) {
  const append = useStore((s) => s.append);
  const items: { key: keyof CaseState["safety"]; label: string }[] = [
    { key: "monitorChecked", label: "Monitor comprobado" },
    { key: "ventilatorChecked", label: "Respirador comprobado" },
    { key: "suctionReady", label: "Aspirador disponible y operativo" },
    { key: "ambuReady", label: "Ambú localizado y operativo" },
  ];
  function set(key: string, value: boolean) {
    append(cs.caseId, "SAFETY_CHECK_SET", { item: key, value });
  }
  return (
    <div className="card">
      <h2>Checklist de seguridad</h2>
      <p className="sub">Obligatorio confirmar cada punto. "No" queda registrado explícitamente.</p>
      {items.map((it) => (
        <div className="check-row" key={it.key}>
          <span className="label">{it.label}</span>
          <div style={{ width: 180 }}>
            <div className="yesno">
              <button className={`yes ${cs.safety[it.key] === true ? "on" : ""}`} onClick={() => set(it.key, true)}>
                Sí
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

/* ---------------- Checklist quirúrgico de la OMS ---------------- */
function WhoSection({ cs }: { cs: CaseState }) {
  const append = useStore((s) => s.append);
  function set(key: string, value: boolean) {
    append(cs.caseId, "WHO_CHECK_SET", { item: key, value });
  }
  const total = WHO_PHASES.reduce((n, p) => n + p.items.length, 0);
  const done = WHO_PHASES.reduce((n, p) => n + p.items.filter((it) => cs.who[it.key] === true).length, 0);
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 style={{ flex: 1 }}>Checklist quirúrgico de la OMS</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {done}/{total}
        </span>
      </div>
      <p className="sub">Lista de verificación de seguridad quirúrgica (3 fases). Marca cada punto verificado.</p>
      {WHO_PHASES.map((ph) => (
        <div key={ph.phase} style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ margin: "6px 0" }}>{ph.phase}</div>
          {ph.items.map((it) => {
            const checked = cs.who[it.key] === true;
            return (
              <div className="check-row" key={it.key}>
                <span className="label">{it.label}</span>
                <button
                  className={`btn ${checked ? "primary" : "ghost"}`}
                  style={{ minWidth: 128, minHeight: 40 }}
                  onClick={() => set(it.key, !checked)}
                >
                  {checked ? "✓ Verificado" : "Marcar"}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Monitorización ---------------- */
function MonitorSection({ cs }: { cs: CaseState }) {
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
    const custom = [
      ...cs.monitoring.custom,
      { code, label: customName.trim(), unit: customUnit.trim() || "-", chart: true, color: "#14b8a6" },
    ];
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
      <h2>Selección de monitorización</h2>
      <p className="sub">Los parámetros elegidos aparecerán en el registro seriado y en las gráficas.</p>
      <div className="chips">
        {STANDARD_PARAMS.map((p) => (
          <button
            key={p.code}
            className={`chip ${cs.monitoring.standard.includes(p.code) ? "on" : ""}`}
            onClick={() => toggle(p.code)}
          >
            {p.label} {p.unit && <small>{p.unit}</small>}
          </button>
        ))}
      </div>

      <div className="section-title">Monitorización adicional</div>
      <p className="sub">Ej. Saturación cerebral, ETE, PiCCO, Swan-Ganz...</p>
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
          <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ej. rSO₂" />
        </div>
        <div className="field">
          <label>Unidad</label>
          <input type="text" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="-" />
        </div>
      </div>
      <button className="btn block" onClick={addCustom} disabled={!customName.trim()}>
        + Añadir monitorización adicional
      </button>
    </div>
  );
}

/* ---------------- Técnica ---------------- */
function TechniqueSection({ cs }: { cs: CaseState }) {
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
      <p className="sub">Puede seleccionarse más de una técnica. Cada una despliega sus campos.</p>

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
            Añadir técnica
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
      <label>
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
      </label>
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
            Sí
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

/* ---------------- Registro (hitos, perfusiones, hemoderivados, analítica, cronología) ---------------- */
function RecordSection({ cs, onToast }: { cs: CaseState; onToast?: (m: string) => void }) {
  const append = useStore((s) => s.append);
  const getTimeline = useStore((s) => s.getTimeline);
  const timeline = getTimeline(cs.caseId);

  const [showMilestone, setShowMilestone] = useState(false);
  const [msText, setMsText] = useState("");
  const [msTime, setMsTime] = useState(nowLocalInput());
  const [bloodOpen, setBloodOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [bleeding, setBleeding] = useState("");
  const [diuresis, setDiuresis] = useState("");
  const [balTime, setBalTime] = useState(nowLocalInput());

  // Calculadora de pérdidas insensibles / evaporativas
  const [exposureId, setExposureId] = useState(EXPOSURE_OPTIONS[1].id);
  const [temp, setTemp] = useState("");
  const [insHours, setInsHours] = useState("");
  const defaultHours = Math.max(0, ((cs.endedAt ? new Date(cs.endedAt).getTime() : Date.now()) - new Date(cs.createdAt).getTime()) / 3600000);
  const insWeight = cs.preop.weightKg ?? 0;
  const insHoursVal = insHours ? parseFloat(insHours.replace(",", ".")) : Math.round(defaultHours * 10) / 10;
  const exposure = EXPOSURE_OPTIONS.find((e) => e.id === exposureId) ?? EXPOSURE_OPTIONS[1];
  const tempC = temp ? parseFloat(temp.replace(",", ".")) : undefined;
  const insEstimate = insWeight > 0 && insHoursVal > 0 ? insensibleLoss(insWeight, insHoursVal, exposure.mlKgH, tempC) : null;

  function addInsensible() {
    if (insEstimate == null) return;
    const at = isoFromLocalInput(balTime);
    const note = `${exposure.label} · ${exposure.mlKgH} ml/kg/h · ${insWeight} kg · ${formatNum(insHoursVal)} h${tempC && tempC > 37 ? ` · Tª ${formatNum(tempC)}°C` : ""}`;
    append(cs.caseId, "BALANCE", { id: "bal-" + Date.now(), at, insensibleMl: insEstimate, insensibleNote: note }, at);
    onToast?.("Pérdidas insensibles registradas");
  }

  function addBalance() {
    const b = parseFloat(bleeding.replace(",", "."));
    const d = parseFloat(diuresis.replace(",", "."));
    if (!isFinite(b) && !isFinite(d)) return;
    const at = isoFromLocalInput(balTime);
    append(
      cs.caseId,
      "BALANCE",
      { id: "bal-" + Date.now(), at, bleedingMl: isFinite(b) ? b : undefined, diuresisMl: isFinite(d) ? d : undefined },
      at,
    );
    setBleeding("");
    setDiuresis("");
    setBalTime(nowLocalInput());
    onToast?.("Balance registrado");
  }

  const totalBleeding = cs.balances.reduce((s, x) => s + (x.bleedingMl ?? 0), 0);
  const totalDiuresis = cs.balances.reduce((s, x) => s + (x.diuresisMl ?? 0), 0);
  const totalInsensible = cs.balances.reduce((s, x) => s + (x.insensibleMl ?? 0), 0);

  function milestone(label: string) {
    append(cs.caseId, "MILESTONE", { id: "m-" + Date.now(), at: new Date().toISOString(), label });
    onToast?.(`${label} registrado`);
  }
  function changeMsTime(id: string, val: string) {
    const at = isoFromLocalInput(val);
    append(cs.caseId, "MILESTONE_TIME_CHANGED", { id, at }, at);
  }
  function removeMs(id: string) {
    append(cs.caseId, "MILESTONE_REMOVED", { id });
    onToast?.("Hito eliminado");
  }
  function addCustomMilestone() {
    if (!msText.trim()) return;
    const at = isoFromLocalInput(msTime);
    append(cs.caseId, "MILESTONE", { id: "m-" + Date.now(), at, label: msText.trim() }, at);
    setMsText("");
    setMsTime(nowLocalInput());
    setShowMilestone(false);
    onToast?.("Hito registrado");
  }

  const toast = (m: string) => onToast?.(m);

  return (
    <div>
      <div className="card">
        <h2>Hitos rápidos</h2>
        <p className="sub">Un toque = un evento con hora automática.</p>
        <div className="chips">
          {MILESTONES.map((m) => (
            <button key={m} className="chip" onClick={() => milestone(m)}>
              {m}
            </button>
          ))}
          <button className={`chip ${showMilestone ? "on" : ""}`} onClick={() => setShowMilestone((v) => !v)}>
            + Hito personalizado
          </button>
        </div>
        {showMilestone && (
          <div className="card" style={{ marginTop: 12, background: "var(--bg)" }}>
            <div className="field">
              <label>Descripción del hito</label>
              <input type="text" value={msText} onChange={(e) => setMsText(e.target.value)} placeholder="Ej. Clampaje aórtico" autoFocus />
            </div>
            <div className="field">
              <label>Hora</label>
              <input type="datetime-local" value={msTime} onChange={(e) => setMsTime(e.target.value)} />
            </div>
            <button className="btn primary block" onClick={addCustomMilestone} disabled={!msText.trim()}>
              Añadir hito
            </button>
          </div>
        )}

        {cs.milestones.length > 0 && (
          <>
            <div className="section-title" style={{ margin: "14px 0 6px" }}>Hitos registrados (edita la hora o elimina)</div>
            <div className="pill-list">
              {cs.milestones
                .slice()
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((m) => (
                  <div className="pill" key={m.id}>
                    <span className="m">
                      <strong>{m.label}</strong>
                    </span>
                    <input
                      type="datetime-local"
                      className="ms-time"
                      value={isoToLocalInput(m.at)}
                      onChange={(e) => changeMsTime(m.id, e.target.value)}
                    />
                    <button className="btn ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => removeMs(m.id)} title="Eliminar hito">
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {(cs.boluses.length > 0 || cs.infusions.length > 0) && (
        <div className="card">
          <h2>Fármacos (línea de tiempo)</h2>
          <p className="sub">Bolus como rombos; perfusiones como barra con sus ritmos. Vuelve a pulsar un fármaco en curso para cambiar el ritmo (0 = fin).</p>
          <MedicationTimeline cs={cs} />
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ flex: 1 }}>Hemoderivados</h2>
          <button className="btn" onClick={() => setBloodOpen(true)}>
            + Hemoderivado
          </button>
        </div>
        {cs.bloodProducts.length === 0 ? (
          <div className="empty">Sin hemoderivados registrados.</div>
        ) : (
          <div className="pill-list">
            {cs.bloodProducts.map((b) => (
              <div className="pill" key={b.id}>
                <span className="t">{hhmm(b.at)}</span>
                <span className="m">
                  <strong>{b.product}</strong>
                  <div className="sm">
                    {b.registryNumber ? `Nº ${b.registryNumber}` : "Sin nº"}
                    {b.adverseReaction === true ? " · reacción adversa: Sí" : b.adverseReaction === false ? " · reacción: No" : ""}
                  </div>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ flex: 1 }}>Analítica intraoperatoria</h2>
          <button className="btn" onClick={() => setLabOpen(true)}>
            + Analítica
          </button>
        </div>
        {cs.labs.length === 0 ? (
          <div className="empty">Sin analíticas registradas.</div>
        ) : (
          <div className="pill-list">
            {cs.labs.map((l) => (
              <div className="pill" key={l.id}>
                <span className="t">{hhmm(l.at)}</span>
                <span className="m">
                  <div className="sm">
                    {Object.entries(l.values)
                      .map(([k, v]) => `${k} ${formatNum(v)}`)
                      .join("  ·  ")}
                  </div>
                  {l.notes && <div className="sm">{l.notes}</div>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Sangrado y diuresis</h2>
        <p className="sub">Campos libres. Solo aparecerán en la hoja final si registras algún dato.</p>
        <div className="row">
          <div className="field">
            <label>Sangrado (ml)</label>
            <input inputMode="decimal" type="text" value={bleeding} onChange={(e) => setBleeding(e.target.value)} />
          </div>
          <div className="field">
            <label>Diuresis (ml)</label>
            <input inputMode="decimal" type="text" value={diuresis} onChange={(e) => setDiuresis(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Hora</label>
          <input type="datetime-local" value={balTime} onChange={(e) => setBalTime(e.target.value)} />
        </div>
        <button className="btn block" onClick={addBalance} disabled={!bleeding && !diuresis}>
          + Añadir al balance
        </button>

        <div className="section-title" style={{ margin: "16px 0 6px" }}>Calculadora de pérdidas insensibles</div>
        <p className="sub">Estimación evaporativa según exposición quirúrgica, tiempo y temperatura. Orientativa.</p>
        <div className="field">
          <label>Tipo de exposición quirúrgica</label>
          <select value={exposureId} onChange={(e) => setExposureId(e.target.value)}>
            {EXPOSURE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({o.mlKgH} ml/kg/h)
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label>Duración (h){!insHours && insWeight > 0 ? " · auto" : ""}</label>
            <input inputMode="decimal" type="text" value={insHours} onChange={(e) => setInsHours(e.target.value)} placeholder={formatNum(Math.round(defaultHours * 10) / 10)} />
          </div>
          <div className="field">
            <label>Temperatura (°C, opcional)</label>
            <input inputMode="decimal" type="text" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="Ej. 38" />
          </div>
        </div>
        {insWeight <= 0 ? (
          <div className="alert danger">Registra el peso del paciente (Fase 1) para calcular las pérdidas insensibles.</div>
        ) : insEstimate != null ? (
          <>
            <div className="calc-box">
              <div className="muted" style={{ fontSize: 13 }}>Pérdidas insensibles estimadas</div>
              <div className="big">≈ {insEstimate} ml</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {exposure.mlKgH} ml/kg/h × {insWeight} kg × {formatNum(insHoursVal)} h{tempC && tempC > 37 ? ` × recargo fiebre` : ""}
              </div>
            </div>
            <button className="btn block" onClick={addInsensible}>
              + Registrar en el balance
            </button>
          </>
        ) : null}

        {cs.balances.length > 0 && (
          <div className="alert" style={{ marginTop: 10 }}>
            Total sangrado: <strong>{totalBleeding} ml</strong> · Total diuresis: <strong>{totalDiuresis} ml</strong>
            {totalInsensible > 0 && (
              <>
                {" "}
                · Pérdidas insensibles: <strong>{totalInsensible} ml</strong>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Cronología</h2>
        <p className="sub">La hoja se reconstruye a partir de esta secuencia de eventos.</p>
        {timeline.length === 0 && <div className="empty">Sin eventos todavía.</div>}
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

      {bloodOpen && <BloodProductModal cs={cs} onClose={() => setBloodOpen(false)} onDone={toast} />}
      {labOpen && <LabModal cs={cs} onClose={() => setLabOpen(false)} onDone={toast} />}
    </div>
  );
}

export function phase2Ready(cs: CaseState): boolean {
  const s = cs.safety;
  const safetyDone = [s.monitorChecked, s.ventilatorChecked, s.suctionReady, s.ambuReady].every((v) => v !== null);
  return safetyDone && cs.monitoring.standard.length + cs.monitoring.custom.length > 0 && cs.techniques.length > 0;
}
