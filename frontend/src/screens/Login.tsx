import { useState } from "react";
import { api, setCsrfToken, ApiError } from "../api";
import { useStore } from "../store/store";

export function Login() {
  const setUser = useStore((s) => s.setUser);
  const bootstrap = useStore((s) => s.bootstrap);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user, csrfToken } = await api.login(username.trim(), password);
      setCsrfToken(csrfToken);
      setUser(user);
      if (!user.mustChangePassword) await bootstrap();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <span className="logo-big">A</span>
        </div>
        <h1>AnesHealth</h1>
        <p className="sub" style={{ textAlign: "center" }}>Hoja anestésica digital</p>

        <div className="field">
          <label>Usuario</label>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="p.ej. quirofano1"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="alert danger">{error}</div>}

        <button className="btn primary block lg" type="submit" disabled={busy || !username || !password}>
          {busy ? "Entrando..." : "Iniciar sesión"}
        </button>
      </form>
    </div>
  );
}

export function ChangePassword() {
  const bootstrap = useStore((s) => s.bootstrap);
  const logout = useStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      // La sesion se invalida en el servidor: hay que volver a entrar.
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
    void bootstrap;
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 style={{ fontSize: 22 }}>Cambia tu contraseña</h1>
        <p className="sub" style={{ textAlign: "center" }}>
          Por seguridad, debes establecer una contraseña propia antes de continuar.
        </p>
        <div className="field">
          <label>Contraseña actual</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="field">
          <label>Nueva contraseña</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <p className="sub" style={{ margin: "6px 0 0" }}>
            Mínimo 10 caracteres, con mayúscula, minúscula y número.
          </p>
        </div>
        <div className="field">
          <label>Repite la nueva contraseña</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {error && <div className="alert danger">{error}</div>}
        <button className="btn primary block lg" type="submit" disabled={busy || !current || !next}>
          {busy ? "Guardando..." : "Guardar y volver a entrar"}
        </button>
      </form>
    </div>
  );
}
