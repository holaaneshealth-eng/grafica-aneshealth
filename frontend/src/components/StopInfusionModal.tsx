import { useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { useStore } from "../store/store";
import type { CaseState } from "../domain/events";
import { hhmm, nowLocalInput, isoFromLocalInput } from "../utils/time";
import { formatNum } from "../domain/calculations";

interface Props {
  cs: CaseState;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export function StopInfusionModal({ cs, onClose, onDone }: Props) {
  const append = useStore((s) => s.append);
  const [time, setTime] = useState(nowLocalInput());
  const active = cs.infusions.filter((i) => i.active);

  function stop(id: string, drug: string) {
    const at = isoFromLocalInput(time);
    append(cs.caseId, "INFUSION_STOPPED", { id, drug }, at);
    onDone(`Fin de perfusión: ${drug}`);
    if (active.length <= 1) onClose();
  }

  return (
    <Modal title="Perfusiones activas" onClose={onClose}>
      {active.length === 0 ? (
        <div className="empty">No hay perfusiones activas.</div>
      ) : (
        <>
          <TimeField value={time} onChange={setTime} label="Hora de fin" />
          <div className="pill-list">
            {active.map((inf) => (
              <div className="pill" key={inf.id}>
                <span className="t">{hhmm(inf.startedAt)}</span>
                <span className="m">
                  <strong>{inf.drug}</strong>
                  <div className="sm">{inf.summary}</div>
                  {!inf.gas && (
                    <div className="sm">
                      Conc. {formatNum(inf.concentration)} {inf.concentrationUnit}
                    </div>
                  )}
                </span>
                <button className="btn danger" onClick={() => stop(inf.id, inf.drug)}>
                  Finalizar
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
