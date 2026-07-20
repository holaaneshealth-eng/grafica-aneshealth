# AnesHealth — Hoja Anestésica Digital (full-stack, segura)

Aplicación web **responsive** (móvil, iPad, tablet Android y PC) para el registro digital
de la hoja anestésica, con **backend seguro**, autenticación, **roles y permisos (RBAC)**,
y endurecimiento frente a ataques. Pensada para uso real en quirófano.

> Diseño de producto y arquitectura clínica: [`docs/DISENO.md`](docs/DISENO.md).

## Arquitectura

Monorepo con dos partes que se despliegan como **un único contenedor**:

```
grafica-aneshealth/
  frontend/   # SPA React + TypeScript + Vite (UI de quirófano)
  backend/    # API Node.js + Express + SQLite (fuente de verdad, seguridad)
  Dockerfile  # build multi-stage: compila frontend y backend en 1 imagen
  render.yaml # blueprint de despliegue en Render.com
```

El backend sirve la API bajo `/api/*` **y** el frontend compilado (mismo origen),
lo que simplifica el despliegue y refuerza la seguridad (cookies same-origin).

- **Modelo orientado a eventos** (event sourcing): la hoja se reconstruye desde un log
  inmutable de eventos con hora exacta y **cadena de hash** (anti-manipulación).
- **IA** (Identificador Anestésico) generado de forma **atómica en el servidor**.
- **Autoborrado** de pacientes a los **15 días** (retención RGPD), ejecutado por el backend.

## Usuarios y permisos

Al primer arranque se crean 13 usuarios:

| Usuario | Rol | Permisos |
|---|---|---|
| `admin` | Administrador | **Control total**: gestionar usuarios, ver auditoría, leer/escribir/anular cualquier caso, borrar. |
| `quirofano1` … `quirofano10` | Clínico | Escritura **solo en su propio paciente activo**; **lectura de todos** los casos; **no** puede modificar/anular registros ni gestionar usuarios. |
| `partos` | Clínico | Igual que quirófano. |
| `endoscopias` | Clínico | Igual que quirófano. |

**Contraseñas iniciales**: si no defines `ADMIN_PASSWORD` / `CLINICAL_PASSWORD_PREFIX`,
el servidor genera contraseñas aleatorias y las escribe en
`DATA_DIR/INITIAL_CREDENTIALS.txt` (no se versiona), forzando el cambio en el primer login.

## Medidas de seguridad aplicadas

- **Contraseñas** con hash **bcrypt** (coste configurable) — nunca en claro.
- **Sesión JWT** en cookie **httpOnly + Secure + SameSite=Strict** (no accesible por JS → mitiga XSS).
- **CSRF**: patrón double-submit (cookie + cabecera `X-CSRF-Token`) en toda mutación.
- **RBAC** verificado en el servidor por cada operación (no se confía en el cliente).
- **Bloqueo de cuenta** tras varios intentos fallidos + **rate limiting** (global y de login).
- **Cabeceras de seguridad** con Helmet: CSP estricta, HSTS, `nosniff`, `frameAncestors 'none'`, sin `X-Powered-By`.
- **Validación de entrada** con Zod en todos los endpoints; límite de tamaño de cuerpo.
- **Auditoría** completa (login, accesos denegados, altas, cambios, borrados) con IP y user-agent.
- **Pseudonimización**: la hoja solo maneja el IA; sin datos personales directos.
- **Cierre de sesión por inactividad** (cliente) y **revocación de sesiones** al cambiar contraseña.
- **Integridad**: cadena de hash SHA-256 encadenada por caso.

## Ejecución en local (desarrollo)

Necesitas Node.js 20+ en dos terminales:

```bash
# Terminal 1 — backend (http://localhost:8080)
cd backend
cp .env.example .env        # y define JWT_SECRET
npm install
npm run dev

# Terminal 2 — frontend (http://localhost:5173, con proxy /api al backend)
cd frontend
npm install
npm run dev
```

Las credenciales iniciales aparecen en la consola del backend y en `backend/data/INITIAL_CREDENTIALS.txt`.

## Despliegue en internet (recomendado: Docker)

### Opción A — Render.com (más sencillo, incluye blueprint)

1. Sube este repositorio a GitHub.
2. En Render: **New → Blueprint** y selecciona el repo (usa `render.yaml`).
3. Render construye la imagen, genera `JWT_SECRET`, crea un disco persistente en `/data`
   y publica una URL HTTPS.
4. Entra con `admin` (contraseña en Logs → `INITIAL_CREDENTIALS.txt`, o define `ADMIN_PASSWORD`).

### Opción B — Docker en cualquier servidor

```bash
# Genera un secreto y arranca
echo "JWT_SECRET=$(openssl rand -hex 48)" > .env
docker compose up -d --build
# App en http://localhost:8080  (pon un proxy HTTPS delante, p.ej. Caddy/Nginx)
```

Los datos (SQLite + credenciales) persisten en el volumen `aneshealth-data` (`/data`).

> **Importante para producción**: sirve siempre por **HTTPS** (las cookies Secure lo requieren).
> Render lo hace automáticamente; en un servidor propio, pon un proxy TLS delante.

## Pila tecnológica

- **Frontend**: React 18, TypeScript, Vite, Zustand, Recharts, jsPDF + html2canvas.
- **Backend**: Node.js, Express, better-sqlite3, bcryptjs, jsonwebtoken, Helmet, Zod.
