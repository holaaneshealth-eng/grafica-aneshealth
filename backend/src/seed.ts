import fs from "fs";
import { config } from "./config";
import { users } from "./repo";
import { hashPassword, generatePassword, type Role } from "./auth";
import { newId } from "./domain";
import { audit } from "./db";

interface SeedSpec {
  username: string;
  displayName: string;
  role: Role;
  location: string | null;
}

function buildSpecs(): SeedSpec[] {
  const specs: SeedSpec[] = [{ username: "admin", displayName: "Administrador", role: "admin", location: null }];
  for (let i = 1; i <= 10; i++) {
    specs.push({ username: `quirofano${i}`, displayName: `Quirofano ${i}`, role: "clinical", location: `Quirofano ${i}` });
  }
  specs.push({ username: "partos", displayName: "Partos", role: "clinical", location: "Partos" });
  specs.push({ username: "endoscopias", displayName: "Endoscopias", role: "clinical", location: "Endoscopias" });
  return specs;
}

/** Crea los usuarios iniciales si la base de datos esta vacia. */
export async function seedUsers(): Promise<void> {
  if ((await users.count()) > 0) return;

  const specs = buildSpecs();
  const lines: string[] = [];
  const generated: string[] = [];
  lines.push("CREDENCIALES INICIALES - AnesHealth");
  lines.push("Generadas: " + new Date().toISOString());
  lines.push("IMPORTANTE: cambia estas contrasenas en el primer inicio de sesion.");
  lines.push("");

  for (const s of specs) {
    let plain: string;
    let mustChange = true;
    if (s.role === "admin" && config.seed.adminPassword) {
      plain = config.seed.adminPassword;
      mustChange = false;
    } else if (s.role === "clinical" && config.seed.clinicalPasswordPrefix) {
      plain = `${config.seed.clinicalPasswordPrefix}-${s.username}`;
      mustChange = false;
    } else {
      plain = generatePassword();
      mustChange = true;
      generated.push(`${s.username.padEnd(14)} | ${plain}`);
    }

    const hash = await hashPassword(plain);
    await users.insert({
      id: newId(),
      username: s.username,
      display_name: s.displayName,
      role: s.role,
      location: s.location,
      password_hash: hash,
      must_change_password: mustChange ? 1 : 0,
      created_at: new Date().toISOString(),
    });
    lines.push(`${s.username.padEnd(14)} | ${s.role.padEnd(8)} | ${plain}`);
  }

  try {
    fs.writeFileSync(config.credentialsFile, lines.join("\n") + "\n", { mode: 0o600 });
  } catch {
    /* el sistema de archivos puede ser efimero (p.ej. Render); no es critico */
  }
  audit({ action: "SEED_USERS", detail: `Creados ${specs.length} usuarios`, targetType: "users" });

  // eslint-disable-next-line no-console
  console.log(`\n[seed] Se crearon ${specs.length} usuarios.`);
  logGenerated(generated);
}

function logGenerated(generated: string[]): void {
  if (generated.length > 0) {
    // eslint-disable-next-line no-console
    console.log("[seed] Contrasenas generadas (cambialas en el primer login):\n" + generated.join("\n") + "\n");
  }
}

/**
 * Restablece la contrasena de 'admin' si se define ADMIN_PASSWORD_RESET.
 * No aplica la politica de fortaleza (es una accion explicita del operador via entorno).
 * Ejecutar en cada arranque; retirar la variable cuando ya no se necesite.
 */
export async function resetAdminIfRequested(): Promise<void> {
  const pw = config.seed.adminPasswordReset;
  if (!pw) return;
  const admin = await users.byUsername("admin");
  if (!admin) return;
  const hash = await hashPassword(pw);
  await users.setPassword(admin.id, hash);
  audit({ action: "ADMIN_PASSWORD_RESET_ENV", targetType: "user", targetId: "admin" });
  // eslint-disable-next-line no-console
  console.log("[admin] Contrasena de 'admin' restablecida mediante ADMIN_PASSWORD_RESET.");
}
