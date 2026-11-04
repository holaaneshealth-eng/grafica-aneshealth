import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { authGuard, csrfGuard, requirePasswordChanged } from "../middleware";
import { audit, dbFeatures } from "../db";

export const visionRouter = Router();

visionRouter.use(authGuard, csrfGuard, requirePasswordChanged);

// Estado del registro por foto: Claude (Vía 2, requiere clave) y fotos (Vía 1, requiere
// que la tabla case_photos se haya creado correctamente).
visionRouter.get("/status", (_req, res) => {
  res.json({ claudeAvailable: !!config.vision.anthropicApiKey, model: config.vision.model, photosEnabled: dbFeatures.photos });
});

const bodySchema = z.object({
  // Foto del monitor en base64 (con o sin prefijo data:). Límite amplio para fotos de móvil.
  imageBase64: z.string().min(16).max(12_000_000),
  mimeType: z.string().max(60).default("image/jpeg"),
});

// Vocabulario de parámetros que el programa entiende (debe coincidir con monitoring.ts).
const KNOWN = ["FC", "TAS", "TAD", "TAM", "PAIS", "PAID", "PAIM", "SPO2", "ETCO2", "FICO2", "FR", "PVC", "BIS", "TEMP", "VT", "PEEP", "FIO2", "PPICO", "CAM"];

const PROMPT = `Eres un lector de las TENDENCIAS TABULARES de un monitor de anestesia (Mindray ePM/BeneVision). Debes aceptar DOS formatos equivalentes:
  (A) la pantalla "Tend. tabulares" del monitor (pocas columnas), y
  (B) la VISTA PREVIA DE IMPRESIÓN del informe de tendencias tabulares: una hoja con MUCHAS más columnas y, a veces, cabecera de informe (nombre, fecha, nº de página).
Ambos formatos son válidos y se leen igual: una rejilla de parámetros (filas) por instantes de tiempo (columnas).

Devuelve EXCLUSIVAMENTE un objeto JSON (sin texto, sin markdown, sin explicaciones):
{"fecha":"YYYY-MM-DD" o null, "lecturas":[{"hora":"HH:MM","parametro":"CODIGO","valor":numero,"unidad":"texto"}]}

Comprobación de pantalla válida:
- Solo son válidas las tendencias tabulares (formato A o B). Si la imagen es OTRA cosa (monitorización en tiempo real con curvas/ondas, menús, configuración, una sola columna de cifras grandes, etc.), devuelve {"fecha":null,"lecturas":[]}.
- La vista previa de impresión del informe de tendencias tabulares (B) SIEMPRE se considera válida, aunque tenga muchas columnas o cabeceras de informe.

Cómo leer la rejilla (MUY IMPORTANTE: no confundas filas ni columnas):
- El tiempo está en las CABECERAS DE COLUMNA (HH:MM). Lee TODAS las columnas, de izquierda a derecha, sin saltarte ninguna (en el formato B pueden ser muchas y con intervalos pequeños, p. ej. cada 1 o 5 min).
- Cada FILA es un parámetro (su etiqueta está a la izquierda). El valor de una celda pertenece al parámetro de SU fila y a la hora de SU columna.
- Alinea con cuidado celda por celda respetando las líneas de la rejilla. Si una celda está vacía, con "---" o ilegible, OMÍTELA; NUNCA desplaces un valor a otra fila o columna para rellenar huecos.
- En la vista de impresión los parámetros pueden ir agrupados en bloques (p. ej. Hemodinámica, Respiratorio, Gases): procésalos todos.

Reglas de mapeo (iguales en A y B):
- Usa EXACTAMENTE estos códigos cuando corresponda: ${KNOWN.join(", ")}.
- Tensión arterial NO invasiva (etiquetas Mindray: PANI, PNI, NIBP): sistólica -> TAS, diastólica -> TAD, media (entre paréntesis) -> TAM.
- Tensión arterial INVASIVA / arterial (etiquetas Mindray: PA, ART, ABP, IBP): sistólica -> PAIS, diastólica -> PAID, media (entre paréntesis) -> PAIM.
- Temperatura (T1, T2) -> TEMP. Frecuencia respiratoria (FR) -> FR. CO2 espirado -> ETCO2; CO2 inspirado -> FICO2. Presión venosa central (PVC) -> PVC. BIS -> BIS. Presión pico de la vía aérea -> PPICO. CAM/MAC del halogenado -> CAM.
- IGNORA (no las incluyas): la "FP" (frecuencia de pulso, duplica la FC), los subtítulos tipo "Origen: SpO2" y el sello de hora de la medición DENTRO de una celda (la hora buena es la de la cabecera de la columna).
- "fecha": la de la cabecera (del monitor o del informe) si aparece; si no, null.
- "valor" numérico (punto decimal). "hora" en 24h HH:MM tal como aparece en la cabecera de su columna.
- Incluye una lectura SOLO si puedes leerla con seguridad. Si dudas de un valor, OMÍTELO.
- Si ves un parámetro que NO está en la lista, inclúyelo con su etiqueta tal cual en "parametro".
- No inventes columnas, horas ni valores que no estén en la imagen.`;

