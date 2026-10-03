import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { authGuard, csrfGuard, requirePasswordChanged } from "../middleware";
import { audit } from "../db";

export const mailRouter = Router();

mailRouter.use(authGuard, csrfGuard, requirePasswordChanged);

const bodySchema = z.object({
  // PDF en base64 (con o sin prefijo data:). PDF vectorial + páginas rasterizadas: límite amplio.
  pdfBase64: z.string().min(16).max(12_000_000),
  ia: z.string().min(1).max(80),
  version: z.number().int().min(1).max(99).default(1),
  signedAt: z.string().datetime().optional(),
});

/** Formatea fecha y hora (es-ES, zona de Madrid) a partir de un ISO. */
function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Envía el PDF de la hoja anestésica como adjunto por correo al firmar.
// El asunto se construye SIEMPRE en el servidor, SIN tilde ("Hoja anestesica"),
// que es la palabra clave del disparador de Power Automate (archivado en OneDrive).
mailRouter.post("/send", async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos de correo no válidos" });
      return;
    }
    if (!config.mail.resendApiKey) {
      res.status(503).json({
        error: "El envío de correo no está configurado en el servidor. Falta la variable RESEND_API_KEY.",
        code: "MAIL_NOT_CONFIGURED",
      });
      return;
    }

    const { pdfBase64, version, signedAt } = parsed.data;
    const ia = parsed.data.ia.trim().replace(/[\r\n]/g, "");
    const content = pdfBase64.includes(",") ? pdfBase64.slice(pdfBase64.indexOf(",") + 1) : pdfBase64;
    const filename = `${ia}.pdf`;

    // Asunto sin tilde + número; en reenvíos tras volver a firmar, "(version N)".
    const subject = `Hoja anestesica ${ia}${version > 1 ? ` (version ${version})` : ""}`;
    const when = fmtDateTime(signedAt ?? new Date().toISOString());
    const text = `Hoja anestesica ${ia}. Firmada el ${when}. Documento pseudonimizado (RGPD), identificado unicamente por IA.`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mail.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: config.mail.to.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        text,
        attachments: [{ filename, content, contentType: "application/pdf" }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error("[mail] Resend rechazó el envío", resp.status, detail);
      audit({
        userId: req.user?.id,
        username: req.user?.username,
        action: "SHEET_MAIL_FAILED",
        targetType: "mail",
        targetId: `${config.mail.to} · ${subject}`,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        success: false,
      });
      res.status(502).json({ error: "El proveedor de correo rechazó el envío. Revisa la configuración del remitente." });
      return;
    }

    audit({
      userId: req.user?.id,
      username: req.user?.username,
      action: "SHEET_MAIL_SENT",
      targetType: "mail",
      targetId: `${config.mail.to} · ${subject}`,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      success: true,
    });
    res.json({ ok: true, to: config.mail.to, subject });
  } catch (err) {
    next(err);
  }
});
