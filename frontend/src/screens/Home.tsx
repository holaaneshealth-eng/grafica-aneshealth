import { useState } from "react";
import { useStore, daysUntilPurge, RETENTION_DAYS } from "../store/store";
import { dmy, hhmm } from "../utils/time";
import { ApiError, type ApiCase } from "../api";
import type { CaseType } from "../domain/labor";

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
  const settings = useStore((s) => s.settings);
  const [creating, setCreating] = useState(false);
  // Aviso C2: ya hay un caso activo en esta cuenta (quirófano/endoscopias).
  const [activeWarn, setActiveWarn] = useState<{ ia: string; caseId: string; createdAt: string } | null>(null);
  // En partos, el tipo por defecto es "Analgesia de parto".
  const defaultType: CaseType =
    (user.location ?? "").toLowerCase().includes("parto") || user.username === "partos" ? "analgesia_parto" : "quirofano";
  const [newType, setNewType] = useState<CaseType>(defaultType);

  const active = cases.filter((c) => c.status === "active");
  const unsigned = cases.filter((c) => c.status === "closed"); // cerrado pero sin firmar
  const signed = cases.filter((c) => c.status === "signed");

  async function newCase() {
    setCreating(true);
    try {
      const id = await createCase(newType);
      if (id) onOpen(id);
      else onToast("No se pudo crear el caso (necesitas conexión)");
    } catch (e) {
      // C2: ya hay un caso activo en esta cuenta (quirófano/endoscopias). Se ofrece abrirlo.
      if (e instanceof ApiError && e.code === "ACTIVE_CASE_EXISTS") {
        const d = e.data as { ia?: string; caseId?: string; createdAt?: string } | undefined;
        if (d?.caseId && d.ia && d.createdAt) setActiveWarn({ ia: d.ia, caseId: d.caseId, createdAt: d.createdAt });
        else onToast(e.message);
      } else {
        onToast(e instanceof ApiError ? e.message : "No se pudo crear el caso");
      }
    } finally {
      setCreating(false);
    }
  }

  // Recordatorios de parto para la lista: cuándo toca el primer test y la reevaluación.
  function laborReminder(c: ApiCase): string | null {
    if (c.caseType !== "analgesia_parto" || c.status !== "active" || !c.laborLoadingAt) return null;
    const base = new Date(c.laborLoadingAt).getTime();
    const now = Date.now();
    const testAt = base + settings.laborFirstTestMin * 60000;
    const reevalAt = base + settings.laborReevalMin * 60000;
    const fmt = (t: number) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (now < testAt) return `Primer test de deambulación a las ${fmt(testAt)}`;
    if (now < reevalAt) return `Reevaluación a las ${fmt(reevalAt)}`;
    return `Reevaluación vencida (desde las ${fmt(reevalAt)})`;
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
          {c.caseType === "analgesia_parto" && (
            <div className="sub" style={{ margin: "2px 0 0", color: "var(--accent)" }}>
              🤰 Analgesia de parto
              {laborReminder(c) ? ` · ${laborReminder(c)}` : ""}
            </div>
          )}
        </div>
        <span className={`tag ${c.status === "active" ? "active" : "closed"}`}>
          {c.status === "active" ? "En curso" : c.status === "signed" ? "Firmado" : "Cerrado"}
        </span>
        {(user.role === "admin" || (mine && c.status !== "signed")) && (
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
      <div className="seg" style={{ marginBottom: 8 }}>
        <button className={newType === "quirofano" ? "on" : ""} onClick={() => setNewType("quirofano")}>
          Quirófano
        </button>
        <button className={newType === "analgesia_parto" ? "on" : ""} onClick={() => setNewType("analgesia_parto")}>
          Analgesia de parto
        </button>
      </div>
      <button className="btn primary block lg" onClick={newCase} disabled={creating}>
        {creating ? "Creando..." : newType === "analgesia_parto" ? "+ Nueva analgesia de parto" : "+ Nuevo procedimiento"}
      </button>

      {activeWarn && (
        <div className="alert" style={{ marginTop: 10 }}>
          <div style={{ marginBottom: 8 }}>
            Ya tienes un caso activo: <strong>Hoja {activeWarn.ia}</strong> · inicio {hhmm(activeWarn.createdAt)} ({dmy(activeWarn.createdAt)}). Ciérralo antes de crear otro.
          </div>
          <div className="grid2">
            <button className="btn lg" onClick={() => setActiveWarn(null)}>
              Cancelar
            </button>
            <button
              className="btn primary lg"
              onClick={() => {
                const id = activeWarn.caseId;
                setActiveWarn(null);
                onOpen(id);
              }}
            >
              Abrir el caso anterior
            </button>
          </div>
        </div>
      )}
      <p className="sub" style={{ textAlign: "center", marginTop: 8 }}>
        Se generará automáticamente un Identificador Anestésico (IA).{" "}
        {defaultType === "analgesia_parto"
          ? "Puedes tener varias analgesias de parto en curso a la vez."
          : "Solo puede haber un caso activo a la vez: cierra el actual antes de crear otro."}
      </p>

      {active.length > 0 && (
        <>
          <div className="section-title">En curso ({active.length})</div>
          {active.map((c) => (
            <CaseRow key={c.caseId} c={c} />
          ))}
        </>
      )}

      {unsigned.length > 0 && (
        <>
          <div className="section-title">Casos sin firmar ({unsigned.length})</div>
          <p className="sub" style={{ margin: "0 0 6px" }}>
            No se autoborran mientras no se firmen. Ábrelos para completarlos y firmarlos, o elimínalos manualmente.
          </p>
          {unsigned.map((c) => (
            <CaseRow key={c.caseId} c={c} />
          ))}
        </>
      )}

      <div className="section-title">Firmados{signed.length > 0 ? ` (${signed.length})` : ""}</div>
      {signed.length === 0 && active.length === 0 && unsigned.length === 0 && <div className="empty">No hay procedimientos todavía.</div>}
      {signed.map((c) => (
        <CaseRow key={c.caseId} c={c} />
      ))}

      <div className="alert" style={{ marginTop: 18 }}>
        Puedes consultar todos los casos, pero solo puedes registrar en el paciente que estás atendiendo. Los casos
        <strong> firmados y enviados</strong> se eliminan automáticamente {RETENTION_DAYS} días después de su última actividad (RGPD);
        los casos sin firmar o pendientes de envío se conservan.
      </div>
    </div>
  );
}
