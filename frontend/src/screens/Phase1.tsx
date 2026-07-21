import { useEffect, useState } from "react";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { isoFromLocalInput, isoToLocalInput } from "../utils/time";

interface Props {
  cs: CaseState;
}

export function Phase1({ cs }: Props) {
  const append = useStore((s) => s.append);
  const [allergies, setAllergies] = useState(cs.preop.allergies);
  const [height, setHeight] = useState(cs.preop.heightCm ? String(cs.preop.heightCm) : "");
  const [weight, setWeight] = useState(cs.preop.weightKg ? String(cs.preop.weightKg) : "");
  const [history, setHistory] = useState(cs.preop.history);
  const [medication, setMedication] = useState(cs.preop.medication);
  const [antibiotic, setAntibiotic] = useState(cs.preop.antibiotic ?? "");
  const [antibioticTime, setAntibioticTime] = useState(
    cs.preop.antibioticTime ? isoToLocalInput(cs.preop.antibioticTime) : "",
  );

  // Autosave con debounce: cada cambio genera un evento PREOP_INFO_RECORDED.
  useEffect(() => {
    const h = setTimeout(() => {
      append(cs.caseId, "PREOP_INFO_RECORDED", {
        allergies,
        heightCm: height ? parseFloat(height.replace(",", ".")) : null,
        weightKg: weight ? parseFloat(weight.replace(",", ".")) : null,
        history,
        medication,
        antibiotic,
        antibioticTime: antibiotic.trim() && antibioticTime ? isoFromLocalInput(antibioticTime) : null,
      });
    }, 700);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allergies, height, weight, history, medication, antibiotic, antibioticTime]);

  return (
    <div>
      <div className="card">
        <h2>Fase 1 · Área de preparación</h2>
        <p className="sub">Todos los campos son obligatorios. "No relevante" es una respuesta válida.</p>

        <div className="field">
          <label>
            Alergias <span className="req">*</span>
          </label>
          <textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Ej. Penicilina / No conocidas" />
        </div>

        <div className="row">
          <div className="field">
            <label>
              Talla (cm) <span className="req">*</span>
            </label>
            <input inputMode="decimal" type="text" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div className="field">
            <label>
              Peso (kg) <span className="req">*</span>
            </label>
            <input inputMode="decimal" type="text" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>
            Antecedentes relevantes <span className="req">*</span>
          </label>
          <textarea value={history} onChange={(e) => setHistory(e.target.value)} placeholder="Ej. HTA, DM2 / Sin antecedentes" />
        </div>

        <div className="field">
          <label>
            Medicación relevante <span className="req">*</span>
          </label>
          <textarea value={medication} onChange={(e) => setMedication(e.target.value)} placeholder="Ej. Enalapril / Ninguna" />
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16 }}>Profilaxis antibiótica</h2>
        <p className="sub">Opcional. Indica el antibiótico y la hora de administración.</p>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Antibiótico</label>
            <input type="text" value={antibiotic} onChange={(e) => setAntibiotic(e.target.value)} placeholder="Ej. Cefazolina 2 g" />
          </div>
          <div className="field">
            <label>Hora de administración</label>
            <input type="datetime-local" value={antibioticTime} onChange={(e) => setAntibioticTime(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function phase1Complete(cs: CaseState): boolean {
  const p = cs.preop;
  return (
    p.allergies.trim().length > 0 &&
    p.heightCm != null &&
    p.heightCm > 0 &&
    p.weightKg != null &&
    p.weightKg > 0 &&
    p.history.trim().length > 0 &&
    p.medication.trim().length > 0
  );
}
