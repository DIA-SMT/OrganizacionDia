import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  if (!supabase) {
    return Response.json({ user: null, role: null, memberId: null, configured: false }, { status: 200 })
  }

  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    return Response.json({ user: null }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, role, full_name, email')
    .or(`auth_user_id.eq.${data.user.id},email.eq.${data.user.email ?? ''}`)
    .eq('active', true)
    .maybeSingle()

  return Response.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      memberId: member?.id ?? null,
      memberName: member?.full_name ?? null,
      role: member?.role ?? 'Viewer',
      configured: true,
    },
    { status: 200 }
  )
}
