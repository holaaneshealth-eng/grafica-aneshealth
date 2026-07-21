import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { DRUGS, DRUG_UNITS, drugByName } from "../domain/drugs";
import { computeInfusion, formatNum, type DoseRateUnit, type MassUnit } from "../domain/calculations";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { nowLocalInput, isoFromLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const DOSE_UNITS: DoseRateUnit[] = ["mcg/kg/min", "mcg/kg/h", "mg/kg/h", "mg/kg/min"];

export function DrugModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [mode, setMode] = useState<"bolus" | "infusion">("bolus");
  const [drug, setDrug] = useState("");
  const [time, setTime] = useState(nowLocalInput());

  // Bolus
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState("mg");

  // Perfusión
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<MassUnit>("mg");
  const [diluent, setDiluent] = useState("");
  const [rate, setRate] = useState("");
  const [doseUnit, setDoseUnit] = useState<DoseRateUnit>("mcg/kg/min");
  const [weight, setWeight] = useState(cs.preop.weightKg ? String(cs.preop.weightKg) : "");

  // Gas anestésico (sevoflurano): solo % en aire espirado
  const [gasPercent, setGasPercent] = useState("");

  const def = drugByName(drug);
  const isGas = !!def?.gas;
  const isPropofol = drug.trim().toLowerCase() === "propofol";

  // Comprobación de alergia cruzada frente a lo registrado en Fase 1.
  const allergyHit = useMemo(() => {
    const a = cs.preop.allergies.trim().toLowerCase();
    const d = drug.trim().toLowerCase();
    if (!a || d.length < 3) return false;
    return a.includes(d) || d.split(/\s+/).some((w) => w.length >= 4 && a.includes(w));
  }, [cs.preop.allergies, drug]);

  function pickDrug(name: string) {
    setDrug(name);
    const d = drugByName(name);
    if (d) {
      setUnit(d.defaultUnit);
      if (d.defaultUnit === "mg" || d.defaultUnit === "mcg") setAmountUnit(d.defaultUnit as MassUnit);
      if (d.infusionDoseUnit) setDoseUnit(d.infusionDoseUnit as DoseRateUnit);
      if (d.gas) setMode("infusion"); // los gases solo se registran como perfusión
    }
  }

  const calc = useMemo(() => {
    const a = parseFloat(amount.replace(",", "."));
    const v = parseFloat(diluent.replace(",", "."));
    const r = parseFloat(rate.replace(",", "."));
    const w = parseFloat(weight.replace(",", "."));
    if (!a || !v || !w) return null;
    return computeInfusion({
      amount: a,
      amountUnit,
      diluentVolumeMl: v,
      rateMlH: isFinite(r) ? r : 0,
      weightKg: w,
      doseUnit,
    });
  }, [amount, diluent, rate, weight, amountUnit, doseUnit]);

  // Para propofol mostramos también mg/kg/h además de la unidad elegida.
  const propofolMgKgH = useMemo(() => {
    if (!isPropofol) return null;
    const a = parseFloat(amount.replace(",", "."));
    const v = parseFloat(diluent.replace(",", "."));
    const r = parseFloat(rate.replace(",", "."));
    const w = parseFloat(weight.replace(",", "."));
    if (!a || !v || !w || !r) return null;
    return computeInfusion({ amount: a, amountUnit, diluentVolumeMl: v, rateMlH: r, weightKg: w, doseUnit: "mg/kg/h" });
  }, [isPropofol, amount, diluent, rate, weight, amountUnit]);

  function saveBolus() {
    const d = parseFloat(dose.replace(",", "."));
    if (!drug || !d) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, "DRUG_BOLUS", { id: rid(), drug, dose: d, unit, at }, at);
    onDone(`${drug} ${formatNum(d)} ${unit} registrado`);
    onClose();
  }

  function saveGasInfusion() {
    const pct = parseFloat(gasPercent.replace(",", "."));
    if (!drug || !pct) return;
    const at = isoFromLocalInput(time);
    append(
      cs.caseId,
      "INFUSION_STARTED",
      {
        id: rid(),
        drug,
        gas: true,
        gasPercent: pct,
        amount: 0,
        amountUnit: "%",
        diluentVolumeMl: 0,
        concentration: pct,
        concentrationUnit: "% esp",
        rateMlH: 0,
        weightBasedDose: 0,
        doseUnit: "% esp",
        summary: `${formatNum(pct)} % (espirado)`,
        startedAt: at,
        active: true,
      },
      at,
    );
    onDone(`Sevoflurano ${formatNum(pct)}% iniciado`);
    onClose();
  }

  function saveInfusion() {
    if (isGas) return saveGasInfusion();
    if (!drug || !calc) return;
    const w = parseFloat(weight.replace(",", "."));
    if (w && w !== cs.preop.weightKg) {
      append(cs.caseId, "WEIGHT_UPDATED", { weightKg: w });
    }
    const at = isoFromLocalInput(time);
    // Resumen: siempre ml/h + dosis ponderada; para propofol añadimos mg/kg/h.
    let summary = calc.summary;
    if (isPropofol && propofolMgKgH && !calc.doseUnit.startsWith("mg/kg/h")) {
      summary = `${calc.summary} · ${formatNum(propofolMgKgH.weightBasedDose)} mg/kg/h`;
    }
    append(
      cs.caseId,
      "INFUSION_STARTED",
      {
        id: rid(),
        drug,
        amount: parseFloat(amount.replace(",", ".")),
        amountUnit,
        diluentVolumeMl: parseFloat(diluent.replace(",", ".")),
        concentration: calc.concentration,
        concentrationUnit: calc.concentrationUnit,
        rateMlH: parseFloat(rate.replace(",", ".")) || 0,
        weightBasedDose: calc.weightBasedDose,
        doseUnit: calc.doseUnit,
        summary,
        startedAt: at,
        active: true,
      },
      at,
    );
    onDone(`Perfusión ${drug} iniciada`);
    onClose();
  }

  return (
    <Modal title="Administrar fármaco" onClose={onClose}>
      <div className="seg">
        <button className={mode === "bolus" ? "on" : ""} onClick={() => setMode("bolus")} disabled={isGas}>
          Bolus
        </button>
        <button className={mode === "infusion" ? "on" : ""} onClick={() => setMode("infusion")}>
          Perfusión
        </button>
      </div>

      <div className="field">
        <label>Fármaco {drug && <span className="muted">· grupo {def?.group ?? "libre"}</span>}</label>
        <div className="chips" style={{ marginBottom: 10 }}>
          {DRUGS.map((d) => (
            <button key={d.name} className={`chip ${drug === d.name ? "on" : ""}`} onClick={() => pickDrug(d.name)}>
              {d.name}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Otro fármaco (escribe el nombre)"
          value={drug}
          onChange={(e) => setDrug(e.target.value)}
        />
      </div>

      {allergyHit && (
        <div className="alert danger">
          Aviso de seguridad: este fármaco podría coincidir con una alergia registrada ("{cs.preop.allergies}"). Verifica
          antes de administrar.
        </div>
      )}

      {/* Hora vigente por defecto, editable */}
      <TimeField value={time} onChange={setTime} />

      {mode === "bolus" ? (
        <>
          {def?.commonBolus && (
            <div className="field">
              <label>Dosis frecuentes</label>
              <div className="chips">
                {def.commonBolus.map((b) => (
                  <button key={b} className={`chip ${dose === String(b) ? "on" : ""}`} onClick={() => setDose(String(b))}>
                    {b} {def.defaultUnit}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <div className="field">
              <label>Dosis</label>
              <input inputMode="decimal" type="text" value={dose} onChange={(e) => setDose(e.target.value)} />
            </div>
            <div className="field">
              <label>Unidad</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                {DRUG_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn primary block lg" onClick={saveBolus} disabled={!drug || !dose}>
            Registrar bolus
          </button>
        </>
      ) : isGas ? (
        <>
          <div className="alert">
            Gas anestésico: registra únicamente el porcentaje en aire espirado. Marca el fin de la perfusión cuando se
            suspenda.
          </div>
          <div className="field">
            <label>% en aire espirado</label>
            <input inputMode="decimal" type="text" value={gasPercent} onChange={(e) => setGasPercent(e.target.value)} placeholder="Ej. 2,0" />
          </div>
          <button className="btn primary block lg" onClick={saveGasInfusion} disabled={!drug || !gasPercent}>
            Iniciar sevoflurano
          </button>
        </>
      ) : (
        <>
          <div className="row">
            <div className="field">
              <label>Principio activo</label>
              <input inputMode="decimal" type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label>Unidad</label>
              <select value={amountUnit} onChange={(e) => setAmountUnit(e.target.value as MassUnit)}>
                <option value="mg">mg</option>
                <option value="mcg">mcg</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Volumen del disolvente (ml)</label>
            <input inputMode="decimal" type="text" value={diluent} onChange={(e) => setDiluent(e.target.value)} />
          </div>

          {calc && (
            <div className="calc-box">
              <div className="muted" style={{ fontSize: 13 }}>Concentración final</div>
              <div className="big">
                {formatNum(calc.concentration)} {calc.concentrationUnit}
              </div>
            </div>
          )}

          <div className="row">
            <div className="field">
              <label>Ritmo (ml/h)</label>
              <input inputMode="decimal" type="text" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="field">
              <label>Peso (kg)</label>
              <input inputMode="decimal" type="text" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Expresar dosis en</label>
            <select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value as DoseRateUnit)}>
              {DOSE_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>

          {calc && rate && (
            <div className="calc-box">
              <div className="muted" style={{ fontSize: 13 }}>Se conservan ambos datos</div>
              <div className="big">{calc.summary}</div>
              {isPropofol && propofolMgKgH && !doseUnit.startsWith("mg/kg/h") && (
                <div className="big" style={{ fontSize: 18 }}>
                  {formatNum(propofolMgKgH.weightBasedDose)} mg/kg/h
                </div>
              )}
            </div>
          )}
          {!weight && <div className="alert danger">Introduce el peso para calcular la dosis ponderada.</div>}

          <button className="btn primary block lg" onClick={saveInfusion} disabled={!drug || !calc}>
            Iniciar perfusión
          </button>
        </>
      )}
    </Modal>
  );
}

function rid(): string {
  return "r-" + Math.random().toString(36).slice(2, 10);
}
