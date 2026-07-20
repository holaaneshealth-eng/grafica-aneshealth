import { useStore, daysUntilPurge, RETENTION_DAYS } from "../store/store";
import { dmy, hhmm } from "../utils/time";
import type { CaseState } from "../domain/events";

interface Props {
  onOpen: (id: string) => void;
}

export function Home({ onOpen }: Props) {
  const createCase = useStore((s) => s.createCase);
  const cases = useStore((s) => s.listCases());
  const events = useStore((s) => s.events);
  const actor = useStore((s) => s.actor);
  const setActor = useStore((s) => s.setActor);
  const deleteCase = useStore((s) => s.deleteCase);

  const active = cases.filter((c) => c.phase !== "CLOSED");
  const closed = cases.filter((c) => c.phase === "CLOSED");

  function confirmDelete(c: CaseState) {
    if (window.confirm(`Eliminar el paciente ${c.ia}? Esta accion no se puede deshacer.`)) {
      deleteCase(c.caseId);
    }
  }

  function CaseRow({ c }: { c: CaseState }) {
    const days = daysUntilPurge(events, c.caseId);
    const soon = days <= 3;
    return (
      <div className="case-item">
        <div style={{ flex: 1 }} onClick={() => onOpen(c.caseId)}>
          <div className="ia">{c.ia}</div>
          <div className="sub" style={{ margin: 0 }}>
            {dmy(c.createdAt)} - {hhmm(c.createdAt)}
          </div>
          <div className="sub" style={{ margin: "2px 0 0", color: soon ? "var(--warn)" : "var(--text-dim)" }}>
            Autoborrado en {Math.max(0, days)} dia{days === 1 ? "" : "s"}
          </div>
        </div>
        <span className={`tag ${c.phase === "CLOSED" ? "closed" : "active"}`}>
          {c.phase === "PREOP" ? "Preparacion" : c.phase === "OR" ? "En quirofano" : "Cerrado"}
        </span>
        <button className="btn ghost" style={{ minHeight: 44, padding: "0 12px", color: "var(--text-dim)" }} onClick={() => confirmDelete(c)} title="Eliminar">
          &times;
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>Anestesista responsable</h2>
        <p className="sub">Se asocia a cada evento para la trazabilidad y la firma.</p>
        <input type="text" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Nombre" />
      </div>

      <button className="btn primary block lg" onClick={() => onOpen(createCase())}>
        + Nuevo procedimiento
      </button>
      <p className="sub" style={{ textAlign: "center", marginTop: 8 }}>
        Se generara automaticamente un Identificador Anestesico (IA). Puedes tener varios pacientes en curso a la vez.
      </p>

      {active.length > 0 && (
        <>
          <div className="section-title">En curso ({active.length})</div>
          {active.map((c) => (
            <CaseRow key={c.caseId} c={c} />
          ))}
        </>
      )}

      <div className="section-title">Cerrados{closed.length > 0 ? ` (${closed.length})` : ""}</div>
      {closed.length === 0 && active.length === 0 && <div className="empty">No hay procedimientos todavia.</div>}
      {closed.map((c) => (
        <CaseRow key={c.caseId} c={c} />
      ))}

      <div className="alert" style={{ marginTop: 18 }}>
        Politica de retencion: los pacientes se eliminan automaticamente {RETENTION_DAYS} dias despues de su ultima
        actividad (RGPD - minimizacion de datos). Exporta o firma la hoja antes de ese plazo.
      </div>
    </div>
  );
}
