import {
  MAX_CONVERSATIONS_PER_REQUEST,
  bearerToken,
  conversationsFromBody,
  dedupeConversations,
  hashIngestToken,
  parseMigueConversation,
  type MigueConversationRow,
} from '@/lib/migue-ingest'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

// Entrada de metricas de los Migues externos. Cada bot se identifica con su clave
// (Authorization: Bearer ...); el slug sale de la clave. Formato en docs/migue-conexion.md.
export async function POST(request: Request) {
  const token = bearerToken(request.headers.get('authorization'))
  if (!token) return Response.json({ error: 'Falta la clave del Migue (Authorization: Bearer ...).' }, { status: 401 })

  const supabase = getSupabaseAdminClient()
  if (!supabase) return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' }, { status: 500 })

  const { data: key, error: keyError } = await supabase
    .from('migue_ingest_keys')
    .select('migue_slug')
    .eq('token_hash', await hashIngestToken(token))
    .eq('active', true)
    .maybeSingle()

  if (keyError) return Response.json({ error: 'No se pudo validar la clave. Falta ejecutar supabase/add_migue.sql?' }, { status: 500 })
  if (!key) return Response.json({ error: 'Clave invalida o desactivada.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'El cuerpo no es JSON valido.' }, { status: 400 })
  }

  const conversations = conversationsFromBody(body)
  if (!conversations) return Response.json({ error: 'Se espera { "conversations": [...] }.' }, { status: 400 })
  if (conversations.length === 0) return Response.json({ stored: 0, rejected: [] })
  if (conversations.length > MAX_CONVERSATIONS_PER_REQUEST) {
    return Response.json({ error: `Maximo ${MAX_CONVERSATIONS_PER_REQUEST} conversaciones por envio.` }, { status: 413 })
  }

  const now = Date.now()
  const rows: MigueConversationRow[] = []
  const rejected: { index: number; error: string }[] = []
  conversations.forEach((item, index) => {
    const parsed = parseMigueConversation(item, key.migue_slug, now)
    if (parsed.ok) rows.push(parsed.row)
    else rejected.push({ index, error: parsed.error })
  })

  const unique = dedupeConversations(rows)
  if (unique.length > 0) {
    // Reenviar la misma conversacion (mismo conversation_id) actualiza sus valores acumulados.
    const { error } = await supabase.from('migue_conversations').upsert(unique, { onConflict: 'migue_slug,external_id' })
    if (error) return Response.json({ error: 'No se pudieron guardar las conversaciones.' }, { status: 500 })
    // Solo cuenta como uso de la clave si se guardo algo (un lote todo rechazado no la activa).
    await supabase.from('migue_ingest_keys').update({ last_used_at: new Date(now).toISOString() }).eq('migue_slug', key.migue_slug)
  }

  return Response.json({ stored: unique.length, rejected })
}