export interface VisionReading {
  hora: string;
  parametro: string;
  valor: number;
  unidad?: string;
}

function extractJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  // Prioriza un objeto {...}; si no, un array [...].
  const ob = t.indexOf("{");
  const cb = t.lastIndexOf("}");
  const oa = t.indexOf("[");
  const ca = t.lastIndexOf("]");
  if (ob >= 0 && cb > ob && (oa < 0 || ob < oa)) return JSON.parse(t.slice(ob, cb + 1));
  if (oa >= 0 && ca > oa) return JSON.parse(t.slice(oa, ca + 1));
  return JSON.parse(t);
}

visionRouter.post("/import", async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Imagen no válida" });
      return;
    }
    if (!config.vision.anthropicApiKey) {
      res.status(503).json({
        error: "La importación desde foto no está configurada en el servidor. Falta la variable ANTHROPIC_API_KEY.",
        code: "VISION_NOT_CONFIGURED",
      });
      return;
    }

    const { imageBase64 } = parsed.data;
    const mediaType = (parsed.data.mimeType || "image/jpeg").toLowerCase();
    const data = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.vision.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.vision.model,
        // La vista previa de impresión (formato B) tiene muchas más columnas -> muchas más
        // lecturas; se amplía el límite para que la respuesta JSON no se trunque.
        max_tokens: 8000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error("[vision] Anthropic rechazó la petición", resp.status, detail.slice(0, 500));
      audit({
        userId: req.user?.id,
        username: req.user?.username,
        action: "VISION_IMPORT_FAILED",
        targetType: "vision",
        ip: req.ip,
        userAgent: req.get("user-agent"),
        success: false,
      });
      res.status(502).json({ error: "El servicio de visión no pudo procesar la foto. Inténtalo de nuevo." });
      return;
    }

    const result = (await resp.json()) as { content?: { type: string; text?: string }[] };
    const text = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

    let readings: VisionReading[] = [];
    let fecha: string | null = null;
    try {
      const parsed = extractJson(text) as unknown;
      const obj = parsed as { fecha?: unknown; lecturas?: unknown } | null;
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(obj?.lecturas) ? (obj!.lecturas as unknown[]) : [];
      if (obj && !Array.isArray(parsed) && typeof obj.fecha === "string") fecha = obj.fecha;
      readings = arr
        .map((r) => r as Record<string, unknown>)
        .filter((r) => r && typeof r.hora === "string" && typeof r.parametro === "string" && r.valor != null && isFinite(Number(r.valor)))
        .map((r) => ({ hora: String(r.hora), parametro: String(r.parametro).trim(), valor: Number(r.valor), unidad: r.unidad != null ? String(r.unidad) : undefined }));
    } catch {
      // eslint-disable-next-line no-console
      console.error("[vision] no se pudo interpretar la respuesta del modelo");
      res.status(502).json({ error: "No se pudo interpretar la lectura de la foto. Prueba con una foto más nítida." });
      return;
    }

    audit({
      userId: req.user?.id,
      username: req.user?.username,
      action: "VISION_IMPORT",
      targetType: "vision",
      targetId: `${readings.length} lecturas`,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      success: true,
    });
    // La foto NO se guarda: queda solo en memoria durante la petición.
    res.json({ readings, fecha });
  } catch (err) {
    next(err);
  }
});
