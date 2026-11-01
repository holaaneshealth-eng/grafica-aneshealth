import { useState } from "react";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";
import { useStore } from "../store/store";
import { api, ApiError } from "../api";
import type { CaseState } from "../domain/events";
import { hhmm, nowLocalInput, isoFromLocalInput } from "../utils/time";

function fmtRef(title: string | undefined, name: string, colegiado: string | undefined): string {
  return `${title ? title + " " : ""}${name}${colegiado ? ` · Nº col. ${colegiado}` : ""}`;
}

/** Selección del anestesiólogo responsable (sin PIN) al iniciar el caso, con sus relevos. */
export function ResponsibleSection({ cs }: { cs: CaseState }) {
  const list = useStore((s) => s.anesthesiologists);
  const append = useStore((s) => s.append);
  const [sel, setSel] = useState("");

  function setResponsible(id: string) {
    const a = list.find((x) => x.id === id);
    if (!a) return;
    append(cs.caseId, "RESPONSIBLE_SET", { anesthesiologistId: a.id, name: a.full_name, colegiado: a.colegiado, title: a.title });
    setSel("");
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16 }}>Anestesiólogo responsable</h2>
      {cs.responsible ? (
        <p className="sub" style={{ margin: "0 0 8px" }}>
          Responsable: <strong>{fmtRef(cs.responsible.title, cs.responsible.name, cs.responsible.colegiado)}</strong> (desde {hhmm(cs.responsible.at)})
          {cs.relays.length > 0 && (
            <>
              {cs.relays.map((r, i) => (
                <span key={i}> · Relevo: <strong>{fmtRef(r.title, r.name, r.colegiado)}</strong> ({hhmm(r.at)})</span>
              ))}
            </>
          )}
        </p>
      ) : (
        <p className="sub" style={{ margin: "0 0 8px" }}>Elige quién es el anestesiólogo responsable del caso. Puede cambiarse con un relevo.</p>
      )}
      {list.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No hay anestesiólogos dados de alta. El administrador los gestiona en Admin.</div>
      ) : (
        <div className="field">
          <label>{cs.responsible ? "Cambiar responsable" : "Seleccionar responsable"}</label>
          <select value={sel} onChange={(e) => { setSel(e.target.value); if (e.target.value) setResponsible(e.target.value); }}>
            <option value="">— elige —</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>{fmtRef(a.title, a.full_name, a.colegiado)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** Relevo durante el caso: nuevo responsable y hora del cambio. */
export function RelayModal({ cs, onClose, onDone }: { cs: CaseState; onClose: () => void; onDone: (m: string) => void }) {
  const list = useStore((s) => s.anesthesiologists);
  const append = useStore((s) => s.append);
  const [sel, setSel] = useState("");
  const [time, setTime] = useState(nowLocalInput());

  function save() {
    const a = list.find((x) => x.id === sel);
    if (!a) return;
    const at = isoFromLocalInput(time);
    append(cs.caseId, "RESPONSIBLE_RELAY", { anesthesiologistId: a.id, name: a.full_name, colegiado: a.colegiado, title: a.title }, at);
    onDone(`Relevo: ${a.full_name}`);
    onClose();
  }

  return (
    <Modal title="Relevo de anestesiólogo" onClose={onClose}>
      {cs.responsible && (
        <div className="alert">Responsable actual: <strong>{fmtRef(cs.responsible.title, cs.responsible.name, cs.responsible.colegiado)}</strong>.</div>
      )}
      {list.length === 0 ? (
        <div className="muted">No hay anestesiólogos dados de alta.</div>
      ) : (
        <>
          <div className="field">
            <label>Nuevo responsable</label>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— elige —</option>
              {list.map((a) => (
                <option key={a.id} value={a.id}>{fmtRef(a.title, a.full_name, a.colegiado)}</option>
              ))}
            </select>
          </div>
          <TimeField value={time} onChange={setTime} label="Hora del relevo" />
          <button className="btn primary block lg" onClick={save} disabled={!sel}>Registrar relevo</button>
        </>
      )}
    </Modal>
  );
}

export interface SignResult { signedBy: string; colegiado: string; title: string }

/** Firma: elegir anestesiólogo + PIN. Gestiona el cambio de PIN provisional y el bloqueo. */
export function SignModal({ cs, onClose, onSigned }: { cs: CaseState; onClose: () => void; onSigned: (r: SignResult) => void }) {
  const list = useStore((s) => s.anesthesiologists);
  const reloadCaseEvents = useStore((s) => s.reloadCaseEvents);
  const flush = useStore((s) => s.flush);
  const [sel, setSel] = useState("");
  const [pin, setPin] = useState("");
  const [phase, setPhase] = useState<"enter" | "changepin">("enter");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSign(effectivePin: string) {
    const res = await api.signCase(cs.caseId, sel, effectivePin);
    await reloadCaseEvents(cs.caseId);
    onSigned({ signedBy: res.signedBy, colegiado: res.colegiado, title: res.title });
  }

  async function submitEnter() {
    if (!sel || !/^\d{4,6}$/.test(pin)) {
      setError("Elige el anestesiólogo e introduce un PIN de 4 a 6 cifras.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await flush(); // asegura que lo pendiente se ha enviado antes de firmar (acción online)
      await doSign(pin);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PIN_MUST_CHANGE") {
        setPhase("changepin"); // el PIN provisional es correcto: hay que cambiarlo
        setError(null);
      } else if (e instanceof ApiError && e.code === "PIN_LOCKED") {
        setError("Perfil bloqueado temporalmente (15 min) por intentos fallidos.");
      } else {
        setError(e instanceof ApiError ? e.message : "No se pudo firmar.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitChangePin() {
    if (!/^\d{4,6}$/.test(newPin)) {
      setError("El nuevo PIN debe tener entre 4 y 6 cifras.");
      return;
    }
    if (newPin !== newPin2) {
      setError("Los PIN no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changeAnesthesiologistPin(sel, pin, newPin); // pin = provisional
      await doSign(newPin);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cambiar el PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Firmar la hoja" onClose={onClose}>
      {list.length === 0 ? (
        <div className="alert danger">No hay anestesiólogos dados de alta. El administrador debe crearlos en Admin antes de poder firmar.</div>
      ) : phase === "enter" ? (
        <>
          <div className="field">
            <label>Anestesiólogo</label>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— elige —</option>
              {list.map((a) => (
                <option key={a.id} value={a.id}>{fmtRef(a.title, a.full_name, a.colegiado)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>PIN personal (4-6 cifras)</label>
            <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
          {error && <div className="alert danger">{error}</div>}
          <button className="btn primary block lg" onClick={() => void submitEnter()} disabled={busy || !sel || pin.length < 4}>
            {busy ? "Firmando…" : "Firmar"}
          </button>
        </>
      ) : (
        <>
          <div className="alert">Primera firma: define tu PIN personal (sustituye al provisional).</div>
          <div className="field">
            <label>Nuevo PIN (4-6 cifras)</label>
            <input type="password" inputMode="numeric" autoComplete="off" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
          <div className="field">
            <label>Repite el nuevo PIN</label>
            <input type="password" inputMode="numeric" autoComplete="off" value={newPin2} onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
          {error && <div className="alert danger">{error}</div>}
          <button className="btn primary block lg" onClick={() => void submitChangePin()} disabled={busy || newPin.length < 4}>
            {busy ? "Guardando…" : "Cambiar PIN y firmar"}
          </button>
        </>
      )}
    </Modal>
  );
}
