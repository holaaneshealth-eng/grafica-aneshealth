# Hoja Anestésica Digital — Diseño de producto y arquitectura

> Documento de diseño elaborado por un equipo de anestesiología clínica, UX médico,
> ingeniería de software senior y arquitectura de sistemas sanitarios.
> Objetivo: sustituir por completo la hoja anestésica en papel con un producto
> utilizable en quirófano real, rápido, seguro y con carga cognitiva mínima.

---

## 0. Resumen ejecutivo

Proponemos una aplicación **nativa para iPad (iPadOS)**, con arquitectura
**local-first orientada a eventos (event sourcing)**, sincronización posterior contra
un backend sanitario y generación automática de la hoja anestésica en PDF/imagen A4.

Tres ideas rectoras gobiernan todas las decisiones:

1. **La verdad es la secuencia de eventos.** Nada se "edita" destructivamente: todo
   se registra como un evento con hora exacta. La hoja se *reconstruye* (proyección)
   a partir de esos eventos. Esto da, gratis, auditoría, autosave, offline y
   trazabilidad médico-legal.
2. **El coste de registrar debe tender a cero.** Cada evento clínico frecuente debe
   caber en 1–3 toques con el pulgar de una mano, con la hora capturada por el sistema.
3. **La seguridad clínica se diseña, no se documenta.** Fases bloqueantes, checklists
   obligatorios, "No" como respuesta válida y explícita, cálculos verificados con doble
   representación, y pseudonimización por defecto (RGPD).

---

## 1. Principios de diseño → requisitos (trazabilidad)

| Principio | Cómo se materializa |
|---|---|
| Mínimas pulsaciones | Acciones frecuentes en barra permanente; favoritos por especialidad; valores por defecto inteligentes |
| Uso con una mano en iPad | Zona de acción en el tercio inferior ("thumb zone"); botones ≥ 64 pt; sin gestos finos |
| Interfaz limpia | Un objetivo por pantalla; jerarquía tipográfica; sin adornos |
| Registrar evento < 3 s | Teclado numérico grande, chips de fármacos favoritos, hora automática |
| Hora automática | Todo evento lleva `occurredAt` del reloj monotónico del dispositivo |
| Autosave | Cada evento se persiste en el diario local en el momento de crearse |
| Offline + sync | Log de eventos local (append-only) + cola de sincronización idempotente |
| Auditoría completa | Event sourcing inmutable + `audit_log` con quién/qué/cuándo/antes/después |
| HL7/FHIR | Modelo de dominio mapeable a recursos FHIR; capa anticorrupción para monitores |
| Firma electrónica | Cierre criptográfico del expediente (hash encadenado + firma del responsable) |
| Estética quirúrgica | Tema oscuro/neutro de bajo brillo, acento verde-teal, alto contraste, antideslumbrante |

---

## 2. Identificación del paciente y pseudonimización (RGPD)

### 2.1 Identificador Anestésico (IA)

Formato: `AA-NNNNNN-C` → `26-004531-K`

- `AA` = dos últimos dígitos del año.
- `NNNNNN` = ordinal anual (reinicia el 1 de enero), 6 dígitos con ceros a la izquierda.
- `C` = dígito/letra de control para detectar errores de transcripción.

**Algoritmo del carácter de control** (estilo DNI español, `mod 23`):

```
base   = concat(AA, NNNNNN)            // p.ej. "26004531" -> 26004531
resto  = base mod 23
tabla  = "TRWAGMYFPDXBNJZSQVHLCKE"     // 23 caracteres, sin vocales ambiguas
control = tabla[resto]
```

- Robusto frente a un dígito erróneo y a la mayoría de transposiciones.
- Se puede validar offline con una función pura → verificación instantánea al escanear
  la pulsera. *(La letra del ejemplo es ilustrativa; el algoritmo es determinista.)*

### 2.2 Separación de identidades (clave RGPD)

La hoja anestésica **nunca** almacena nombre, NHC ni fecha de nacimiento. Solo el IA.

- **Tabla de correspondencia** IA ↔ identidad real vive en un **servicio separado**
  (Identity/PID service), con control de acceso y cifrado propios.
- La app de quirófano opera solo con el IA (pseudónimo). Un usuario autorizado puede
  "resolver" la identidad puntualmente; cada resolución se audita.
