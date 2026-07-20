# AnesHealth — Hoja Anestésica Digital

Aplicación web **responsive** (móvil, iPad, tablet Android y PC con el mismo código)
para el registro digital de la hoja anestésica, pensada para uso real en quirófano:
rápida, con mínima carga cognitiva, usable con una sola mano y con máxima seguridad clínica.

> Diseño completo del producto y la arquitectura en [`docs/DISENO.md`](docs/DISENO.md).

## Características principales

- **Identificador Anestésico (IA)** automático `AA-NNNNNN-C` con dígito de control
  (validable offline) — pseudonimización por defecto (RGPD).
- **Arquitectura orientada a eventos** (event sourcing): la hoja se reconstruye a partir
  de un log inmutable de eventos con hora exacta → autosave, offline y auditoría nativos.
- **Flujo por fases bloqueantes**: Preparación → Quirófano → Cierre. No se avanza sin
  completar la fase anterior. "No" es una respuesta válida y explícita.
- **Fase 1**: alergias, talla, peso, antecedentes y medicación (autosave con debounce).
- **Fase 2**:
  - Checklist de seguridad (monitor, respirador, aspirador, Ambu).
  - Selección de parámetros de monitorización + monitorización adicional libre (BIS, ETE…).
  - Técnicas anestésicas (multiselección) con campos específicos por técnica.
  - **Administrar fármaco** (bolus / perfusión) con cálculo automático de concentración
    y dosis ponderada, conservando doble representación (`12 ml/h / 0,08 mcg/kg/min`).
  - Registro seriado de constantes con teclado numérico y validación de rango (soft-stop).
  - Gráficas de tendencias en tiempo real.
  - Registro de incidencias con timestamp.
- **Barra de acciones permanente** en la "thumb zone" (Fármaco / Constantes / Incidencia).
- **Cierre**: hoja anestésica en **PDF** e **imagen** A4 vertical, impresión directa,
  envío por email y **firma electrónica**.
- **Multipaciente**: varios procedimientos abiertos a la vez, con lista de "En curso" y
  "Cerrados".
- **Autoborrado (retención de datos, RGPD)**: cada paciente se elimina automáticamente
  **15 días** después de su última actividad. Se muestra una cuenta atrás por paciente y
  se conserva un registro de auditoría de los borrados (solo el IA pseudonimizado y la fecha).
- **Seguridad clínica extra**: aviso de alergia cruzada y alertas de rango.

## Requisitos y ejecución

```bash
npm install     # instalar dependencias
npm run dev     # servidor de desarrollo (http://localhost:5173)
npm run build   # build de producción (typecheck + Vite) -> carpeta dist/
npm run preview # previsualizar el build
```

## Pila tecnológica

- **React 18 + TypeScript + Vite**
- **Zustand** (con persistencia en `localStorage` = autosave + offline)
- **Recharts** (gráficas de tendencias)
- **jsPDF + html2canvas** (generación de PDF/imagen A4)

## Estructura

```
src/
  domain/        # lógica clínica: IA, cálculos, catálogos (fármacos, monitorización, técnicas)
  store/         # event store + proyecciones (event sourcing)
  components/    # UI reutilizable (modales, gráficas, toggles)
  screens/       # Home, Fase 1, Fase 2, Cierre
  utils/         # helpers de tiempo
```

## Notas

- Es un producto en evolución. La persistencia actual es local (offline-first). La
  sincronización con backend, la integración HL7/FHIR con monitores y la firma
  cualificada (eIDAS) están diseñadas y preparadas en la arquitectura (ver `docs/DISENO.md`).
- Los datos clínicos se registran bajo el IA (pseudónimo); la correspondencia con la
  identidad real debe gestionarse en un servicio separado.
