import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import type { CaseState, ProtectionInfo } from "../domain/events";
import { TECHNIQUES, techniqueById, type TechniqueField } from "../domain/techniques";
import {
  PUMP_SOLUTIONS, PIEB_DEFAULT, PCEA_DEFAULT, BROMAGE_MOD, DERMATOMES, isLateralized,
  DELIVERY_TYPES, INSTRUMENTAL_TYPES, LABOR_COMPLICATIONS, deliveryLabel, instrumentalLabel,
} from "../domain/labor";
import { laborTotals } from "../domain/laborTotals";
import { hhmm, nowLocalInput, isoFromLocalInput } from "../utils/time";
import { formatNum } from "../domain/calculations";

const rid = (p: string) => p + "-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const num = (s: string): number | undefined => {
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) ? n : undefined;
};

export function LaborScreen({ cs, onToast }: { cs: CaseState; onToast: (m: string) => void }) {
  return (
    <div>
      <div className="card" style={{ borderColor: "var(--accent)" }}>
        <h2 style={{ fontSize: 16 }}>🤰 Analgesia neuroaxial de parto · {cs.ia}</h2>
        <p className="sub">Registro específico de parto. Puedes convertir a cesárea en cualquier momento.</p>
      </div>
      <TechniqueCard cs={cs} onToast={onToast} />
      <DosesCard cs={cs} onToast={onToast} />
      <PumpProgramCard cs={cs} onToast={onToast} />
      <DuringCard cs={cs} onToast={onToast} />
      <ClosureCard cs={cs} onToast={onToast} />
    </div>
  );
}

