import { createClient } from '@/lib/supabase/server'

type MemberLookup = {
  id: string
  role: string
  full_name: string | null
  email: string | null
}

function normalizeRole(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'Admin' || normalized === 'PM' || normalized === 'Dev' || normalized === 'QA' || normalized === 'Viewer') {
    return normalized
  }
  return 'Viewer'
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

  let member: MemberLookup | null = null

  const { data: byAuthUser } = await supabase
    .from('members')
    .select('id, role, full_name, email')
    .eq('auth_user_id', data.user.id)
    .eq('active', true)
    .maybeSingle()

  member = byAuthUser as MemberLookup | null

  const userEmail = data.user.email?.trim()

  if (!member && userEmail) {
    const { data: byEmail } = await supabase
      .from('members')
      .select('id, role, full_name, email')
      .ilike('email', userEmail)
      .eq('active', true)
      .maybeSingle()

    member = byEmail as MemberLookup | null
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
      configured: true,
    },
    { status: 200 }
  )
}
