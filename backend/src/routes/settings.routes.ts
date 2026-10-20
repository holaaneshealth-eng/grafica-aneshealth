import { Router } from "express";
import { audit } from "../db";
import { appSettings } from "../repo";
import { authGuard, csrfGuard, requireAdmin, requirePasswordChanged } from "../middleware";
import { settingsSchema } from "../validation";

export const settingsRouter = Router();

// Ajustes globales de la aplicación. Lectura para cualquier usuario; escritura solo admin.
settingsRouter.use(authGuard, requirePasswordChanged);

const DEFAULTS = { laborFirstTestMin: 60, laborReevalMin: 100 };

settingsRouter.get("/", async (_req, res) => {
  try {
    const map: Record<string, string> = {};
    for (const r of await appSettings.all()) map[r.key] = r.value;
    res.json({
      laborFirstTestMin: map.laborFirstTestMin ? Number(map.laborFirstTestMin) : DEFAULTS.laborFirstTestMin,
      laborReevalMin: map.laborReevalMin ? Number(map.laborReevalMin) : DEFAULTS.laborReevalMin,
    });
  } catch {
    // Si la tabla no está disponible, se devuelven los valores por defecto.
    res.json(DEFAULTS);
  }
});

settingsRouter.put("/", csrfGuard, requireAdmin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", detail: parsed.error.issues[0]?.message });
      return;
    }
    const d = parsed.data;
    if (d.laborFirstTestMin != null) await appSettings.set("laborFirstTestMin", String(d.laborFirstTestMin));
    if (d.laborReevalMin != null) await appSettings.set("laborReevalMin", String(d.laborReevalMin));
    audit({ userId: req.user!.id, username: req.user!.username, action: "SETTINGS_UPDATED", ip: req.ip });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
