import { MIGUES } from '@/lib/migue'
import { generateIngestToken, hashIngestToken } from '@/lib/migue-ingest'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NO_STORE = { 'Cache-Control': 'no-store' }

const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: NO_STORE })

// Genera (o reemplaza) la clave con la que un Migue reporta sus conversaciones. Solo el equipo
// DIA. La clave se devuelve una unica vez; en la base queda solo su hash (supabase/add_migue.sql).
export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) return reply({ error: 'Supabase no esta configurado.' }, 500)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return reply({ error: 'Sesion no autorizada.' }, 401)

  const { data: team, error: teamError } = await supabase.rpc('current_team_slug')
  if (teamError || team !== 'dia') return reply({ error: 'Solo el equipo DIA genera claves de Migue.' }, 403)

  let slug = ''
  try {
    const body = (await request.json()) as { slug?: unknown }
    slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  } catch {
    return reply({ error: 'El cuerpo no es JSON valido.' }, 400)
  }
  if (!SLUG.test(slug)) return reply({ error: 'Falta el identificador del Migue.' }, 400)

  const fromCode = MIGUES.find((migue) => migue.slug === slug)
  if (fromCode?.internal) return reply({ error: `${fromCode.name} reporta desde este mismo dashboard: no necesita clave.` }, 400)
  if (!fromCode) {
    // Un Migue agregado desde el dashboard: tiene que existir y estar visible.
    const { data: profile, error: profileError } = await supabase.from('migue_profiles').select('slug').eq('slug', slug).eq('active', true).maybeSingle()
    if (profileError || !profile) return reply({ error: 'No hay un Migue con ese identificador.' }, 404)
  }

  const admin = getSupabaseAdminClient()
  if (!admin) return reply({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' }, 500)

  const token = generateIngestToken()
  const { error: saveError } = await admin.from('migue_ingest_keys').upsert(
    { migue_slug: slug, token_hash: await hashIngestToken(token), active: true, created_at: new Date().toISOString(), last_used_at: null },
    { onConflict: 'migue_slug' },
  )
  if (saveError) return reply({ error: 'No se pudo guardar la clave. Falta ejecutar supabase/add_migue.sql?' }, 500)

  return reply({ token })
}
