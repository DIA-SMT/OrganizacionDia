export const DIA_TEAM_SLUG = 'dia'

// Rutas accesibles para cualquier equipo. Todo lo que no figure aca
// (y no sea publico) es interno de DIA: cerrado por defecto.
const SHARED_ROUTE_PREFIXES = ['/projects', '/proyectos', '/team', '/equipo']

// Rutas fuera del dashboard (login y recuperacion de clave).
const PUBLIC_ROUTE_PREFIXES = ['/login', '/forgot-password', '/reset-password']

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// null = equipo desconocido (base sin migrar o usuario sin fila en members):
// se mantiene el comportamiento historico, sin restriccion de UI.
// Los datos ya estan protegidos por RLS.
export function isTeamRestricted(teamSlug: string | null): boolean {
  return teamSlug !== null && teamSlug !== DIA_TEAM_SLUG
}

export function canAccessRoute(teamSlug: string | null, pathname: string): boolean {
  if (!isTeamRestricted(teamSlug)) return true
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return true
  return SHARED_ROUTE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
}

export function homeRouteForTeam(teamSlug: string | null): string {
  return isTeamRestricted(teamSlug) ? '/projects' : '/'
}

export function filterNavItemsForTeam<T extends { href: string }>(teamSlug: string | null, items: T[]): T[] {
  if (!isTeamRestricted(teamSlug)) return items
  return items.filter((item) => canAccessRoute(teamSlug, item.href))
}
