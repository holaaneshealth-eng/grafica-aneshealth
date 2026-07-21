import { useState } from "react";
import { useStore, daysUntilPurge, RETENTION_DAYS } from "../store/store";
import { dmy, hhmm } from "../utils/time";
import type { ApiCase } from "../api";

interface Props {
  onOpen: (id: string) => void;
  onToast: (m: string) => void;
}

export function Home({ onOpen, onToast }: Props) {
  const cases = useStore((s) => s.cases);
  const user = useStore((s) => s.user)!;
  const createCase = useStore((s) => s.createCase);
  const deleteCase = useStore((s) => s.deleteCase);
  const canWrite = useStore((s) => s.canWrite);
  const [creating, setCreating] = useState(false);

  const active = cases.filter((c) => c.status === "active");
  const closed = cases.filter((c) => c.status !== "active");

  async function newCase() {
    setCreating(true);
    const id = await createCase();
    setCreating(false);
    if (id) onOpen(id);
    else onToast("No se pudo crear el caso (necesitas conexión)");
  }

  async function confirmDelete(c: ApiCase) {
    if (window.confirm(`¿Eliminar el paciente ${c.ia}? Esta acción no se puede deshacer.`)) {
      try {
        await deleteCase(c.caseId);
        onToast("Paciente eliminado");
      } catch {
        onToast("No tienes permiso para eliminar");
      }
    }
  }

  function CaseRow({ c }: { c: ApiCase }) {
    const days = daysUntilPurge(c.lastActivity);
    const soon = days <= 3;
    const writable = canWrite(c.caseId);
    const mine = c.ownerUserId === user.id;
    return (
      <div className="case-item">
        <div style={{ flex: 1 }} onClick={() => onOpen(c.caseId)}>
          <div className="ia">
            {c.ia} {!writable && <span title="Solo lectura">🔒</span>}
          </div>
          <div className="sub" style={{ margin: 0 }}>
            {dmy(c.createdAt)} - {hhmm(c.createdAt)}
            {c.ownerLocation ? ` - ${c.ownerLocation}` : ""}
            {mine ? " - (tuyo)" : ""}
          </div>
          <div className="sub" style={{ margin: "2px 0 0", color: soon ? "var(--warn)" : "var(--text-dim)" }}>
            Autoborrado en {Math.max(0, days)} día{days === 1 ? "" : "s"}
          </div>
        </div>
        <span className={`tag ${c.status === "active" ? "active" : "closed"}`}>
          {c.status === "active" ? "En curso" : c.status === "signed" ? "Firmado" : "Cerrado"}
        </span>
        {user.role === "admin" && (
          <button
            className="btn ghost"
            style={{ minHeight: 44, padding: "0 12px", color: "var(--text-dim)" }}
            onClick={() => confirmDelete(c)}
            title="Eliminar"
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button className="btn primary block lg" onClick={newCase} disabled={creating}>
        {creating ? "Creando..." : "+ Nuevo procedimiento"}
      </button>
      <p className="sub" style={{ textAlign: "center", marginTop: 8 }}>
        Se generará automáticamente un Identificador Anestésico (IA). Puedes tener varios pacientes en curso a la vez.
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
      {closed.length === 0 && active.length === 0 && <div className="empty">No hay procedimientos todavía.</div>}
      {closed.map((c) => (
        <CaseRow key={c.caseId} c={c} />
      ))}

      <div className="alert" style={{ marginTop: 18 }}>
        Puedes consultar todos los casos, pero solo puedes registrar en el paciente que estás atendiendo. Los pacientes
        se eliminan automáticamente {RETENTION_DAYS} días después de su última actividad (RGPD).
      </div>
    </div>
  );
}