// ---------------- Técnica (epidural / combinada) ----------------
function TechniqueCard({ cs, onToast }: { cs: CaseState; onToast: (m: string) => void }) {
  const append = useStore((s) => s.append);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string | boolean | number>>({});
  const [time, setTime] = useState(nowLocalInput());
  const defs = TECHNIQUES.filter((t) => t.id === "epidural" || t.id === "combinada");

  function save(id: string) {
    const def = techniqueById(id);
    if (!def) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, "TECHNIQUE_ADDED", { id: rid("t"), type: id, label: def.label, details, at }, at);
    setOpenId(null);
    setDetails({});
    onToast("Técnica registrada");
  }

  return (
    <div className="card">
      <h2>Técnica</h2>
      {cs.techniques.length > 0 && (
        <div className="pill-list" style={{ marginBottom: 10 }}>
          {cs.techniques.map((t) => (
            <div className="pill" key={t.id}>
              <span className="t">{hhmm(t.at)}</span>
              <span className="m"><strong>{t.label}</strong></span>
            </div>
          ))}
        </div>
      )}
      <div className="chips">
        {defs.map((t) => (
          <button key={t.id} className={`chip ${openId === t.id ? "on" : ""}`} onClick={() => { setOpenId(openId === t.id ? null : t.id); setDetails({}); setTime(nowLocalInput()); }}>
            {t.label}
          </button>
        ))}
      </div>
      {openId && (
        <div className="card" style={{ marginTop: 12, background: "var(--bg)" }}>
          <div className="field">
            <label>Hora</label>
            <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          {techniqueById(openId)!.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={details[f.key]} onChange={(v) => setDetails((d) => ({ ...d, [f.key]: v }))} />
          ))}
          <button className="btn primary block" onClick={() => save(openId)}>Añadir técnica</button>
        </div>
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: TechniqueField; value: string | boolean | number | undefined; onChange: (v: string | boolean | number) => void }) {
  return (
    <div className="field">
      <label>{field.label}{field.unit ? ` (${field.unit})` : ""}</label>
      {field.type === "select" && (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">-</option>
          {field.options!.map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      {field.type === "yesno" && (
        <div className="yesno">
          <button className={`yes ${value === true ? "on" : ""}`} onClick={() => onChange(true)}>Sí</button>
          <button className={`no ${value === false ? "on" : ""}`} onClick={() => onChange(false)}>No</button>
        </div>
      )}
      {(field.type === "text" || field.type === "number") && (
        <input type="text" inputMode={field.type === "number" ? "decimal" : "text"} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ---------------- Dosis de prueba y de carga ----------------
function DoseForm({ cs, label, eventType, onToast }: { cs: CaseState; label: string; eventType: "LABOR_TEST_DOSE" | "LABOR_LOADING_DOSE"; onToast: (m: string) => void }) {
  const append = useStore((s) => s.append);
  const [drug, setDrug] = useState("Levobupivacaína");
  const [conc, setConc] = useState("");
  const [vol, setVol] = useState("");
  const [time, setTime] = useState(nowLocalInput());
  const c = num(conc), v = num(vol);
  const mg = c != null && v != null ? c * 10 * v : undefined; // 1% = 10 mg/ml
  const existing = eventType === "LABOR_TEST_DOSE" ? cs.labor.testDose : cs.labor.loadingDose;

  function save() {
    if (!drug || mg == null) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, eventType, { at, drug, concentration: c, volumeMl: v, doseMg: mg }, at);
    onToast(`${label} registrada`);
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="section-title" style={{ margin: "4px 0 6px" }}>{label}{existing ? ` · registrada (${formatNum(existing.doseMg)} mg)` : ""}</div>
      <div className="field"><label>Fármaco</label><input type="text" value={drug} onChange={(e) => setDrug(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>Concentración (%)</label><input inputMode="decimal" type="text" value={conc} onChange={(e) => setConc(e.target.value)} placeholder="Ej. 0,25" /></div>
        <div className="field"><label>Volumen (ml)</label><input inputMode="decimal" type="text" value={vol} onChange={(e) => setVol(e.target.value)} placeholder="Ej. 10" /></div>
      </div>
      <div className="field"><label>Hora</label><input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      {mg != null && <div className="calc-box"><div className="muted" style={{ fontSize: 13 }}>Dosis</div><div className="big">{formatNum(mg)} mg</div></div>}
      <button className="btn primary block" onClick={save} disabled={!drug || mg == null}>{existing ? "Actualizar" : "Registrar"}</button>
    </div>
  );
}
function DosesCard({ cs, onToast }: { cs: CaseState; onToast: (m: string) => void }) {
  return (
    <div className="card">
      <h2>Dosis inicial</h2>
      <DoseForm cs={cs} label="Dosis de prueba" eventType="LABOR_TEST_DOSE" onToast={onToast} />
      <DoseForm cs={cs} label="Dosis de carga" eventType="LABOR_LOADING_DOSE" onToast={onToast} />
    </div>
  );
}

// ---------------- Programación de la bomba ----------------
function PumpProgramCard({ cs, onToast }: { cs: CaseState; onToast: (m: string) => void }) {
  const append = useStore((s) => s.append);
  const [solId, setSolId] = useState(PUMP_SOLUTIONS[0].id);
  const sol = PUMP_SOLUTIONS.find((s) => s.id === solId) ?? PUMP_SOLUTIONS[0];
  const [laPct, setLaPct] = useState(String(sol.laPct));
  const [opioidUg, setOpioidUg] = useState(String(sol.opioidUgMl));
  const [piebVol, setPiebVol] = useState(String(PIEB_DEFAULT.volMl));
  const [piebInt, setPiebInt] = useState(String(PIEB_DEFAULT.intervalMin));
  const [pceaBolus, setPceaBolus] = useState(String(PCEA_DEFAULT.bolusMl));
  const [pceaLock, setPceaLock] = useState(String(PCEA_DEFAULT.lockoutMin));
  const [pceaMax, setPceaMax] = useState(String(PCEA_DEFAULT.hourlyMaxMl));
  const [time, setTime] = useState(nowLocalInput());

  function pickSol(id: string) {
    setSolId(id);
    const s = PUMP_SOLUTIONS.find((x) => x.id === id);
    if (s) { setLaPct(String(s.laPct)); setOpioidUg(String(s.opioidUgMl)); }
  }
  function save() {
    const at = isoFromLocalInput(time);
    append(cs.caseId, "PUMP_PROGRAM_SET", {
      id: rid("pp"), at, laName: sol.laName, laPct: num(laPct) ?? 0, opioidName: sol.opioidName, opioidUgMl: num(opioidUg) ?? 0,
      piebVolMl: num(piebVol) ?? 0, piebIntervalMin: num(piebInt) ?? 0, pceaBolusMl: num(pceaBolus) ?? 0, pceaLockoutMin: num(pceaLock) ?? 0, pceaHourlyMaxMl: num(pceaMax),
    }, at);
    setTime(nowLocalInput());
    onToast("Programación de la bomba registrada");
  }
  return (
    <div className="card">
      <h2>Programación de la bomba</h2>
      <p className="sub">Cada cambio se registra con su hora.</p>
      <div className="field">
        <label>Solución de mantenimiento</label>
        <div className="chips">
          {PUMP_SOLUTIONS.map((s) => (
            <button key={s.id} className={`chip ${solId === s.id ? "on" : ""}`} onClick={() => pickSol(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="row">
        <div className="field"><label>{sol.laName} (%)</label><input inputMode="decimal" type="text" value={laPct} onChange={(e) => setLaPct(e.target.value)} /></div>
        <div className="field"><label>{sol.opioidName} (µg/ml)</label><input inputMode="decimal" type="text" value={opioidUg} onChange={(e) => setOpioidUg(e.target.value)} /></div>
      </div>
      <div className="section-title" style={{ margin: "6px 0" }}>PIEB</div>
      <div className="row">
        <div className="field"><label>Volumen (ml)</label><input inputMode="decimal" type="text" value={piebVol} onChange={(e) => setPiebVol(e.target.value)} /></div>
        <div className="field"><label>Intervalo (min)</label><input inputMode="decimal" type="text" value={piebInt} onChange={(e) => setPiebInt(e.target.value)} /></div>
      </div>
      <div className="section-title" style={{ margin: "6px 0" }}>PCEA</div>
      <div className="row">
        <div className="field"><label>Bolo (ml)</label><input inputMode="decimal" type="text" value={pceaBolus} onChange={(e) => setPceaBolus(e.target.value)} /></div>
        <div className="field"><label>Cierre (min)</label><input inputMode="decimal" type="text" value={pceaLock} onChange={(e) => setPceaLock(e.target.value)} /></div>
      </div>
      <div className="field"><label>Límite horario (ml)</label><input inputMode="decimal" type="text" value={pceaMax} onChange={(e) => setPceaMax(e.target.value)} /></div>
      <div className="field"><label>Hora</label><input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      <button className="btn primary block" onClick={save}>Registrar programación</button>

      {cs.labor.pumpPrograms.length > 0 && (
        <div className="pill-list" style={{ marginTop: 12 }}>
          {cs.labor.pumpPrograms.slice().sort((a, b) => a.at.localeCompare(b.at)).map((p) => (
            <div className="pill" key={p.id}>
              <span className="t">{hhmm(p.at)}</span>
              <span className="m">
                <strong>{p.laName} {formatNum(p.laPct)} %{p.opioidName ? ` + ${p.opioidName} ${formatNum(p.opioidUgMl ?? 0)} µg/ml` : ""}</strong>
                <div className="sm">PIEB {formatNum(p.piebVolMl)} ml/{formatNum(p.piebIntervalMin)} min · PCEA {formatNum(p.pceaBolusMl)} ml/{formatNum(p.pceaLockoutMin)} min{p.pceaHourlyMaxMl ? ` · máx ${formatNum(p.pceaHourlyMaxMl)} ml/h` : ""}</div>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Durante la analgesia ----------------
function DuringCard({ cs, onToast }: { cs: CaseState; onToast: (m: string) => void }) {
  const append = useStore((s) => s.append);
  const totals = useMemo(() => laborTotals(cs), [cs]);

  // Lectura de bomba
  const [rTotal, setRTotal] = useState("");
  const [rReq, setRReq] = useState("");
  const [rGiven, setRGiven] = useState("");
  const [rTime, setRTime] = useState(nowLocalInput());
  function saveReading() {
    const t = num(rTotal);
    if (t == null) return;
    const at = isoFromLocalInput(rTime);
    append(cs.caseId, "PUMP_READING", { id: rid("rd"), at, totalMl: t, pceaRequested: num(rReq), pceaGiven: num(rGiven) }, at);
    setRTotal(""); setRReq(""); setRGiven(""); setRTime(nowLocalInput());
    onToast("Lectura de bomba registrada");
  }

  // Rescate
  const [rsDrug, setRsDrug] = useState("Levobupivacaína");
  const [rsConc, setRsConc] = useState("");
  const [rsVol, setRsVol] = useState("");
  const [rsTime, setRsTime] = useState(nowLocalInput());
  const rsMg = num(rsConc) != null && num(rsVol) != null ? num(rsConc)! * 10 * num(rsVol)! : undefined;
  function saveRescue() {
    if (!rsDrug || rsMg == null) return;
    const at = isoFromLocalInput(rsTime);
    append(cs.caseId, "LABOR_RESCUE_BOLUS", { id: rid("rs"), at, drug: rsDrug, concentration: num(rsConc), volumeMl: num(rsVol), doseMg: rsMg }, at);
    setRsConc(""); setRsVol(""); setRsTime(nowLocalInput());
    onToast("Rescate registrado");
  }

  // Valoración rápida (precargada con la última)
  const sortedAssessments = cs.labor.assessments.slice().sort((a, b) => a.at.localeCompare(b.at));
  const last = sortedAssessments[sortedAssessments.length - 1];
  const [evn, setEvn] = useState("");
  const [sensL, setSensL] = useState(last?.sensLeft ?? "");
  const [sensR, setSensR] = useState(last?.sensRight ?? "");
  const [brom, setBrom] = useState(last?.bromage ?? "");
  const [tas, setTas] = useState("");
  const [tad, setTad] = useState("");
  const [fc, setFc] = useState("");
  const [aTime, setATime] = useState(nowLocalInput());
  function saveAssessment() {
    const at = isoFromLocalInput(aTime);
    append(cs.caseId, "LABOR_ASSESSMENT", { id: rid("as"), at, evn: num(evn), sensLeft: sensL || undefined, sensRight: sensR || undefined, bromage: brom || undefined, tas: num(tas), tad: num(tad), fc: num(fc) }, at);
    setEvn(""); setTas(""); setTad(""); setFc(""); setATime(nowLocalInput());
    onToast("Valoración registrada");
  }

  // Test de deambulación
  const [b6, setB6] = useState<boolean | undefined>();
  const [toe, setToe] = useState<boolean | undefined>();
  const [romb, setRomb] = useState<boolean | undefined>();
  const [auth, setAuth] = useState<boolean | undefined>();
  const [tTime, setTTime] = useState(nowLocalInput());
  function saveTest() {
    const at = isoFromLocalInput(tTime);
    append(cs.caseId, "AMBULATION_TEST", { id: rid("at"), at, bromage6: b6, toeTest: toe, romberg: romb, authorized: auth }, at);
    setB6(undefined); setToe(undefined); setRomb(undefined); setAuth(undefined); setTTime(nowLocalInput());
    onToast("Test de deambulación registrado");
  }

  const YesNo = ({ v, on }: { v?: boolean; on: (b: boolean) => void }) => (
    <div className="yesno">
      <button className={`yes ${v === true ? "on" : ""}`} onClick={() => on(true)}>Superado</button>
      <button className={`no ${v === false ? "on" : ""}`} onClick={() => on(false)}>No</button>
    </div>
  );

  return (
    <div className="card">
      <h2>Durante la analgesia</h2>

      <div className="section-title" style={{ margin: "4px 0 6px" }}>Lectura de la bomba</div>
      <div className="row">
        <div className="field"><label>Total infundido (ml)</label><input inputMode="decimal" type="text" value={rTotal} onChange={(e) => setRTotal(e.target.value)} /></div>
        <div className="field"><label>PCEA solicitados</label><input inputMode="decimal" type="text" value={rReq} onChange={(e) => setRReq(e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="field"><label>PCEA administrados</label><input inputMode="decimal" type="text" value={rGiven} onChange={(e) => setRGiven(e.target.value)} /></div>
        <div className="field"><label>Hora</label><input type="datetime-local" value={rTime} onChange={(e) => setRTime(e.target.value)} /></div>
      </div>
      <button className="btn block" onClick={saveReading} disabled={num(rTotal) == null}>Registrar lectura</button>

      <div className="section-title" style={{ margin: "14px 0 6px" }}>Bolo de rescate (anestesiólogo)</div>
      <div className="field"><label>Fármaco</label><input type="text" value={rsDrug} onChange={(e) => setRsDrug(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>Concentración (%)</label><input inputMode="decimal" type="text" value={rsConc} onChange={(e) => setRsConc(e.target.value)} /></div>
        <div className="field"><label>Volumen (ml)</label><input inputMode="decimal" type="text" value={rsVol} onChange={(e) => setRsVol(e.target.value)} /></div>
      </div>
      <div className="field"><label>Hora</label><input type="datetime-local" value={rsTime} onChange={(e) => setRsTime(e.target.value)} /></div>
      {rsMg != null && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Dosis: {formatNum(rsMg)} mg</div>}
      <button className="btn block" onClick={saveRescue} disabled={!rsDrug || rsMg == null}>Registrar rescate</button>

      <div className="section-title" style={{ margin: "14px 0 6px" }}>Valoración rápida</div>
      <div className="row">
        <div className="field"><label>Dolor (EVN 0-10)</label><input inputMode="decimal" type="text" value={evn} onChange={(e) => setEvn(e.target.value)} /></div>
        <div className="field"><label>Bromage modificado</label>
          <select value={brom} onChange={(e) => setBrom(e.target.value)}>
            <option value="">-</option>
            {BROMAGE_MOD.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field"><label>Nivel sensitivo izquierdo</label>
          <select value={sensL} onChange={(e) => setSensL(e.target.value)}><option value="">-</option>{DERMATOMES.map((d) => <option key={d}>{d}</option>)}</select>
        </div>
        <div className="field"><label>Nivel sensitivo derecho</label>
          <select value={sensR} onChange={(e) => setSensR(e.target.value)}><option value="">-</option>{DERMATOMES.map((d) => <option key={d}>{d}</option>)}</select>
        </div>
      </div>
      {isLateralized(sensL, sensR) && <div className="alert danger">Posible bloqueo lateralizado: los lados difieren en más de dos dermatomas.</div>}
      <div className="row">
        <div className="field"><label>TAS</label><input inputMode="decimal" type="text" value={tas} onChange={(e) => setTas(e.target.value)} /></div>
        <div className="field"><label>TAD</label><input inputMode="decimal" type="text" value={tad} onChange={(e) => setTad(e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="field"><label>FC</label><input inputMode="decimal" type="text" value={fc} onChange={(e) => setFc(e.target.value)} /></div>
        <div className="field"><label>Hora</label><input type="datetime-local" value={aTime} onChange={(e) => setATime(e.target.value)} /></div>
      </div>
      <button className="btn block" onClick={saveAssessment}>Registrar valoración</button>

      <div className="section-title" style={{ margin: "14px 0 6px" }}>Test de deambulación</div>
      <div className="field"><label>Bromage 6 (flexión de rodillas en bipedestación)</label><YesNo v={b6} on={setB6} /></div>
      <div className="field"><label>Toe test (elevación del primer dedo)</label><YesNo v={toe} on={setToe} /></div>
      <div className="field"><label>Bipedestación asistida + Romberg</label><YesNo v={romb} on={setRomb} /></div>
      <div className="field"><label>Deambulación autorizada</label>
        <div className="yesno">
          <button className={`yes ${auth === true ? "on" : ""}`} onClick={() => setAuth(true)}>Sí</button>
          <button className={`no ${auth === false ? "on" : ""}`} onClick={() => setAuth(false)}>No</button>
        </div>
      </div>
      <div className="field"><label>Hora</label><input type="datetime-local" value={tTime} onChange={(e) => setTTime(e.target.value)} /></div>
      <button className="btn block" onClick={saveTest}>Registrar test</button>

      <div className="alert" style={{ marginTop: 14 }}>
        <strong>Totales (orientativos):</strong> anestésico local ≈ {formatNum(totals.alMg)} mg · opioide ≈ {formatNum(totals.opioidUg)} µg
      </div>
    </div>
  );
}

// ---------------- Cierre + conversión ----------------
function ClosureCard({ cs, onToast }: { cs: CaseState; onToast: (m: string) => void }) {
  const append = useStore((s) => s.append);
  const L = cs.labor;
  const [delType, setDelType] = useState(L.delivery?.type ?? "");
  const [instr, setInstr] = useState(L.delivery?.instrumental ?? "");
  const [delTime, setDelTime] = useState(nowLocalInput());
  const [catTime, setCatTime] = useState(nowLocalInput());
  const [catIntact, setCatIntact] = useState<boolean | undefined>(L.catheter?.intact);
  const comp: ProtectionInfo = {}; // placeholder (no usado)
  void comp;
  const complications = L.complications ?? {};

  function saveDelivery() {
    if (!delType) return;
    const at = isoFromLocalInput(delTime);
    append(cs.caseId, "LABOR_DELIVERY", { at, type: delType, ...(delType === "instrumental" && instr ? { instrumental: instr } : {}) }, at);
    onToast("Parto registrado");
  }
  function saveCatheter() {
    const at = isoFromLocalInput(catTime);
    append(cs.caseId, "CATHETER_REMOVED", { at, intact: catIntact }, at);
    onToast("Retirada del catéter registrada");
  }
  function toggleComplication(key: string) {
    const next = { ...complications, [key]: !complications[key as keyof typeof complications] };
    append(cs.caseId, "LABOR_COMPLICATIONS_SET", next as Record<string, unknown>);
  }
  function setOther(text: string) {
    append(cs.caseId, "LABOR_COMPLICATIONS_SET", { ...complications, other: text } as Record<string, unknown>);
  }

  function hasReading(): boolean {
    return cs.labor.readings.length > 0;
  }
  function finishLabor() {
    if (!hasReading()) {
      window.alert("La lectura de la bomba es obligatoria al cerrar el caso. Registra primero el volumen total infundido y los bolos PCEA.");
      return;
    }
    if (!window.confirm("¿Finalizar la analgesia de parto y cerrar el caso?")) return;
    append(cs.caseId, "SURGERY_ENDED", {});
    onToast("Analgesia de parto finalizada");
  }

  // Conversión a cesárea: pide la lectura final de la bomba antes de continuar.
  const [convOpen, setConvOpen] = useState(false);
  const [cvTotal, setCvTotal] = useState("");
  const [cvReq, setCvReq] = useState("");
  const [cvGiven, setCvGiven] = useState("");
  function doConvert() {
    const t = num(cvTotal);
    if (t == null) {
      window.alert("Introduce el volumen total infundido por la bomba para completar el total de la analgesia.");
      return;
    }
    const now = new Date().toISOString();
    append(cs.caseId, "PUMP_READING", { id: rid("rd"), at: now, totalMl: t, pceaRequested: num(cvReq), pceaGiven: num(cvGiven) }, now);
    append(cs.caseId, "CONVERT_TO_CESAREAN", {}, now);
    onToast("Convertido a cesárea · continúa como caso de quirófano");
  }

  return (
    <div className="card">
      <h2>Cierre</h2>

      <div className="section-title" style={{ margin: "4px 0 6px" }}>Parto</div>
      <div className="field"><label>Tipo de parto</label>
        <select value={delType} onChange={(e) => setDelType(e.target.value)}>
          <option value="">-</option>
          {DELIVERY_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      {delType === "instrumental" && (
        <div className="field"><label>Instrumental</label>
          <select value={instr} onChange={(e) => setInstr(e.target.value)}>
            <option value="">-</option>
            {INSTRUMENTAL_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
      )}
      <div className="field"><label>Hora del parto</label><input type="datetime-local" value={delTime} onChange={(e) => setDelTime(e.target.value)} /></div>
      <button className="btn block" onClick={saveDelivery} disabled={!delType}>Registrar parto</button>
      {L.delivery && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Registrado: {deliveryLabel(L.delivery.type)}{L.delivery.instrumental ? ` (${instrumentalLabel(L.delivery.instrumental)})` : ""} · {hhmm(L.delivery.at)}</div>}

      <div className="section-title" style={{ margin: "14px 0 6px" }}>Retirada del catéter</div>
      <div className="row">
        <div className="field"><label>Hora</label><input type="datetime-local" value={catTime} onChange={(e) => setCatTime(e.target.value)} /></div>
        <div className="field"><label>Catéter íntegro</label>
          <div className="yesno">
            <button className={`yes ${catIntact === true ? "on" : ""}`} onClick={() => setCatIntact(true)}>Sí</button>
            <button className={`no ${catIntact === false ? "on" : ""}`} onClick={() => setCatIntact(false)}>No</button>
          </div>
        </div>
      </div>
      <button className="btn block" onClick={saveCatheter}>Registrar retirada</button>

      <div className="section-title" style={{ margin: "14px 0 6px" }}>Complicaciones</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {LABOR_COMPLICATIONS.map((c) => (
          <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={!!complications[c.key as keyof typeof complications]} onChange={() => toggleComplication(c.key)} />
            {c.label}
          </label>
        ))}
      </div>
      <div className="field" style={{ marginTop: 8 }}><label>Otras complicaciones</label><input type="text" value={complications.other ?? ""} onChange={(e) => setOther(e.target.value)} /></div>

      <button className="btn primary block lg" style={{ marginTop: 16 }} onClick={finishLabor}>Finalizar analgesia de parto</button>

      <div className="section-title" style={{ margin: "18px 0 6px" }}>Conversión a cesárea</div>
      <p className="sub">El mismo caso continúa como caso de quirófano, conservando todo lo registrado.</p>
      {!convOpen ? (
        <button className="btn danger block" onClick={() => { setConvOpen(true); setCvTotal(""); }}>Convertir a cesárea</button>
      ) : (
        <div className="card" style={{ background: "var(--bg)" }}>
          <div className="alert">Lectura final de la bomba (para completar el total de la analgesia de parto).</div>
          <div className="row">
            <div className="field"><label>Total infundido (ml)</label><input inputMode="decimal" type="text" value={cvTotal} onChange={(e) => setCvTotal(e.target.value)} autoFocus /></div>
            <div className="field"><label>PCEA solicitados</label><input inputMode="decimal" type="text" value={cvReq} onChange={(e) => setCvReq(e.target.value)} /></div>
          </div>
          <div className="field"><label>PCEA administrados</label><input inputMode="decimal" type="text" value={cvGiven} onChange={(e) => setCvGiven(e.target.value)} /></div>
          <div className="grid2">
            <button className="btn ghost lg" onClick={() => setConvOpen(false)}>Cancelar</button>
            <button className="btn danger lg" onClick={doConvert} disabled={num(cvTotal) == null}>Convertir y continuar</button>
          </div>
        </div>
      )}
    </div>
  );
}
