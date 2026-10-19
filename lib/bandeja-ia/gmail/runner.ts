// Arma el cliente de Gmail y el store de Supabase y corre la sincronizacion. SOLO SERVIDOR.

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createGmailReader } from './client'
import { readGmailCredentials, readGmailStatus, type GmailCredentials } from './config'
import { createSupabaseSyncStore } from './supabase-store'
import { runGmailSync, type SyncStore, type SyncSummary, type SyncTrigger } from './sync'

export type SyncContext = { credentials: GmailCredentials; store: SyncStore; db: NonNullable<ReturnType<typeof getSupabaseAdminClient>> }

export type DisabledReason = { enabled: false; reason: string; missing: string[] }

// null en credentials = integracion apagada o incompleta: nadie llama a Google.
export function syncContext(): SyncContext | DisabledReason {
  const credentials = readGmailCredentials()
  if (!credentials) {
    const status = readGmailStatus()
    const reason = !status.flagEnabled
      ? 'La integración con Gmail está deshabilitada (BANDEJA_IA_GMAIL_ENABLED).'
      : status.exposedPublicVars.length > 0
        ? 'Hay variables de Gmail expuestas con NEXT_PUBLIC_.'
        : 'Faltan variables de configuración de Gmail.'
    return { enabled: false, reason, missing: status.missing }
  }
  const db = getSupabaseAdminClient()
  if (!db) return { enabled: false, reason: 'Falta SUPABASE_SERVICE_ROLE_KEY.', missing: ['SUPABASE_SERVICE_ROLE_KEY'] }
  return { credentials, store: createSupabaseSyncStore(db), db }
}

// Evita dos sincronizaciones a la vez en la misma instancia (push y cron juntos). Si igual
// coinciden en instancias distintas, las restricciones unique de la base evitan duplicados.
let running: Promise<SyncSummary> | null = null

export function syncNow(context: SyncContext, trigger: SyncTrigger, options: { ignoreBackoff?: boolean } = {}): Promise<SyncSummary> {
  if (running) return running
  running = runGmailSync({
    reader: createGmailReader(context.credentials),
    store: context.store,
    mailbox: context.credentials.mailbox,
    trigger,
    ignoreBackoff: options.ignoreBackoff,
  }).finally(() => {
    running = null
  })
  return running
}
