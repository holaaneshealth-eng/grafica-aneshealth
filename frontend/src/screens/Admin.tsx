import { useEffect, useState } from "react";
import { api, ApiError, type AdminUserRow, type AuditEntry } from "../api";
import { hhmmss, dmy } from "../utils/time";

interface Props {
  onClose: () => void;
  onToast: (m: string) => void;
}

export function Admin({ onClose, onToast }: Props) {
  const [tab, setTab] = useState<"users" | "audit">("users");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Alta de usuario
  const [nu, setNu] = useState({ username: "", displayName: "", role: "clinical", location: "", password: "" });

  async function loadUsers() {
    try {
      setUsers((await api.listUsers()).users);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    }
  }
  async function loadAudit() {
    try {
      setAudit((await api.audit(300)).entries);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);
  useEffect(() => {
    if (tab === "audit") void loadAudit();
  }, [tab]);

  async function createUser() {
    try {
      await api.createUser({
        username: nu.username.trim(),
        displayName: nu.displayName.trim() || nu.username.trim(),
        role: nu.role,
        location: nu.location.trim() || undefined,
        password: nu.password,
      });
      onToast("Usuario creado");
      setNu({ username: "", displayName: "", role: "clinical", location: "", password: "" });
      await loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    }
  }

  async function resetPw(u: AdminUserRow) {
    const pw = window.prompt(`Nueva contrasena para ${u.username} (min 10, may/min/num):`);
    if (!pw) return;
    try {
      await api.resetPassword(u.id, pw);
      onToast("Contrasena restablecida");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    }
  }

  async function toggleActive(u: AdminUserRow) {
    try {
      await api.setUserActive(u.id, u.active !== 1);
      await loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    }
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ flex: 1 }}>Administracion</h2>
          <button className="btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="seg" style={{ marginTop: 12 }}>
          <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>
            Usuarios
          </button>
          <button className={tab === "audit" ? "on" : ""} onClick={() => setTab("audit")}>
            Auditoria
          </button>
        </div>
        {error && <div className="alert danger">{error}</div>}
      </div>

      {tab === "users" && (
        <>
          <div className="card">
            <h2 style={{ fontSize: 16 }}>Nuevo usuario</h2>
            <div className="row">
              <div className="field">
                <label>Usuario</label>
                <input type="text" value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} />
              </div>
              <div className="field">
                <label>Nombre visible</label>
                <input type="text" value={nu.displayName} onChange={(e) => setNu({ ...nu, displayName: e.target.value })} />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label>Rol</label>
                <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                  <option value="clinical">Clinico</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="field">
                <label>Ubicacion</label>
                <input type="text" value={nu.location} onChange={(e) => setNu({ ...nu, location: e.target.value })} placeholder="Quirofano 11" />
              </div>
            </div>
            <div className="field">
              <label>Contrasena inicial</label>
              <input type="text" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
            </div>
            <button className="btn primary block" onClick={createUser} disabled={!nu.username || !nu.password}>
              Crear usuario
            </button>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 16 }}>Usuarios ({users.length})</h2>
            <div className="pill-list">
              {users.map((u) => (
                <div className="pill" key={u.id}>
                  <span className="m">
                    <strong>{u.username}</strong> <span className="sm">({u.role}{u.location ? " - " + u.location : ""})</span>
                    <div className="sm">
                      {u.active === 1 ? "Activo" : "Desactivado"}
                      {u.must_change_password === 1 ? " - debe cambiar contrasena" : ""}
                      {u.last_login ? ` - ultimo acceso ${dmy(u.last_login)}` : " - sin accesos"}
                    </div>
                  </span>
                  <button className="btn ghost" onClick={() => resetPw(u)}>
                    Contrasena
                  </button>
                  <button className={`btn ${u.active === 1 ? "danger" : ""}`} onClick={() => toggleActive(u)}>
                    {u.active === 1 ? "Desactivar" : "Activar"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "audit" && (
        <div className="card">
          <h2 style={{ fontSize: 16 }}>Registro de auditoria</h2>
          <p className="sub">Ultimos eventos de seguridad y actividad.</p>
          <div className="pill-list">
            {audit.map((a) => (
              <div className="pill" key={a.id}>
                <span className="t">{hhmmss(a.at).slice(0, 8)}</span>
                <span className="m">
                  <strong style={{ color: a.success === 0 ? "var(--danger)" : undefined }}>{a.action}</strong>{" "}
                  <span className="sm">{a.username ?? "-"}</span>
                  <div className="sm">
                    {[a.target_type, a.target_id, a.detail].filter(Boolean).join(" / ")}
                    {a.ip ? ` - ${a.ip}` : ""}
                  </div>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
