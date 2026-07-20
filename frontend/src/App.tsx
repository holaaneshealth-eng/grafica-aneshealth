import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "./store/store";
import { setUnauthorizedHandler } from "./api";
import { Login, ChangePassword } from "./screens/Login";
import { Admin } from "./screens/Admin";
import { Home } from "./screens/Home";
import { Phase1, phase1Complete } from "./screens/Phase1";
import { Phase2, phase2Ready } from "./screens/Phase2";
import { Summary } from "./screens/Summary";
import { DrugModal } from "./components/DrugModal";
import { VitalsModal } from "./components/VitalsModal";
import { IncidentModal } from "./components/IncidentModal";
import { hhmmss } from "./utils/time";

type Modal = null | "drug" | "vitals" | "incident";
const INACTIVITY_MS = 30 * 60 * 1000; // cierre de sesion por inactividad

export default function App() {
  const user = useStore((s) => s.user);
  const booting = useStore((s) => s.booting);
  const bootstrap = useStore((s) => s.bootstrap);
  const setUser = useStore((s) => s.setUser);
  const logout = useStore((s) => s.logout);

  const activeCaseId = useStore((s) => s.activeCaseId);
  const openCase = useStore((s) => s.openCase);
  const setActiveCase = useStore((s) => s.setActiveCase);
  const append = useStore((s) => s.append);
  const online = useStore((s) => s.online);
  const setOnline = useStore((s) => s.setOnline);
  const flush = useStore((s) => s.flush);
  const pending = useStore((s) => s.pending.length);
  const canWrite = useStore((s) => s.canWrite);
  const cases = useStore((s) => s.cases);

  const events = useStore((s) => s.events);
  const cs = useStore((s) => (activeCaseId ? s.getCaseState(activeCaseId) : null));
  void events;

  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [clock, setClock] = useState(new Date().toISOString());
  const [showAdmin, setShowAdmin] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1900);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    void bootstrap();
  }, [bootstrap, setUser]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toISOString()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const iv = setInterval(() => void flush(), 5000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(iv);
    };
  }, [setOnline, flush]);

  // Cierre de sesion por inactividad.
  const idleRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    const reset = () => {
      window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(() => {
        void logout();
        showToast("Sesion cerrada por inactividad");
      }, INACTIVITY_MS);
    };
    const evs = ["mousemove", "keydown", "touchstart", "click"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      evs.forEach((e) => window.removeEventListener(e, reset));
      window.clearTimeout(idleRef.current);
    };
  }, [user, logout, showToast]);

  if (booting) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: "center" }}>Cargando...</div>
      </div>
    );
  }
  if (!user) return <Login />;
  if (user.mustChangePassword) return <ChangePassword />;

  const activeCase = cases.find((c) => c.caseId === activeCaseId);
  const writable = activeCaseId ? canWrite(activeCaseId) : false;
  const canSign = !!activeCase && (user.role === "admin" || (activeCase.ownerUserId === user.id && activeCase.status !== "signed"));
  const showEditingFlow = cs && writable && cs.phase !== "CLOSED";

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
        <div
          className="brand"
          onClick={() => {
            setActiveCase(null);
            setShowAdmin(false);
          }}
          style={{ cursor: "pointer" }}
        >
          <span className="logo">A</span>
          <span className="no-print">AnesHealth</span>
        </div>
        {cs && !showAdmin && <span className="ia-badge">{cs.ia}</span>}
        <span className="spacer" />
        <span className={`status-dot ${online ? "" : "off"} no-print`}>
          <i />
          {online ? (pending > 0 ? `Sync ${pending}` : "En linea") : "Offline"}
        </span>
        <span className="clock no-print">{hhmmss(clock).slice(0, 5)}</span>
        <span className="user-chip no-print">
          {user.displayName}
          {user.role === "admin" && (
            <button className="link-btn" onClick={() => setShowAdmin((v) => !v)}>
              Admin
            </button>
          )}
          <button className="link-btn" onClick={() => void logout()}>
            Salir
          </button>
        </span>
      </header>

      <main className="content">
        {showAdmin && user.role === "admin" ? (
          <Admin onClose={() => setShowAdmin(false)} onToast={showToast} />
        ) : (
          <>
            {!cs && <Home onOpen={(id) => void openCase(id)} onToast={showToast} />}

            {cs && (
              <>
                {!writable && cs.phase !== "CLOSED" && (
                  <div className="alert" style={{ marginTop: 4 }}>
                    Modo solo lectura. No eres el responsable de este paciente o el caso ya no esta activo.
                  </div>
                )}

                {showEditingFlow && (
                  <div className="stepper no-print">
                    <div className={`step ${cs.phase === "PREOP" ? "active" : "done"}`}>1. Preparacion</div>
                    <div className={`step ${cs.phase === "OR" ? "active" : ""}`}>2. Quirofano</div>
                    <div className="step">3. Cierre</div>
                  </div>
                )}

                {showEditingFlow && cs.phase === "PREOP" && (
                  <>
                    <Phase1 cs={cs} />
                    <button className="btn primary block lg no-print" disabled={!phase1Complete(cs)} onClick={advanceFromPhase1}>
                      {phase1Complete(cs) ? "Continuar a quirofano" : "Completa todos los campos"}
                    </button>
                  </>
                )}

                {showEditingFlow && cs.phase === "OR" && (
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

                {!showEditingFlow && <Summary cs={cs} onToast={showToast} canSign={canSign} />}
              </>
            )}
          </>
        )}
      </main>

      {cs && showEditingFlow && cs.phase === "OR" && (
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
