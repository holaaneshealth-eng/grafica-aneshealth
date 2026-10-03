import { useState } from "react";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { STANDARD_PARAMS } from "../domain/monitoring";
import { TECHNIQUES, techniqueById, type TechniqueField } from "../domain/techniques";
import { AnesthesiaChart } from "../components/AnesthesiaChart";
import { MedicationTimeline } from "../components/MedicationTimeline";
import { BloodProductModal } from "../components/BloodProductModal";
import { LabModal } from "../components/LabModal";
import { VitalsModal } from "../components/VitalsModal";
import { Modal } from "../components/Modal";
import { TimeField } from "../components/TimeField";
import type { VitalsRecord } from "../domain/events";
import { hhmm, nowLocalInput, isoFromLocalInput, isoToLocalInput } from "../utils/time";
import { formatNum } from "../domain/calculations";
import { EXPOSURE_OPTIONS, insensibleLoss, WHO_PHASES } from "../domain/clinical";
import { MILESTONE_QUICK } from "../pdf/config/milestones";
import { VENT_MODES } from "../pdf/config/chartParams";

interface Props {
  cs: CaseState;
  onToast?: (m: string) => void;
  onAddVitalsAt?: (iso: string) => void;
}

type Tab = "safety" | "monitor" | "technique" | "record" | "charts";

