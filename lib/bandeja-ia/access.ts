// Permisos de Bandeja IA. Pertenecer a DIA o tener rol Admin en el Dashboard NO alcanza:
// hace falta un registro especifico (tabla bandeja_ia_permissions, o la lista de demo del
// servidor mientras la migracion no este aplicada). Sin registro valido, acceso denegado.

import type { BandejaRole } from './types.ts'

export const BANDEJA_ROUTE = '/bandeja-ia'

export const ROLE_LABELS: Record<BandejaRole, string> = {
  admin: 'Administración',
  operador: 'Operador',
  lector: 'Lectura',
}

export type BandejaAccessSource = 'permisos' | 'demo'

export type BandejaAccessDeniedReason = 'sin-sesion' | 'equipo' | 'sin-permiso' | 'sin-configuracion' | 'error'

export type BandejaAccess =
  | { allowed: true; role: BandejaRole; source: BandejaAccessSource }
  | { allowed: false; reason: BandejaAccessDeniedReason }

export function isBandejaRole(value: unknown): value is BandejaRole {
  return value === 'admin' || value === 'operador' || value === 'lector'
}

export function canOperate(role: BandejaRole | null | undefined): boolean {
  return role === 'admin' || role === 'operador'
}

export function canAdminister(role: BandejaRole | null | undefined): boolean {
  return role === 'admin'
}

// BANDEJA_IA_DEMO_ACCESS="ana@smt.gob.ar:admin, bruno@smt.gob.ar, carla@smt.gob.ar:lector"
// Sin rol explicito es operador. Entradas invalidas se ignoran (nunca amplian el acceso).
export function parseDemoAccessList(raw: string | undefined | null): Map<string, BandejaRole> {
  const access = new Map<string, BandejaRole>()
  for (const entry of (raw ?? '').split(',')) {
    const [emailPart, rolePart] = entry.split(':').map((value) => value.trim())
    const email = emailPart?.toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) continue
    const role = rolePart ? rolePart.toLowerCase() : 'operador'
    if (!isBandejaRole(role)) continue
    access.set(email, role)
  }
  return access
}

export function demoRoleForEmail(raw: string | undefined | null, email: string | null | undefined): BandejaRole | null {
  if (!email) return null
  return parseDemoAccessList(raw).get(email.trim().toLowerCase()) ?? null
}

// PostgREST responde PGRST202 (o Postgres 42883) cuando la funcion no existe: base sin la
// migracion add_bandeja_ia.sql. Solo en ese caso se usa la lista de demo.
export function isMissingFunctionError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '')
}
