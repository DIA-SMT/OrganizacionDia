import { readGmailStatus } from '@/lib/bandeja-ia/gmail/config'
import { resolveBandejaAccess } from '@/lib/bandeja-ia/server-access'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// Estado de la integracion con Gmail para la pantalla de Configuracion: que variables estan
// cargadas (true/false, nunca su valor) y como vienen las sincronizaciones. No llama a Google.
export async function GET() {
  const access = await resolveBandejaAccess()
  if (!access.allowed) return Response.json({ error: 'No autorizado.' }, { status: 403, headers: NO_STORE })

  const status = readGmailStatus()
  const mailbox = process.env.BANDEJA_IA_GMAIL_MAILBOX?.trim().toLowerCase()
  const db = getSupabaseAdminClient()

  let sync: Record<string, unknown> | null = null
  let runs: Record<string, unknown>[] = []
  if (db && mailbox) {
    const [state, recent] = await Promise.all([
      db
        .from('bandeja_ia_sync_state')
        .select('status, watch_expiration, needs_full_sync, consecutive_failures, next_retry_at, last_sync_at, last_full_sync_at, last_error')
        .eq('mailbox_address', mailbox)
        .maybeSingle(),
      db
        .from('bandeja_ia_sync_runs')
        .select('kind, trigger, status, messages_found, messages_stored, error, started_at, finished_at')
        .eq('mailbox_address', mailbox)
        .order('started_at', { ascending: false })
        .limit(5),
    ])
    sync = state.data ?? null
    runs = recent.data ?? []
  }

  return Response.json({ ...status, syncImplemented: true, sync, runs }, { headers: NO_STORE })
}
