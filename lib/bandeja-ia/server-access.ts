import { demoRoleForEmail, isBandejaRole, isMissingFunctionError, type BandejaAccess } from '@/lib/bandeja-ia/access'
import { createClient } from '@/lib/supabase/server'

export type BandejaAccessResult = BandejaAccess & { actorId?: string; actorName?: string }

// Decide en el servidor si la persona logueada puede usar Bandeja IA:
// 1) sesion valida, 2) integrante activo del equipo DIA, 3) permiso especifico.
// El permiso sale de bandeja_ia_permissions (funcion bandeja_ia_current_role). Solo si esa
// funcion no existe (migracion sin aplicar) se usa BANDEJA_IA_DEMO_ACCESS, una lista del
// servidor para mostrar el MVP con datos ficticios. Sin registro valido: acceso denegado.
export async function resolveBandejaAccess(): Promise<BandejaAccessResult> {
  const supabase = await createClient()
  if (!supabase) return { allowed: false, reason: 'sin-configuracion' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { allowed: false, reason: 'sin-sesion' }

  const { data: teamSlug, error: teamError } = await supabase.rpc('current_team_slug')
  if (teamError || teamSlug !== 'dia') return { allowed: false, reason: 'equipo' }

  const { data: role, error: roleError } = await supabase.rpc('bandeja_ia_current_role')
  let access: BandejaAccess
  if (!roleError) {
    access = isBandejaRole(role) ? { allowed: true, role, source: 'permisos' } : { allowed: false, reason: 'sin-permiso' }
  } else if (isMissingFunctionError(roleError)) {
    const demoRole = demoRoleForEmail(process.env.BANDEJA_IA_DEMO_ACCESS, user.email)
    access = demoRole ? { allowed: true, role: demoRole, source: 'demo' } : { allowed: false, reason: 'sin-permiso' }
  } else {
    access = { allowed: false, reason: 'error' }
  }

  if (!access.allowed) return access

  // Nombre con el que quedan firmadas las acciones (tomar, asignar, notas).
  const { data: memberId } = await supabase.rpc('current_member_id')
  const { data: member } = memberId ? await supabase.from('members').select('full_name').eq('id', memberId).maybeSingle() : { data: null }

  return {
    ...access,
    actorId: typeof memberId === 'string' ? memberId : user.id,
    actorName: (member?.full_name as string | undefined) ?? user.email ?? 'Integrante',
  }
}
