import { createClient } from '@/lib/supabase/server'

type MemberLookup = {
  id: string
  role: string
  full_name: string | null
  email: string | null
  team_id: string | null
  teams: { slug: string; name: string } | null
}

const MEMBER_SELECT = 'id, role, full_name, email, team_id, teams:team_id (slug, name)'
const LEGACY_MEMBER_SELECT = 'id, role, full_name, email'

function normalizeRole(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'Admin' || normalized === 'PM' || normalized === 'Dev' || normalized === 'QA' || normalized === 'Viewer') {
    return normalized
  }
  return 'Viewer'
}

type MemberFilter = { column: 'auth_user_id'; value: string } | { column: 'email'; value: string }

async function lookupMember(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  filter: MemberFilter
): Promise<MemberLookup | null> {
  function buildQuery(select: string) {
    const query = supabase.from('members').select(select).eq('active', true)
    return filter.column === 'auth_user_id'
      ? query.eq('auth_user_id', filter.value)
      : query.ilike('email', filter.value)
  }

  const { data, error } = await buildQuery(MEMBER_SELECT).maybeSingle()

  if (!error) {
    return data as MemberLookup | null
  }

  // Base sin migrar (add_teams.sql pendiente): reintenta sin datos de equipo.
  const { data: legacy } = await buildQuery(LEGACY_MEMBER_SELECT).maybeSingle()

  if (!legacy) {
    return null
  }

  return { ...(legacy as unknown as Omit<MemberLookup, 'team_id' | 'teams'>), team_id: null, teams: null }
}

export async function GET() {
  const supabase = await createClient()

  if (!supabase) {
    return Response.json({ user: null, role: null, memberId: null, configured: false }, { status: 200 })
  }

  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    return Response.json({ user: null }, { status: 401 })
  }

  let member = await lookupMember(supabase, { column: 'auth_user_id', value: data.user.id })

  const userEmail = data.user.email?.trim()

  if (!member && userEmail) {
    member = await lookupMember(supabase, { column: 'email', value: userEmail })
  }

  return Response.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      memberId: member?.id ?? null,
      memberName: member?.full_name ?? null,
      role: normalizeRole(member?.role),
      teamId: member?.team_id ?? null,
      teamSlug: member?.teams?.slug ?? null,
      teamName: member?.teams?.name ?? null,
      configured: true,
    },
    { status: 200 }
  )
}