- Beneficio: la hoja y sus exportaciones son pseudonimizadas por defecto; minimización
  de datos y separación de propósitos por diseño.

---

## 3. Arquitectura orientada a eventos (event sourcing)

### 3.1 Concepto

El estado del procedimiento **no** se guarda como "un formulario que se edita". Se guarda
como un **log inmutable de eventos** ordenados por tiempo. La hoja anestésica que ve el
usuario es una **proyección** (vista materializada) calculada a partir de ese log.

```
[ Eventos append-only ]  ──►  [ Proyecciones / vistas ]  ──►  [ PDF · gráficas · resumen ]
   (fuente de verdad)            (timeline, curvas, medicación)
```

Ventajas para este dominio:
- **Auditoría nativa**: el propio historial *es* la auditoría.
- **Autosave real**: registrar = añadir un evento persistido de inmediato.
- **Offline trivial**: el log crece localmente; luego se envía en orden.
- **Reconstrucción**: cualquier corrección es un *nuevo* evento (corrección/anulación),
  nunca un borrado. Se conserva el "antes" y el "después".

### 3.2 Estructura de un evento

```jsonc
{
  "eventId": "uuid-v7",              // ordenable por tiempo
  "caseId": "uuid",                  // procedimiento (IA)
  "type": "DRUG_BOLUS_ADMINISTERED",
  "occurredAt": "2026-07-20T08:06:12Z",  // hora clínica real
  "recordedAt": "2026-07-20T08:06:14Z",  // hora de registro (puede diferir)
  "actorId": "anest-user-id",
  "deviceId": "ipad-quirofano-3",
  "payload": { /* específico del tipo */ },
  "correctsEventId": null,           // si corrige/anula otro evento
  "schemaVersion": 1,
  "prevHash": "…", "hash": "…"       // cadena hash para integridad
}
```

- `occurredAt` vs `recordedAt`: distinción esencial en clínica. Permite registrar un
  bolo "hace 2 min" sin falsear la cronología, dejando ambas horas trazadas.
- `hash`/`prevHash`: cada evento encadena con el anterior → cualquier alteración
  posterior es detectable (base para la firma e integridad médico-legal).

### 3.3 Catálogo de tipos de evento

| Categoría | Tipos de evento |
|---|---|
| Ciclo de vida | `CASE_CREATED`, `PHASE_COMPLETED`, `SURGERY_ENDED`, `CASE_SIGNED` |
| Preparación | `PREOP_INFO_RECORDED` (alergias, talla, peso, antecedentes, medicación) |
| Seguridad | `SAFETY_CHECK_CONFIRMED` (item, valor sí/no) |
| Monitorización | `MONITORING_PARAMS_SELECTED`, `MONITORING_CUSTOM_ADDED` |
| Técnica | `ANESTHESIA_TECHNIQUE_ADDED` (+ payload específico por técnica) |
| Fármacos | `DRUG_BOLUS_ADMINISTERED`, `INFUSION_STARTED`, `INFUSION_RATE_CHANGED`, `INFUSION_STOPPED` |
| Constantes | `VITALS_RECORDED` (conjunto de parámetros seleccionados + valores) |
| Peso | `WEIGHT_UPDATED` (para recálculo de perfusiones) |
| Eventos libres | `INCIDENT_RECORDED`, `NOTE_ADDED`, `MILESTONE_MARKED` (entrada, intubación…) |
| Correcciones | `EVENT_CORRECTED`, `EVENT_VOIDED` (siempre referencian al original) |

Ejemplo de timeline reconstruido (idéntico al que pediste):

```
08:02  Entrada en quirófano        MILESTONE_MARKED
08:04  Monitor conectado           MILESTONE_MARKED
08:05  Preoxigenación              MILESTONE_MARKED
08:06  Propofol 180 mg             DRUG_BOLUS_ADMINISTERED
08:07  Remifentanilo 100 mcg       DRUG_BOLUS_ADMINISTERED
08:08  Intubación                  ANESTHESIA_TECHNIQUE_ADDED / MILESTONE
08:10  Registro monitorización     VITALS_RECORDED
08:15  Inicio noradrenalina        INFUSION_STARTED
08:22  Incidencia                  INCIDENT_RECORDED
```

