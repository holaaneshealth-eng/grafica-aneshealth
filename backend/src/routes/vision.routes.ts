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

const PROMPT = `Eres un lector de las TENDENCIAS TABULARES de un monitor de anestesia (Mindray ePM/BeneVision). Acepta DOS presentaciones:
  (A) la PANTALLA "Tend. tabulares" del monitor: el TIEMPO va en las CABECERAS DE COLUMNA (HH:MM) y cada parámetro es una FILA (etiqueta a la izquierda).
  (B) la VISTA PREVIA DE IMPRESIÓN del informe de tendencias tabulares: aquí suele ir AL REVÉS: el TIEMPO va en FILAS (una fila por instante, HH:MM a la izquierda) y cada parámetro es una COLUMNA (etiqueta en la cabecera superior). Puede haber muchas filas y columnas y cabecera de informe (nombre, fecha, nº de página).
Ambas son válidas. Detecta la orientación mirando dónde están las horas HH:MM: si encabezan columnas es (A); si encabezan filas es (B).

Devuelve EXCLUSIVAMENTE un objeto JSON (sin texto, sin markdown, sin explicaciones):
{"fecha":"YYYY-MM-DD" o null, "lecturas":[{"hora":"HH:MM","parametro":"CODIGO","valor":numero_o_texto,"unidad":"texto"}]}
Cada "lectura" es el cruce de UN parámetro con UN instante de tiempo (su HH:MM), venga el tiempo de una columna (A) o de una fila (B). No confundas filas con columnas: respeta la rejilla celda a celda.

Comprobación de pantalla válida:
- Solo son válidas las tendencias tabulares (A o B). Si la imagen es otra cosa (monitorización en tiempo real con curvas/ondas, menús, configuración, una sola cifra grande…), devuelve {"fecha":null,"lecturas":[]}.
- La vista previa de impresión (B) SIEMPRE es válida, aunque tenga muchas columnas/filas o cabeceras de informe.

Tensión arterial (regla especial, MUY IMPORTANTE):
- La TA se mide de forma intermitente y su celda suele llevar SU PROPIA HORA de medición (p. ej. "124/55(74) 17:35" en la fila/columna de las 17:40).
- Para la TA emite UNA sola lectura por medición: "parametro" = "PANI" (no invasiva: PANI/PNI/NIBP) o "PA" (invasiva: PA/ART/ABP/IBP); "valor" = el TEXTO exacto "sistolica/diastolica(media)", p. ej. "124/55(74)"; "hora" = la HORA DE MEDICIÓN de la propia celda (NO la de la fila/columna). Si la celda no trae hora propia, usa la del eje.
- NO repitas una misma medición de TA aunque aparezca arrastrada en varias filas/columnas: emítela UNA sola vez, en su hora de medición.

Resto de parámetros:
- "valor" NUMÉRICO (punto decimal). Usa EXACTAMENTE estos códigos cuando corresponda: ${KNOWN.join(", ")}.
- SpO2 -> SPO2. FC -> FC. Temperatura (T1, T2) -> TEMP. FR -> FR. CO2 espirado -> ETCO2; CO2 inspirado -> FICO2. PVC -> PVC. BIS -> BIS. Presión pico vía aérea -> PPICO. CAM/MAC del halogenado -> CAM.
- IGNORA la "FP" (frecuencia de pulso, duplica la FC) y los subtítulos tipo "Origen: SpO2".
- Las cifras RESALTADAS o sombreadas (en negro, amarillo o rojo) son valores EN ALARMA: léelas IGUAL que las demás, no las descartes.
- Los guiones "--" (o celda vacía) significan SIN DATO: omítelos.
- Si ves un parámetro que NO está en la lista, inclúyelo con su etiqueta tal cual en "parametro".

Generales:
- "fecha": la de la cabecera (del monitor o del informe) si aparece; si no, null.
- "hora" en 24h HH:MM. Incluye una lectura SOLO si la lees con seguridad; ante la duda, omítela. No inventes filas, columnas, horas ni valores.`;

export interface VisionReading {
  hora: string;
  parametro: string;
  // Número para la mayoría; texto para la tensión arterial ("124/55(74)"), que se
  // desglosa en el cliente en sistólica/diastólica/media.
  valor: number | string;
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

    const result = (await resp.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const text = (result.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

    // Diagnóstico (NUNCA la imagen): motivo de parada y respuesta en bruto. Si stop_reason es
    // "max_tokens" la respuesta viene cortada (subir max_tokens).
    // eslint-disable-next-line no-console
    console.log(`[vision] stop_reason=${result.stop_reason ?? "?"} textLen=${text.length}`);
    // eslint-disable-next-line no-console
    console.log("[vision] respuesta en bruto:", text.slice(0, 4000));

    // Etiquetas de tensión arterial: su valor llega como texto ("124/55(74)"), no numérico.
    const isBpLabel = (p: string) => /^(pani|pni|nibp|ta|nbp|pa|art|abp|ibp)\b/i.test(p);

    let readings: VisionReading[] = [];
    let fecha: string | null = null;
    try {
      const parsed = extractJson(text) as unknown;
      const obj = parsed as { fecha?: unknown; lecturas?: unknown } | null;
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(obj?.lecturas) ? (obj!.lecturas as unknown[]) : [];
      if (obj && !Array.isArray(parsed) && typeof obj.fecha === "string") fecha = obj.fecha;
      readings = arr
        .map((r) => r as Record<string, unknown>)
        .filter((r) => r && typeof r.hora === "string" && typeof r.parametro === "string" && r.valor != null)
        .map((r) => {
          const parametro = String(r.parametro).trim();
          const n = Number(r.valor);
          // Numérico si se puede; si no (TA "124/55(74)", etc.) se conserva el texto.
          const valor: number | string = isFinite(n) && String(r.valor).trim() !== "" ? n : String(r.valor).trim();
          return { hora: String(r.hora), parametro, valor, unidad: r.unidad != null ? String(r.unidad) : undefined };
        })
        // Numéricos: finitos. Texto: solo se conserva para la TA (y debe contener algún dígito).
        .filter((r) => (typeof r.valor === "number" ? isFinite(r.valor) : isBpLabel(r.parametro) && /\d/.test(r.valor)));
    } catch {
      // eslint-disable-next-line no-console
      console.error("[vision] no se pudo interpretar la respuesta del modelo. stop_reason=", result.stop_reason);
      res.status(502).json({
        error: "No se pudo leer la tabla de la foto. Repite la foto, guárdala por la Vía 1 (imagen) o registra las constantes a mano.",
        code: "VISION_UNREADABLE",
      });
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
