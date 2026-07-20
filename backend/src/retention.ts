import { config } from "./config";
import { cases } from "./repo";
import { audit } from "./db";

/** Autoborrado: elimina los casos cuya ultima actividad supera la retencion (RGPD). */
export function purgeExpired(): number {
  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const expired = cases.expired.all(cutoff);
  for (const c of expired) {
    cases.delete.run(c.case_id);
    audit({ action: "AUTO_PURGE", targetType: "case", targetId: c.ia, detail: `Retencion ${config.retentionDays} dias` });
  }
  if (expired.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[retention] Autoborrado de ${expired.length} caso(s) por retencion.`);
  }
  return expired.length;
}

export function startRetentionJob(): void {
  purgeExpired();
  setInterval(purgeExpired, 60 * 60 * 1000); // cada hora
}