// Hitos esenciales (incluye PCR). Cualquier otro se añade como hito personalizable voluntario.
const MILESTONES = MILESTONE_QUICK;

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
      <p className="sub">Todos los puntos deben quedar en "Sí" (OK). Si alguno no está OK, no se puede proseguir a la generación de la gráfica.</p>
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

  // Eventos POR ÍTEM: cada acción es independiente, así clicar varios seguidos nunca
  // pisa otras selecciones (a diferencia del antiguo array completo). Se lee el estado
  // más reciente solo para decidir el sentido del toggle.
  function currentMonitoring() {
    return useStore.getState().getCaseState(cs.caseId)?.monitoring ?? cs.monitoring;
  }
  function toggle(code: string) {
    const on = !currentMonitoring().standard.includes(code);
    append(cs.caseId, "MONITORING_TOGGLED", { code, on });
  }
  function addCustom() {
    if (!customName.trim()) return;
    const code = "C_" + customName.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 12) + "_" + Math.random().toString(36).slice(2, 5);
    append(cs.caseId, "MONITORING_CUSTOM_ADDED", {
      code,
      label: customName.trim(),
      unit: customUnit.trim() || "-",
      chart: true,
      color: "#14b8a6",
    });
    setCustomName("");
    setCustomUnit("");
  }
  function removeCustom(code: string) {
    append(cs.caseId, "MONITORING_CUSTOM_REMOVED", { code });
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
  const [techTime, setTechTime] = useState(nowLocalInput());

  function saveTechnique(id: string) {
    const def = techniqueById(id);
    if (!def) return;
    const at = isoFromLocalInput(techTime);
    append(
      cs.caseId,
      "TECHNIQUE_ADDED",
      {
        id: "t-" + Date.now(),
        type: id,
        label: def.label,
        details,
        at,
      },
      at,
    );
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
              setTechTime(nowLocalInput());
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {openId && (
        <div className="card" style={{ marginTop: 14, background: "var(--bg)" }}>
          <h2 style={{ fontSize: 16 }}>{techniqueById(openId)?.label}</h2>
          <TimeField value={techTime} onChange={setTechTime} label="Hora de realización" />
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
        // Se guarda el texto tal cual (incluidos decimales como "0,5" o "1.5"): convertir a
        // número en cada pulsación borraba el separador decimal e impedía escribir decimales.
        <input
          type="text"
          inputMode={field.type === "number" ? "decimal" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
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
  const [msLocked, setMsLocked] = useState(false); // hito rápido: etiqueta fija, hora editable
  const [bloodOpen, setBloodOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [editVitals, setEditVitals] = useState<VitalsRecord | null>(null);
  // Confirmación de borrado (evita eliminaciones accidentales de un toque).
  const [pendingDelete, setPendingDelete] = useState<{ msg: string; act: () => void } | null>(null);
  // Edición inline de bolos
  const [editBolusId, setEditBolusId] = useState<string | null>(null);
  const [ebDose, setEbDose] = useState("");
  const [ebUnit, setEbUnit] = useState("");
  const [ebTime, setEbTime] = useState(nowLocalInput());
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

  // Pulsar un hito rápido NO lo registra al instante: abre el selector de hora
  // (por defecto la vigente, pero modificable) antes de confirmarlo.
  function openQuickMilestone(label: string) {
    setMsText(label);
    setMsTime(nowLocalInput());
    setMsLocked(true);
    setShowMilestone(true);
  }
  function openCustomMilestone() {
    if (showMilestone && !msLocked) {
      setShowMilestone(false);
      return;
    }
    setMsText("");
    setMsTime(nowLocalInput());
    setMsLocked(false);
    setShowMilestone(true);
  }
  function changeMsTime(id: string, val: string) {
    const at = isoFromLocalInput(val);
    append(cs.caseId, "MILESTONE_TIME_CHANGED", { id, at }, at);
  }
  function removeMs(id: string) {
    append(cs.caseId, "MILESTONE_REMOVED", { id });
    onToast?.("Hito eliminado");
  }

  // Borrado de registros (permitido mientras la hoja no esté firmada). Pide confirmación.
  function askDelete(msg: string, act: () => void) {
    setPendingDelete({ msg, act });
  }
  function removeVitals(id: string) {
    append(cs.caseId, "VITALS_REMOVED", { id });
    onToast?.("Constante eliminada");
  }
  function removeBolus(id: string) {
    append(cs.caseId, "BOLUS_REMOVED", { id });
    onToast?.("Bolo eliminado");
  }
  function removeInfusion(id: string) {
    append(cs.caseId, "INFUSION_REMOVED", { id });
    onToast?.("Perfusión eliminada");
  }
  function removeBlood(id: string) {
    append(cs.caseId, "BLOOD_PRODUCT_REMOVED", { id });
    onToast?.("Hemoderivado eliminado");
  }
  function removeLab(id: string) {
    append(cs.caseId, "LAB_REMOVED", { id });
    onToast?.("Analítica eliminada");
  }
  function startEditBolus(b: (typeof cs.boluses)[number]) {
    setEditBolusId(b.id);
    setEbDose(String(b.dose));
    setEbUnit(b.unit);
    setEbTime(isoToLocalInput(b.at));
  }
  function saveEditBolus() {
    if (!editBolusId) return;
    const d = parseFloat(ebDose.replace(",", "."));
    const at = isoFromLocalInput(ebTime);
    append(cs.caseId, "BOLUS_UPDATED", { id: editBolusId, dose: isFinite(d) ? d : undefined, unit: ebUnit || undefined, at }, at);
    setEditBolusId(null);
    onToast?.("Bolo modificado");
  }
  function addCustomMilestone() {
    if (!msText.trim()) return;
    const at = isoFromLocalInput(msTime);
    append(cs.caseId, "MILESTONE", { id: "m-" + Date.now(), at, label: msText.trim() }, at);
    setMsText("");
    setMsTime(nowLocalInput());
    setShowMilestone(false);
    setMsLocked(false);
    onToast?.("Hito registrado");
  }

  const toast = (m: string) => onToast?.(m);

  function setVentMode(mode: string) {
    const at = new Date().toISOString();
    append(cs.caseId, "VENT_MODE_SET", { id: "vm-" + Date.now(), at, mode }, at);
    onToast?.(`Modo ventilatorio: ${mode}`);
  }
  const currentVentMode = cs.ventModes.length ? cs.ventModes[cs.ventModes.length - 1].mode : null;

  return (
    <div>
      <div className="card">
        <h2>Modo ventilatorio</h2>
        <p className="sub">
          Se registra con su hora. En la gráfica aparece como parámetro fijado (al inicio y en cada cambio).
          {currentVentMode ? ` Actual: ${currentVentMode}.` : ""}
        </p>
        <div className="chips">
          {VENT_MODES.map((m) => (
            <button key={m} className={`chip ${currentVentMode === m ? "on" : ""}`} onClick={() => setVentMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Hitos</h2>
        <p className="sub">Al pulsar un hito eliges la hora (por defecto la actual, modificable). Añade los que quieras como personalizados.</p>
        <div className="chips">
          {MILESTONES.map((m) => (
            <button key={m} className={`chip ${msLocked && msText === m && showMilestone ? "on" : ""}`} onClick={() => openQuickMilestone(m)}>
              {m}
            </button>
          ))}
          <button className={`chip ${showMilestone && !msLocked ? "on" : ""}`} onClick={openCustomMilestone}>
            + Hito personalizado
          </button>
        </div>
        {showMilestone && (
          <div className="card" style={{ marginTop: 12, background: "var(--bg)" }}>
            {msLocked ? (
              <div className="field">
                <label>Hito</label>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{msText}</div>
              </div>
            ) : (
              <div className="field">
                <label>Descripción del hito</label>
                <input type="text" value={msText} onChange={(e) => setMsText(e.target.value)} placeholder="Ej. Clampaje aórtico" autoFocus />
              </div>
            )}
            <div className="field">
              <label>Hora {msLocked ? "(modifícala si no es la actual)" : ""}</label>
              <input type="datetime-local" value={msTime} onChange={(e) => setMsTime(e.target.value)} />
            </div>
            <button className="btn primary block" onClick={addCustomMilestone} disabled={!msText.trim()}>
              Registrar hito
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
                    <button
                      className="btn ghost"
                      style={{ minHeight: 40, padding: "0 12px" }}
                      onClick={() => askDelete(`¿Eliminar el hito "${m.label}"?`, () => removeMs(m.id))}
                      title="Eliminar hito"
                    >
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

          <div className="section-title" style={{ margin: "14px 0 6px" }}>Registros de fármacos (editar hora/dosis o eliminar)</div>
          <div className="pill-list">
            {cs.boluses
              .slice()
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((b) => {
                const isConcVol = !!(b.concentration && b.volumeMl);
                return editBolusId === b.id ? (
                  <div className="pill" key={b.id} style={{ flexWrap: "wrap", gap: 8 }}>
                    <strong style={{ width: "100%" }}>{b.drug}</strong>
                    {!isConcVol && (
                      <>
                        <input inputMode="decimal" type="text" value={ebDose} onChange={(e) => setEbDose(e.target.value)} style={{ width: 90 }} placeholder="Dosis" />
                        <input type="text" value={ebUnit} onChange={(e) => setEbUnit(e.target.value)} style={{ width: 80 }} placeholder="Unidad" />
                      </>
                    )}
                    <input type="datetime-local" className="ms-time" value={ebTime} onChange={(e) => setEbTime(e.target.value)} />
                    <button className="btn primary" style={{ minHeight: 40, padding: "0 12px" }} onClick={saveEditBolus}>
                      Guardar
                    </button>
                    <button className="btn ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => setEditBolusId(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="pill" key={b.id}>
                    <span className="t">{hhmm(b.at)}</span>
                    <span className="m">
                      <strong>{b.drug}</strong>
                      <div className="sm">
                        {isConcVol ? `${formatNum(b.volumeMl!)} ml · ${formatNum(b.concentration!)}% (bolus)` : `${formatNum(b.dose)} ${b.unit} (bolus)`}
                      </div>
                    </span>
                    <button className="btn ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => startEditBolus(b)} title="Editar bolo">
                      ✎
                    </button>
                    <button
                      className="btn ghost"
                      style={{ minHeight: 40, padding: "0 12px" }}
                      onClick={() => askDelete(`¿Eliminar el bolo de ${b.drug} (${hhmm(b.at)})?`, () => removeBolus(b.id))}
                      title="Eliminar bolo"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            {cs.infusions.map((inf) => (
              <div className="pill" key={inf.id}>
                <span className="t">{hhmm(inf.startedAt)}</span>
                <span className="m">
                  <strong>{inf.drug}</strong> <small className="muted">perfusión</small>
                  <div className="sm">{inf.summary}{inf.active ? " · en curso" : inf.stoppedAt ? ` · fin ${hhmm(inf.stoppedAt)}` : ""}</div>
                </span>
                <button
                  className="btn ghost"
                  style={{ minHeight: 40, padding: "0 12px" }}
                  onClick={() => askDelete(`¿Eliminar la perfusión de ${inf.drug}?`, () => removeInfusion(inf.id))}
                  title="Eliminar perfusión"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {cs.vitals.length > 0 && (
        <div className="card">
          <h2>Constantes registradas (editar o eliminar)</h2>
          <p className="sub">Puedes corregir valores u hora, o eliminar registros hasta que se firme la hoja.</p>
          <div className="pill-list">
            {cs.vitals
              .slice()
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((v) => (
                <div className="pill" key={v.id}>
                  <span className="t">{hhmm(v.at)}</span>
                  <span className="m">
                    <div className="sm">
                      {Object.entries(v.values)
                        .map(([k, val]) => `${k} ${formatNum(val)}`)
                        .join("  ·  ")}
                    </div>
                  </span>
                  <button className="btn ghost" style={{ minHeight: 40, padding: "0 12px" }} onClick={() => setEditVitals(v)} title="Editar constantes">
                    ✎
                  </button>
                  <button
                    className="btn ghost"
                    style={{ minHeight: 40, padding: "0 12px" }}
                    onClick={() => askDelete(`¿Eliminar el registro de constantes de las ${hhmm(v.at)}?`, () => removeVitals(v.id))}
                    title="Eliminar registro"
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
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
                  {b.dose ? <div className="sm">{b.dose}</div> : null}
                  <div className="sm">
                    {b.registryNumber ? `Nº ${b.registryNumber}` : "Sin nº"}
                    {b.adverseReaction === true ? " · reacción adversa: Sí" : b.adverseReaction === false ? " · reacción: No" : ""}
                  </div>
                </span>
                <button
                  className="btn ghost"
                  style={{ minHeight: 40, padding: "0 12px" }}
                  onClick={() => askDelete(`¿Eliminar el hemoderivado "${b.product}"?`, () => removeBlood(b.id))}
                  title="Eliminar hemoderivado"
                >
                  ✕
                </button>
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
                <button
                  className="btn ghost"
                  style={{ minHeight: 40, padding: "0 12px" }}
                  onClick={() => askDelete(`¿Eliminar la analítica de las ${hhmm(l.at)}?`, () => removeLab(l.id))}
                  title="Eliminar analítica"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Sangrado y diuresis</h2>
        <p className="sub">
          Introduce la <strong>cantidad desde el último registro</strong> (no el acumulado): la hoja suma todos los registros para el total.
          Solo aparecerán en la hoja final si registras algún dato.
        </p>
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
      {editVitals && <VitalsModal cs={cs} edit={editVitals} onClose={() => setEditVitals(null)} onDone={toast} />}
      {pendingDelete && (
        <Modal title="Confirmar eliminación" onClose={() => setPendingDelete(null)}>
          <p style={{ marginTop: 0 }}>{pendingDelete.msg}</p>
          <p className="sub">Esta acción se puede volver a registrar, pero el borrado quedará en el histórico.</p>
          <div className="grid2">
            <button className="btn ghost lg" onClick={() => setPendingDelete(null)}>
              Cancelar
            </button>
            <button
              className="btn danger lg"
              onClick={() => {
                pendingDelete.act();
                setPendingDelete(null);
              }}
            >
              Eliminar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function phase2Ready(cs: CaseState): boolean {
  const s = cs.safety;
  // Todos los puntos de seguridad deben estar en OK (Sí). Si alguno no lo está,
  // no se puede proseguir a la generación de la gráfica.
  const safetyOk = [s.monitorChecked, s.ventilatorChecked, s.suctionReady, s.ambuReady].every((v) => v === true);
  return safetyOk && cs.monitoring.standard.length + cs.monitoring.custom.length > 0 && cs.techniques.length > 0;
}
