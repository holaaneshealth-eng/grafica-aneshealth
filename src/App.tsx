import { useEffect, useState } from "react";
import { useStore, flushSyncQueue, RETENTION_DAYS } from "./store/store";
import { Home } from "./screens/Home";
import { Phase1, phase1Complete } from "./screens/Phase1";
import { Phase2, phase2Ready } from "./screens/Phase2";
import { Summary } from "./screens/Summary";
import { DrugModal } from "./components/DrugModal";
import { VitalsModal } from "./components/VitalsModal";
import { IncidentModal } from "./components/IncidentModal";
import { hhmmss } from "./utils/time";

type Modal = null | "drug" | "vitals" | "incident";

export default function App() {
  const activeCaseId = useStore((s) => s.activeCaseId);
  const setActiveCase = useStore((s) => s.setActiveCase);
  const append = useStore((s) => s.append);
  const online = useStore((s) => s.online);
  const setOnline = useStore((s) => s.setOnline);
  const pending = useStore((s) => s.syncQueue.filter((q) => q.status === "pending").length);
  const purgeExpired = useStore((s) => s.purgeExpired);

  // Suscripcion reactiva al estado del caso activo.
  const events = useStore((s) => s.events);
  const cs = useStore((s) => (activeCaseId ? s.getCaseState(activeCaseId) : null));
  void events; // fuerza re-render en cada evento nuevo

  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date().toISOString());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Autoborrado de pacientes: al abrir y cada hora, purga los casos que superen la retencion.
  useEffect(() => {
    const removed = purgeExpired();
    if (removed > 0) showToast(`${removed} paciente(s) eliminado(s) por retencion (${RETENTION_DAYS} dias)`);
    const iv = setInterval(() => purgeExpired(), 60 * 60 * 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purgeExpired]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      flushSyncQueue();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const iv = setInterval(flushSyncQueue, 4000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(iv);
    };
  }, [setOnline]);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }

  function advanceFromPhase1() {
    if (cs && phase1Complete(cs)) {
      append(cs.caseId, "PHASE_COMPLETED", { from: "PREOP", next: "OR" });
      append(cs.caseId, "MILESTONE", { id: "m-" + Date.now(), at: new Date().toISOString(), label: "Entrada en quirofano" });
    }
  }
  function endSurgery() {
    if (cs) append(cs.caseId, "SURGERY_ENDED", {});
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setActiveCase(null)} style={{ cursor: "pointer" }}>
          <span className="logo">A</span>
          <span className="no-print">AnesHealth</span>
        </div>
        {cs && <span className="ia-badge">{cs.ia}</span>}
        <span className="spacer" />
        <span className={`status-dot ${online ? "" : "off"} no-print`}>
          <i />
          {online ? (pending > 0 ? `Sync ${pending}` : "Sincronizado") : "Offline"}
        </span>
        <span className="clock no-print">{hhmmss(clock).slice(0, 8)}</span>
      </header>

      <main className="content">
        {!cs && <Home onOpen={(id) => setActiveCase(id)} />}

        {cs && (
          <>
            <div className="stepper no-print">
              <div className={`step ${cs.phase === "PREOP" ? "active" : "done"}`}>1. Preparacion</div>
              <div className={`step ${cs.phase === "OR" ? "active" : cs.phase === "CLOSED" ? "done" : ""}`}>2. Quirofano</div>
              <div className={`step ${cs.phase === "CLOSED" ? "active" : ""}`}>3. Cierre</div>
            </div>

            {cs.phase === "PREOP" && (
              <>
                <Phase1 cs={cs} />
                <button className="btn primary block lg no-print" disabled={!phase1Complete(cs)} onClick={advanceFromPhase1}>
                  {phase1Complete(cs) ? "Continuar a quirofano" : "Completa todos los campos"}
                </button>
              </>
            )}

            {cs.phase === "OR" && (
              <>
                <Phase2 cs={cs} />
                <button
                  className="btn primary block lg no-print"
                  style={{ marginTop: 8 }}
                  disabled={!phase2Ready(cs)}
                  onClick={endSurgery}
                >
                  {phase2Ready(cs) ? "Fin de cirugia" : "Completa checklist, monitor y tecnica"}
                </button>
              </>
            )}

            {cs.phase === "CLOSED" && <Summary cs={cs} onToast={showToast} />}
          </>
        )}
      </main>

      {/* Barra de acciones permanente (thumb zone) durante el intraoperatorio */}
      {cs && cs.phase === "OR" && (
        <nav className="actionbar no-print">
          <button className="btn primary" onClick={() => setModal("drug")}>
            + Farmaco
          </button>
          <button className="btn" onClick={() => setModal("vitals")}>
            + Constantes
          </button>
          <button className="btn danger" onClick={() => setModal("incident")}>
            Incidencia
          </button>
        </nav>
      )}

      {cs && modal === "drug" && <DrugModal cs={cs} onClose={() => setModal(null)} onDone={showToast} />}
      {cs && modal === "vitals" && <VitalsModal cs={cs} onClose={() => setModal(null)} onDone={showToast} />}
      {cs && modal === "incident" && <IncidentModal cs={cs} onClose={() => setModal(null)} onDone={showToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