---

## 4. Modelo de datos y entidades

### 4.1 Entidades principales (proyecciones a partir de eventos)

```
Case (Procedimiento)
 ├─ ia (string, único)            // 26-004531-K
 ├─ status: draft|active|ended|signed
 ├─ currentPhase
 ├─ createdAt, endedAt, signedAt
 ├─ signedBy, signatureHash

PreopAssessment (1:1 con Case)
 ├─ allergies (texto libre)
 ├─ heightCm (int)
 ├─ weightKg (decimal)
 ├─ history (texto libre)
 ├─ medication (texto libre)

SafetyChecklist (1:1)
 ├─ monitorChecked (bool)         // "No" es válido y explícito
 ├─ ventilatorChecked (bool)
 ├─ suctionReady (bool)
 ├─ ambuReady (bool)
 └─ (cada item con timestamp y actor)

MonitoringSelection (1:1)
 ├─ standardParams: [FC, TAS, TAD, TAM, SpO2, PPICO, PEEP, VT, FR, ETCO2, TEMP, PVC, FiO2, ETAG]
 └─ customParams: [{ name, unit }]   // BIS, rSO2, ETE, PiCCO, Swan-Ganz…

AnesthesiaTechnique (1:N)          // se permite más de una
 ├─ type (enum)
 └─ details (JSON según tipo)

DrugAdministration (1:N)
 ├─ mode: bolus | infusion
 ├─ drug, dose/amount, unit
 ├─ (infusión) diluentVolumeMl, finalConcentration, rateMlH, weightBasedDose
 └─ occurredAt

VitalsRecord (1:N)                 // registro seriado
 ├─ occurredAt
 └─ values: { paramCode: value }

Incident (1:N)
 ├─ occurredAt, text, severity?

AuditEntry (1:N)                   // además de la cadena de eventos
 ├─ actor, action, target, before, after, at
```

### 4.2 Payloads específicos por técnica

```jsonc
// General con mascarilla
{ "hanGrade": "II", "ventilation": "fácil", "maskType": "…", "maskSize": 4 }

// General con intubación (orotraqueal / nasotraqueal)
{ "hanGrade": "II", "ventilation": "fácil", "cormackLehane": "IIa",
  "device": "TET", "route": "orotraqueal", "caliber": 7.5, "attempts": 1,
  "stylet": true, "videolaryngoscope": true, "incidents": "" }

// Intradural / epidural / combinada
{ "needleType": "Whitacre", "caliber": "27G", "vertebralLevel": "L3-L4",
  "approach": "medial", "ease": "fácil", "incidents": "" }

// Bloqueos (periférico / interfascial)
{ "blockType": "TAP", "technique": "…", "ultrasound": true,
  "neurostimulation": false, "localAnesthetic": "ropivacaína",
  "volumeMl": 20, "concentrationPct": 0.375, "adjuvants": "dexametasona 4 mg" }
```

### 4.3 Almacenamiento físico

- **iPad (local-first):** SQLite (o WatermelonDB/GRDB) con tabla `events` append-only
  + tablas de proyección para lectura rápida.
- **Backend:** almacén de eventos (event store) + proyecciones en PostgreSQL;
  objetos exportados (PDF/imagen) en almacenamiento cifrado.

---

## 5. Máquina de estados de fases (flujo bloqueante)

```
             ┌─────────────┐     completa      ┌────────────┐    "Fin de cirugía"   ┌────────────┐
  CASE ─────►│  FASE 1     │ ────────────────► │  FASE 2    │ ───────────────────► │  CIERRE    │
  CREATED    │ Preparación │                    │ Quirófano  │                      │ PDF+firma  │
             └─────────────┘  ◄── no avanza     └────────────┘                      └────────────┘
              gate: 5 campos     si falta algo    gates internos
```

Reglas:
- **No se avanza** de fase mientras la anterior no esté completa (gate validado).
- La **Fase 2** tiene subgates: la selección de monitorización y el checklist de
  seguridad deben completarse antes de habilitar el registro seriado.
- **"No" es una respuesta válida**: un checklist con un item en "No" está *completo*
  (queda registrado con su motivo/aviso), no bloquea por estar "sin responder". Se
  distingue claramente `No` (respondido negativo) de `— sin responder`.

