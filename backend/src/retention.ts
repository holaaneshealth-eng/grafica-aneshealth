import { config } from "./config";
import { cases } from "./repo";
import { audit } from "./db";

/** Autoborrado: elimina los casos cuya ultima actividad supera la retencion (RGPD). */
export async function purgeExpired(): Promise<number> {
  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000).toISOString();
  // Solo se autoborran casos firmados Y ya enviados por correo. Los casos sin firmar y los
  // firmados pendientes de envío se conservan (borrado manual desde la lista). Las fotos del
  // monitor (case_photos) se eliminan en cascada al borrar el caso.
  const expired = await cases.purgeable(cutoff);
  for (const c of expired) {
    await cases.delete(c.case_id);
    audit({ action: "AUTO_PURGE", targetType: "case", targetId: c.ia, detail: `Retencion ${config.retentionDays} dias (firmado y enviado)` });
  }
  if (expired.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[retention] Autoborrado de ${expired.length} caso(s) por retencion.`);
  }
  return expired.length;
}

export function startRetentionJob(): void {
  void purgeExpired().catch((e) => console.error("[retention]", e));
  setInterval(() => void purgeExpired().catch((e) => console.error("[retention]", e)), 60 * 60 * 1000);
}
