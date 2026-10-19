import { canAdminister } from '@/lib/bandeja-ia/access'
import { mergeRules, type RuleRow } from '@/lib/bandeja-ia/db'
import { reclassifyPatch, type ReclassifyAsunto, type ReclassifyMessage } from '@/lib/bandeja-ia/reclassify'
import { resolveBandejaAccess } from '@/lib/bandeja-ia/server-access'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }
const PAGE = 500
const UPDATE_CONCURRENCY = 8

type Row = ReclassifyAsunto & { id: string; bandeja_ia_asunto_messages: { bandeja_ia_messages: ReclassifyMessage | null }[] | null }

// Aplica las reglas actuales a los asuntos existentes. Solo admin de Bandeja IA. Escribe con
// service role: el cambio queda en la auditoria como "Sistema" y no como confirmacion humana.
export async function POST() {
  const access = await resolveBandejaAccess()
  if (!access.allowed || !canAdminister(access.role)) return Response.json({ error: 'No autorizado.' }, { status: 401, headers: NO_STORE })

  const db = getSupabaseAdminClient()
  if (!db) return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500, headers: NO_STORE })

  const { data: ruleRows, error: rulesError } = await db.from('bandeja_ia_rules').select('*')
  if (rulesError) return Response.json({ error: rulesError.message }, { status: 500, headers: NO_STORE })
  const rules = mergeRules((ruleRows ?? []) as RuleRow[])

  const now = new Date()
  const patches: { id: string; patch: Record<string, unknown> }[] = []
  let reviewed = 0

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('bandeja_ia_asuntos')
      .select('id, category, priority, priority_confirmed_at, due_at, bandeja_ia_asunto_messages(bandeja_ia_messages(subject, snippet, from_name, from_address, received_at))')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return Response.json({ error: error.message }, { status: 500, headers: NO_STORE })

    for (const row of (data ?? []) as unknown as Row[]) {
      // Se clasifica con el primer mensaje de la conversacion, el que origino el asunto.
      const messages = (row.bandeja_ia_asunto_messages ?? [])
        .map((link) => link.bandeja_ia_messages)
        .filter((message): message is ReclassifyMessage => Boolean(message))
        .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? ''))
      if (messages.length === 0) continue
      reviewed += 1
      const patch = reclassifyPatch(row, messages[0], rules, now)
      if (patch) patches.push({ id: row.id, patch })
    }
    if (!data || data.length < PAGE) break
  }

  let updated = 0
  let failed = 0
  for (let index = 0; index < patches.length; index += UPDATE_CONCURRENCY) {
    const results = await Promise.all(
      patches.slice(index, index + UPDATE_CONCURRENCY).map(({ id, patch }) => db.from('bandeja_ia_asuntos').update(patch).eq('id', id)),
    )
    for (const result of results) {
      if (result.error) failed += 1
      else updated += 1
    }
  }

  const changedTo = (category: string) => patches.filter(({ patch }) => patch.category === category).length

  return Response.json(
    { ok: failed === 0, reviewed, updated, failed, basesPorPausarse: changedTo('base_pausa'), posiblesEventos: changedTo('invitacion') },
    { status: failed === 0 ? 200 : 207, headers: NO_STORE },
  )
}
