import { config } from "./config";
import { cases, type CaseFull } from "./repo";
import { audit } from "./db";

function cutoffIso(): string {
  return new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Autoborrado (RGPD). Por defecto en MODO SIMULACIÓN (config.retentionDryRun): no borra
 * nada, solo registra en auditoría qué casos borraría. Para borrar de verdad hay que
 * poner RETENTION_DRY_RUN=false. Si la consulta falla, NO se borra nada.
 */
export async function purgeExpired(): Promise<number> {
  let expired: CaseFull[];
  try {
    expired = await cases.purgeable(cutoffIso());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[retention] no se pudo calcular la lista; no se borra nada:", (e as Error).message);
    return 0;
  }

  if (config.retentionDryRun) {
    for (const c of expired) {
      audit({
        action: "AUTO_PURGE_SIMULADO",
        targetType: "case",
        targetId: c.ia,
        detail: `SIMULACIÓN (no se borra) · estado=${c.status} · última actividad=${c.last_activity}`,
      });
    }
    // eslint-disable-next-line no-console
    if (expired.length > 0) console.log(`[retention] SIMULACIÓN: se borrarían ${expired.length} caso(s) (RETENTION_DRY_RUN activo).`);
    return 0;
  }

  let deleted = 0;
  for (const c of expired) {
    try {
      await cases.delete(c.case_id);
      deleted++;
      audit({ action: "AUTO_PURGE", targetType: "case", targetId: c.ia, detail: `Retención ${config.retentionDays} días (firmado y enviado)` });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[retention] fallo al borrar", c.ia, (e as Error).message);
    }
  }
  // eslint-disable-next-line no-console
  if (deleted > 0) console.log(`[retention] Autoborrado de ${deleted} caso(s) por retención.`);
  return deleted;
}

export interface RetentionPreview {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  ok: boolean;
  error?: string;
  cases: { ia: string; status: string; lastActivity: string; signedAt: string | null }[];
}

/** Previsualiza qué casos borraría el autoborrado (misma consulta que el borrado real). */
export async function retentionPreview(): Promise<RetentionPreview> {
  const cutoff = cutoffIso();
  try {
    const list = await cases.purgeable(cutoff);
    return {
      dryRun: config.retentionDryRun,
      retentionDays: config.retentionDays,
      cutoff,
      ok: true,
      cases: list.map((c) => ({ ia: c.ia, status: c.status, lastActivity: c.last_activity, signedAt: c.signed_at })),
    };
  } catch (e) {
    return { dryRun: config.retentionDryRun, retentionDays: config.retentionDays, cutoff, ok: false, error: (e as Error).message, cases: [] };
  }
}

export function startRetentionJob(): void {
  void purgeExpired().catch((e) => console.error("[retention]", e));
  setInterval(() => void purgeExpired().catch((e) => console.error("[retention]", e)), 60 * 60 * 1000);
}