---

## 6. Pantallas y navegación

Barra permanente inferior (thumb zone) visible durante todo el intraoperatorio:

```
┌──────────────────────────────────────────────────────────────┐
│  IA: 26-004531-K            ⟲ autosave ✓        08:06:14  ●REC │  ← cabecera fija
│                                                                │
│                     (contenido de la fase)                     │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│ [ + Administrar fármaco ]  [ + Constantes ]  [ ⚠ Incidencia ] │  ← acciones permanentes
└──────────────────────────────────────────────────────────────┘
```

### Mapa de pantallas

1. **Inicio / Nuevo caso** → genera IA automáticamente, muestra pulsera/etiqueta a imprimir.
2. **Fase 1 – Preparación** → 5 campos obligatorios (alergias, talla, peso, antecedentes,
   medicación). Botón "Continuar" deshabilitado hasta completar.
3. **Fase 2 – Quirófano** (hub con pestañas o secciones scroll):
   - 3a. **Checklist de seguridad** (4 confirmaciones sí/no grandes).
   - 3b. **Selección de monitorización** (grid de chips + "Añadir adicional").
   - 3c. **Técnica anestésica** (multiselección → campos específicos desplegables).
   - 3d. **Timeline / registro** (línea de tiempo viva de eventos).
   - 3e. **Gráficas** (tendencias en tiempo real).
4. **Hoja de registro seriado** (teclado numérico optimizado por parámetro).
5. **Modal Administrar fármaco** (Bolus / Perfusión).
6. **Modal Incidencia** (texto rápido + plantillas frecuentes).
7. **Cierre / Fin de cirugía** → resumen + firma + generación PDF/imagen + envío email.
8. **Visor de auditoría** (historial completo de cambios, solo lectura).

### Componentes de interfaz clave

- **BigButton** (≥64 pt, alto contraste, feedback háptico).
- **DrugChip / FavoritesRail**: carril horizontal de fármacos favoritos por especialidad.
- **NumericPad** grande con incrementos rápidos (±, presets) y unidades preseleccionadas.
- **VitalsQuickEntry**: una fila por parámetro seleccionado; foco automático al siguiente.
- **YesNoToggle** con tres estados visuales: Sí / No / Sin responder.
- **TrendChart**: curvas modernas, ejes clínicos (TA como sistólica/diastólica/media),
  bandas de alerta configurables.
- **TimelineFeed**: eventos cronológicos con iconografía por tipo y hora a la izquierda.
- **AutosaveIndicator** y **SyncStatus** (offline/pendiente/sincronizado).

---

## 7. Administración de fármacos y algoritmos de cálculo

### 7.1 Bolus

Campos: `fármaco`, `dosis`, `unidad`, **hora automática**.
Registro en 1–3 toques usando el carril de favoritos + numeric pad.

### 7.2 Perfusión — cálculos automáticos

Entradas:
- `A` = cantidad de principio activo (con su unidad, mg o mcg)
- `Vd` = volumen del disolvente (ml)
- `rate` = ritmo en ml/h
- `peso` = kg (editable → recalcula)

**Concentración final:**
```
C = A / Vtotal            (Vtotal ≈ Vd; opción de contar el volumen del fármaco)
```
Ejemplo: Noradrenalina 5 mg en 50 ml → C = 0,1 mg/ml = 100 mcg/ml.

**Dosis ponderada (según fármaco):**
```
mcg/kg/min = (rate_ml_h × C_mcg_ml) / (peso_kg × 60)
mcg/kg/h   = (rate_ml_h × C_mcg_ml) /  peso_kg
mg/kg/h    = (rate_ml_h × C_mg_ml)  /  peso_kg
```

**Cálculo inverso (introducir dosis → obtener ritmo):**
```
rate_ml_h = (dosisObjetivo × peso_kg × 60) / C_mcg_ml     // si dosis en mcg/kg/min
```

**Doble representación conservada en la hoja** (requisito clínico):
```
12 ml/h  /  0,08 mcg/kg/min
```
Se guardan *ambos* valores en el evento; si cambia el peso, se emite
`WEIGHT_UPDATED` y las perfusiones activas se **recalculan** dejando traza del cambio.

