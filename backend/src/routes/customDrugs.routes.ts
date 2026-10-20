import { Router } from "express";
import { audit } from "../db";
import { customDrugs, type CustomDrugRow } from "../repo";
import { authGuard, csrfGuard, requirePasswordChanged } from "../middleware";
import { newId } from "../domain";
import { createCustomDrugSchema } from "../validation";

export const customDrugsRouter = Router();

// Catálogo compartido de fármacos añadidos a mano. Cualquier usuario autenticado puede
// consultarlo y añadir; así queda disponible para todos y en todos los dispositivos.
customDrugsRouter.use(authGuard, csrfGuard, requirePasswordChanged);

interface DrugDefDto {
  name: string;
  group: string;
  defaultUnit: string;
  commonBolus?: number[];
  infusionDoseUnit?: string;
  concVol?: boolean;
}

function toDef(r: CustomDrugRow): DrugDefDto {
  let commonBolus: number[] | undefined;
  if (r.common_bolus) {
    try {
      const a = JSON.parse(r.common_bolus);
      if (Array.isArray(a)) commonBolus = a.filter((n) => typeof n === "number");
    } catch {
      /* JSON inválido: se ignora */
    }
  }
  return {
    name: r.name,
    group: r.group_name,
    defaultUnit: r.default_unit,
    ...(commonBolus && commonBolus.length ? { commonBolus } : {}),
    ...(r.infusion_dose_unit ? { infusionDoseUnit: r.infusion_dose_unit } : {}),
    ...(r.conc_vol === 1 ? { concVol: true } : {}),
  };
}

customDrugsRouter.get("/", async (_req, res, next) => {
  try {
    res.json({ drugs: (await customDrugs.all()).map(toDef) });
  } catch (err) {
    next(err);
  }
});

customDrugsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createCustomDrugSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos", detail: parsed.error.issues[0]?.message });
      return;
    }
    const d = parsed.data;
    const name = d.name.trim();
    if (!name) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }
    // Deduplicación sin distinguir mayúsculas: si ya existe, se devuelve el existente.
    const existing = await customDrugs.byNameCI(name);
    if (existing) {
      res.json({ drug: toDef(existing), deduped: true });
      return;
    }
    const row = {
      id: newId(),
      name,
      group: (d.group ?? "Otro").trim() || "Otro",
      defaultUnit: (d.defaultUnit ?? "mg").trim() || "mg",
      commonBolus: d.commonBolus && d.commonBolus.length ? d.commonBolus : null,
      infusionDoseUnit: d.infusionDoseUnit?.trim() || null,
      concVol: !!d.concVol,
      createdBy: req.user!.id,
      createdAt: new Date().toISOString(),
    };
    await customDrugs.insert(row);
    audit({ userId: req.user!.id, username: req.user!.username, action: "CUSTOM_DRUG_ADDED", targetType: "drug", targetId: name, ip: req.ip });
    const saved = await customDrugs.byNameCI(name);
    res.status(201).json({ drug: saved ? toDef(saved) : toDef({ id: row.id, name, group_name: row.group, default_unit: row.defaultUnit, common_bolus: row.commonBolus ? JSON.stringify(row.commonBolus) : null, infusion_dose_unit: row.infusionDoseUnit, conc_vol: row.concVol ? 1 : 0, created_by: row.createdBy, created_at: row.createdAt }) });
  } catch (err) {
    next(err);
  }
});

customDrugsRouter.delete("/:id", async (req, res, next) => {
  try {
    await customDrugs.remove(req.params.id);
    audit({ userId: req.user!.id, username: req.user!.username, action: "CUSTOM_DRUG_REMOVED", targetType: "drug", targetId: req.params.id, ip: req.ip });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
