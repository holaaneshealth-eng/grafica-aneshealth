import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { useStore } from "../store/store";
import type { CaseState, EndStateInfo } from "../domain/events";
import { drugByName } from "../domain/drugs";
import { CONSCIOUSNESS, AIRWAY, OXYGEN, DESTINATION, BROMAGE, TOF_OPTIONS } from "../domain/positions";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

// Último valor registrado de una constante (código de monitorización).
function lastVital(cs: CaseState, code: string): number | undefined {
  const sorted = cs.vitals.slice().sort((a, b) => a.at.localeCompare(b.at));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i].values[code];
    if (v != null) return v;
  }
  return undefined;
}

const numOrUndef = (s: string): number | undefined => {
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) ? n : undefined;
};

export function AnesthesiaEndModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const prev = cs.endState ?? {};

  // Condicionales: TOF si hay cualquier relajante; Bromage si hay técnica neuroaxial.
  const hasRelajante = useMemo(() => {
    const isNmb = (drug: string) => drugByName(drug)?.group === "Relajante";
    return cs.boluses.some((b) => isNmb(b.drug)) || cs.infusions.some((i) => isNmb(i.drug));
  }, [cs.boluses, cs.infusions]);
  const hasNeuraxial = useMemo(
    () => cs.techniques.some((t) => ["intradural", "epidural", "combinada"].includes(t.type)),
    [cs.techniques],
  );

  const [consciousness, setConsciousness] = useState(prev.consciousness ?? "");
  const [airway, setAirway] = useState(prev.airway ?? "");
  const [spontaneous, setSpontaneous] = useState<boolean | undefined>(prev.spontaneousVentilation);
  const [oxygen, setOxygen] = useState(prev.oxygen ?? "");
  const [tas, setTas] = useState(String(prev.tas ?? lastVital(cs, "TAS") ?? ""));
  const [tad, setTad] = useState(String(prev.tad ?? lastVital(cs, "TAD") ?? ""));
  const [fc, setFc] = useState(String(prev.fc ?? lastVital(cs, "FC") ?? ""));
  const [spo2, setSpo2] = useState(String(prev.spo2 ?? lastVital(cs, "SPO2") ?? ""));
  const [temp, setTemp] = useState(String(prev.temp ?? lastVital(cs, "TEMP") ?? ""));
  const [tofOk, setTofOk] = useState(prev.tofOk ?? "");
  const [evn, setEvn] = useState(prev.evn != null ? String(prev.evn) : "");
  const [nausea, setNausea] = useState<boolean | undefined>(prev.nausea);
  const [bromage, setBromage] = useState(prev.bromage ?? "");
  const [destination, setDestination] = useState(prev.destination ?? "");
  const [notes, setNotes] = useState(prev.notes ?? "");

  function save() {
    const payload: EndStateInfo = {
      at: new Date().toISOString(),
      ...(consciousness ? { consciousness } : {}),
      ...(airway ? { airway } : {}),
      ...(spontaneous != null ? { spontaneousVentilation: spontaneous } : {}),
      ...(oxygen ? { oxygen } : {}),
      ...(numOrUndef(tas) != null ? { tas: numOrUndef(tas) } : {}),
      ...(numOrUndef(tad) != null ? { tad: numOrUndef(tad) } : {}),
      ...(numOrUndef(fc) != null ? { fc: numOrUndef(fc) } : {}),
      ...(numOrUndef(spo2) != null ? { spo2: numOrUndef(spo2) } : {}),
      ...(numOrUndef(temp) != null ? { temp: numOrUndef(temp) } : {}),
      ...(hasRelajante && tofOk ? { tofOk } : {}),
      ...(evn !== "" && numOrUndef(evn) != null ? { evn: numOrUndef(evn) } : {}),
      ...(nausea != null ? { nausea } : {}),
      ...(hasNeuraxial && bromage ? { bromage } : {}),
      ...(destination ? { destination } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    append(cs.caseId, "ANESTHESIA_END_STATE_SET", payload as unknown as Record<string, unknown>);
    onDone("Estado al finalizar registrado");
    onClose();
  }

  const YesNo = ({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) => (
    <div className="yesno">
      <button className={`yes ${value === true ? "on" : ""}`} onClick={() => onChange(true)}>Sí</button>
      <button className={`no ${value === false ? "on" : ""}`} onClick={() => onChange(false)}>No</button>
    </div>
  );

  return (
    <Modal title="Estado al finalizar la anestesia" onClose={onClose}>
      <div className="field">
        <label>Nivel de consciencia</label>
        <select value={consciousness} onChange={(e) => setConsciousness(e.target.value)}>
          <option value="">-</option>
          {CONSCIOUSNESS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Vía aérea</label>
        <select value={airway} onChange={(e) => setAirway(e.target.value)}>
          <option value="">-</option>
          {AIRWAY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <div className="row">
        <div className="field">
          <label>Ventilación espontánea</label>
          <YesNo value={spontaneous} onChange={setSpontaneous} />
        </div>
        <div className="field">
          <label>Oxigenoterapia</label>
          <select value={oxygen} onChange={(e) => setOxygen(e.target.value)}>
            <option value="">-</option>
            {OXYGEN.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="section-title" style={{ margin: "8px 0 4px" }}>Constantes a la salida (últimos valores, editables)</div>
      <div className="row">
        <div className="field">
          <label>TAS (mmHg)</label>
          <input inputMode="decimal" type="text" value={tas} onChange={(e) => setTas(e.target.value)} />
        </div>
        <div className="field">
          <label>TAD (mmHg)</label>
          <input inputMode="decimal" type="text" value={tad} onChange={(e) => setTad(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>FC (lpm)</label>
          <input inputMode="decimal" type="text" value={fc} onChange={(e) => setFc(e.target.value)} />
        </div>
        <div className="field">
          <label>SpO₂ (%)</label>
          <input inputMode="decimal" type="text" value={spo2} onChange={(e) => setSpo2(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Temperatura (°C)</label>
        <input inputMode="decimal" type="text" value={temp} onChange={(e) => setTemp(e.target.value)} />
      </div>

      {hasRelajante && (
        <div className="field">
          <label>Reversión del bloqueo neuromuscular</label>
          <select value={tofOk} onChange={(e) => setTofOk(e.target.value)}>
            <option value="">-</option>
            {TOF_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div className="row">
        <div className="field">
          <label>Dolor (EVN 0-10)</label>
          <input inputMode="decimal" type="text" value={evn} onChange={(e) => setEvn(e.target.value)} placeholder="0-10" />
        </div>
        <div className="field">
          <label>Náuseas / vómitos</label>
          <YesNo value={nausea} onChange={setNausea} />
        </div>
      </div>

      {hasNeuraxial && (
        <div className="field">
          <label>Bloqueo motor (Bromage)</label>
          <select value={bromage} onChange={(e) => setBromage(e.target.value)}>
            <option value="">-</option>
            {BROMAGE.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div className="field">
        <label>Destino</label>
        <select value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="">-</option>
          {DESTINATION.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Observaciones</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <button className="btn primary block lg" onClick={save}>
        Guardar estado al finalizar
      </button>
    </Modal>
  );
}