> **Salvaguarda de seguridad:** el sistema muestra alertas de rango (dosis fuera de
> límites habituales del fármaco) y exige confirmación explícita antes de registrar
> valores atípicos (soft-stop, no bloqueante).

### 7.3 Validación del dígito de control (IA)

Función pura reutilizable en cliente y servidor para verificar la pulsera al escanear.

---

## 8. Registro seriado y gráficas

- Cada 5–10 min la app **sugiere** (recordatorio no intrusivo) registrar constantes.
- Entrada optimizada: solo los parámetros seleccionados en 3b, teclado numérico grande,
  salto automático de campo, confirmación con un toque → `VITALS_RECORDED` con hora.
- **Gráficas** generadas en tiempo real desde `VitalsRecord`:
  - TA como par sistólica/diastólica con media; FC; SpO₂; ETCO₂; Temperatura; y
    cualquier parámetro adicional.
  - Marcadores verticales de eventos clave (intubación, inicio de perfusión, incidencia)
    superpuestos sobre las curvas → correlación visual inmediata.

---

## 9. Offline, autosave y sincronización

- **Local-first:** todo evento se escribe primero en el log local (autosave instantáneo).
- **Cola de sincronización** idempotente: los eventos se envían por `eventId` (UUID v7);
  el servidor deduplica. El orden se mantiene por `occurredAt`/`eventId`.
- **Resolución de conflictos**: al ser log append-only por caso y dispositivo, no hay
  edición concurrente destructiva; se hace *merge* por unión de eventos y ordenación
  temporal. Correcciones referencian el evento original.
- Indicadores de estado siempre visibles: `offline`, `pendiente de sync (n)`, `sincronizado`.

---

## 10. Auditoría, integridad y firma electrónica

- **Auditoría**: el log de eventos es inmutable; toda corrección/anulación es un evento
  nuevo con actor, hora y referencia al original. Además, `audit_log` registra accesos
  y resoluciones de identidad.
- **Integridad**: cadena de hashes (`prevHash → hash`) sobre los eventos del caso.
  Cualquier manipulación posterior rompe la cadena y es detectable.
- **Firma electrónica** al "Fin de cirugía":
  - Se congela la proyección final y se calcula un hash del expediente completo.
  - El anestesista responsable firma (biometría del dispositivo + credencial;
    preparado para certificado cualificado/eIDAS y sello de tiempo).
  - `CASE_SIGNED` almacena firmante, hora y hash firmado. El PDF incluye estos metadatos.

---

## 11. Integración con monitores (HL7/FHIR) — preparación

- **Capa anticorrupción**: los datos de monitores multiparamétricos entran por un
  gateway que traduce a nuestros eventos `VITALS_RECORDED` (origen = `device`).
- **Mapeo FHIR**: `Patient` (pseudónimo IA) · `Encounter` (Case) · `Observation`
  (constantes, con códigos LOINC) · `MedicationAdministration` (bolos/perfusiones) ·
  `Procedure` (técnicas) · `Provenance`/`AuditEvent` (auditoría) · `DocumentReference`
  (PDF de la hoja).
- Interfaz preparada para **HL7 v2** (ADT/ORU) y **FHIR R4**; distinción clara entre
  constantes **automáticas** (dispositivo) y **manuales** (usuario) en la hoja.

---

## 12. Finalización: PDF e imagen A4

Al pulsar **"Fin de cirugía"** se genera automáticamente, en **A4 vertical**:
- **PDF** apto para impresión inmediata e incorporación a la historia clínica.
- **Imagen** (PNG) de la misma hoja.

Contenido (proyecciones del log):
1. Cabecera con IA, fecha, duración, firmante.
2. Cronología completa de eventos.
3. Gráficas de tendencias con marcadores de eventos.
4. Técnicas anestésicas y sus detalles.
5. Medicación (bolos y perfusiones con doble representación).
6. Monitorización seleccionada y registros seriados.
7. Incidencias con timestamp.
8. Checklist de seguridad.
9. Resumen anestésico.
10. Pie con hash de integridad y datos de firma.

**Envío automático por email** al anestesista responsable (adjuntos cifrados;
la hoja es pseudonimizada, sin datos identificativos directos).

---

## 13. Stack tecnológico propuesto

