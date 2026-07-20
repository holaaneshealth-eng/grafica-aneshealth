import type { AuthUser } from "./auth";

export interface CaseRow {
  case_id: string;
  owner_user_id: string;
  status: "active" | "closed" | "signed";
}

/**
 * Modelo de permisos:
 *  - admin: control total (leer, crear, escribir en cualquier caso, modificar/anular, gestionar usuarios, auditoria, borrar).
 *  - clinical (quirofano1-10, partos, endoscopias):
 *      * leer TODOS los casos,
 *      * crear casos (pasa a ser propietario),
 *      * escribir (append de eventos) SOLO en sus propios casos que sigan activos,
 *      * NO puede modificar/anular registros existentes,
 *      * NO puede gestionar usuarios ni ver la auditoria global ni borrar casos.
 */

export const isAdmin = (u: AuthUser): boolean => u.role === "admin";

export const canReadAllCases = (_u: AuthUser): boolean => true;

export const canCreateCase = (_u: AuthUser): boolean => true;

export function canAppendToCase(u: AuthUser, c: CaseRow): boolean {
  if (u.role === "admin") return true;
  return c.owner_user_id === u.id && c.status === "active";
}

/** Cerrar/firmar un caso: el propietario mientras esta activo, o un admin. */
export function canCloseCase(u: AuthUser, c: CaseRow): boolean {
  if (u.role === "admin") return true;
  return c.owner_user_id === u.id && c.status === "active";
}

/** Modificar/anular registros ya existentes: solo admin. */
export const canModifyRecords = (u: AuthUser): boolean => u.role === "admin";

export const canManageUsers = (u: AuthUser): boolean => u.role === "admin";

export const canViewAudit = (u: AuthUser): boolean => u.role === "admin";

export const canDeleteCase = (u: AuthUser): boolean => u.role === "admin";
