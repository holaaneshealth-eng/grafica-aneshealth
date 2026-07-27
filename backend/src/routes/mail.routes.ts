import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { authGuard, csrfGuard, requirePasswordChanged } from "../middleware";
import { audit } from "../db";

export const mailRouter = Router();

mailRouter.use(authGuard, csrfGuard, requirePasswordChanged);

const bodySchema = z.object({
  // base64 (con o sin prefijo data:); la imagen va limitada a <=870 KB => ~1,2 MB en base64.
  imageBase64: z.string().min(16).max(2_000_000),
  filename: z.string().min(1).max(160),
  mimeType: z.string().max(60).default("image/png"),
  subject: z.string().max(200).optional(),
});

// Envía la imagen de la hoja anestésica como adjunto por correo (para automatizar su
// archivado, p. ej. una regla de Power Automate que guarda el adjunto en OneDrive).
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

    const { imageBase64, filename, subject } = parsed.data;
    const content = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;
    // El asunto contiene siempre "Hoja anestesica" (palabra clave del disparador de Power Automate).
    const subj = subject && subject.trim() ? subject.trim() : "Hoja anestesica";

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.mail.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.mail.from,
        to: [config.mail.to],
        subject: subj,
        text: `Adjunto la hoja anestésica (${filename}). Documento pseudonimizado (RGPD), identificado únicamente por IA.`,
        attachments: [{ filename, content }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error("[mail] Resend rechazó el envío", resp.status, detail);
      audit({
        userId: req.user?.id,
        username: req.user?.username,
        action: "MAIL_SEND_FAILED",
        targetType: "mail",
        targetId: config.mail.to,
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
      action: "MAIL_SENT",
      targetType: "mail",
      targetId: config.mail.to,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      success: true,
    });
    res.json({ ok: true, to: config.mail.to });
  } catch (err) {
    next(err);
  }
});