- **Cliente:** iPadOS nativo (**Swift/SwiftUI**) por rendimiento táctil, háptica, teclado
  y fiabilidad offline. (Alternativa multiplataforma: React Native/Expo o Flutter si se
  requiere Android en el futuro.)
- **Persistencia local:** SQLite/GRDB con log de eventos + proyecciones.
- **Backend:** API (Node.js/NestJS o .NET) con **event store** + **PostgreSQL** para
  proyecciones; servicio de **Identidad/PID** aislado.
- **PDF:** generación server-side (o on-device) con plantilla A4 vectorial.
- **Interoperabilidad:** módulo FHIR R4 + gateway HL7 v2.
- **Seguridad:** cifrado en reposo y tránsito (TLS), gestión de claves, RBAC,
  registro de accesos.

---

## 14. Seguridad clínica y usabilidad en quirófano (justificación)

- **Carga cognitiva mínima**: una decisión por pantalla, favoritos, valores por defecto,
  hora automática. El clínico piensa en el paciente, no en la app.
- **Una mano / thumb zone**: acciones críticas siempre alcanzables con el pulgar; botones
  grandes reducen errores con guantes.
- **"No" explícito**: evita el sesgo de "campo vacío = todo bien"; obliga a decidir.
- **Fases bloqueantes**: garantizan que no se omite información crítica antes de anestesiar.
- **Event sourcing**: la trazabilidad médico-legal es intrínseca, no un añadido.
- **Pseudonimización por defecto**: cumple RGPD y protege al paciente si se pierde el iPad.
- **Doble representación de perfusiones**: evita errores de dosificación por unidades.

---

## 15. Mejoras adicionales propuestas (no solicitadas explícitamente)

1. **Alertas de dosis y rango** por fármaco y peso (soft-stop configurable).
2. **Detección de alergia cruzada**: si un fármaco administrado coincide con una alergia
   registrada en Fase 1 → aviso destacado antes de confirmar.
3. **Modo de urgencia / RCP**: botón que despliega cronómetro de RCP, ciclos, dosis de
   adrenalina cada 3–5 min y registro rápido de eventos de reanimación.
4. **Cálculo de balance hídrico** (entradas: sueros, hemoderivados; salidas: diuresis,
   sangrado) con totales automáticos.
5. **Plantillas por tipo de cirugía/técnica** (packs de fármacos y monitorización) para
   arrancar en segundos.
6. **Reconocimiento de voz** para incidencias con manos ocupadas (dictado → nota con hora).
7. **Escaneo de vial/etiqueta** (código de barras/DataMatrix) para autocompletar fármaco,
   concentración y lote → menos errores de transcripción.
8. **Anotación de la vía aérea** (esquema Cormack/HAN con dibujo) y foto de laringoscopia
   opcional (pseudonimizada).
9. **Checklist WHO ampliable** (entrada/pausa quirúrgica/salida) además del de equipos.
10. **Handover estructurado** (traspaso a REA/URPA) generado desde el resumen.
11. **Modo entrenamiento/simulación** claramente marcado (no genera hoja legal).
12. **Sincronización de reloj** (NTP) y aviso si el reloj del iPad diverge, para no
    comprometer la exactitud horaria de la cronología.
13. **Bloqueo de sesión** rápido y reanudación segura (privacidad si el iPad queda solo).
14. **Exportación estructurada** (FHIR Bundle) además del PDF, para historia clínica.

---

## 16. Roadmap sugerido de implementación

1. **MVP núcleo:** motor de eventos local, IA + validación, Fase 1, checklist, medicación
   (bolos/perfusión con cálculos), registro seriado, timeline, autosave.
2. **Gráficas y cierre:** tendencias, PDF/imagen A4, resumen anestésico, envío email.
3. **Sync + auditoría + firma:** backend event store, cola de sync, cadena de hashes,
   firma electrónica.
4. **Interoperabilidad:** gateway HL7/FHIR, ingesta de monitores, exportación FHIR.
5. **Mejoras de seguridad clínica:** alertas de dosis/alergias, modo RCP, escaneo de vial.
```

Este documento captura el diseño completo. A continuación te resumo lo esencial.


<invoke name="update_session_information">
<parameter name="title">Diseño hoja anestésica digital