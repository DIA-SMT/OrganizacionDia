// SyncStore sobre Supabase con service role (saltea RLS). SOLO SERVIDOR: lo usan las rutas
// de sincronizacion, nunca el navegador. Los triggers de la base registran la auditoria
// con actor "Sistema" (sin integrante logueado).

import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeRules, type RuleRow } from '../db.ts'
import type { BandejaPriority, BandejaStatus } from '../types.ts'
import type { ExistingAsunto, NewAsunto, StoredSyncState, SyncStore } from './sync.ts'

const CHUNK = 200

function fail(action: string, error: { message: string } | null) {
  if (error) throw new Error(`No se pudo ${action}: ${error.message}`)
}

type SyncStateRow = {
  last_history_id: number | string | null
  watch_expiration: string | null
  needs_full_sync: boolean
  status: StoredSyncState['status']
  consecutive_failures: number
  next_retry_at: string | null
  last_sync_at: string | null
  last_full_sync_at: string | null
  last_error: string | null
}

export function createSupabaseSyncStore(db: SupabaseClient): SyncStore {
  return {
    async getState(mailbox) {
      const { data, error } = await db.from('bandeja_ia_sync_state').select('*').eq('mailbox_address', mailbox).maybeSingle()
      fail('leer el estado de sincronización', error)
      if (!data) return null
      const row = data as SyncStateRow
      return {
        lastHistoryId: row.last_history_id === null ? null : String(row.last_history_id),
        watchExpiration: row.watch_expiration,
        needsFullSync: row.needs_full_sync,
        consecutiveFailures: row.consecutive_failures,
        nextRetryAt: row.next_retry_at,
        status: row.status,
        lastError: row.last_error,
        lastSyncAt: row.last_sync_at,
        lastFullSyncAt: row.last_full_sync_at,
      }
    },

    async saveState(mailbox, state) {
      const { error } = await db.from('bandeja_ia_sync_state').upsert(
        {
          mailbox_address: mailbox,
          last_history_id: state.lastHistoryId,
          watch_expiration: state.watchExpiration,
          needs_full_sync: state.needsFullSync,
          status: state.status,
          consecutive_failures: state.consecutiveFailures,
          next_retry_at: state.nextRetryAt,
          last_sync_at: state.lastSyncAt,
          last_full_sync_at: state.lastFullSyncAt,
          last_error: state.lastError?.slice(0, 500) ?? null,
        },
        { onConflict: 'mailbox_address' },
      )
      fail('guardar el estado de sincronización', error)
    },

    async startRun(mailbox, kind, trigger) {
      const { data, error } = await db.from('bandeja_ia_sync_runs').insert({ mailbox_address: mailbox, kind, trigger }).select('id').single()
      fail('registrar la corrida', error)
      return (data as { id: string }).id
    },

    async finishRun(runId, result) {
      const { error } = await db
        .from('bandeja_ia_sync_runs')
        .update({
          status: result.status,
          messages_found: result.found,
          messages_stored: result.stored,
          error: result.error?.slice(0, 500) ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId)
      fail('cerrar la corrida', error)
    },

    async getSettings() {
      const { data, error } = await db.from('bandeja_ia_settings').select('store_snippets, initial_sync_days').maybeSingle()
      fail('leer la configuración', error)
      const row = data as { store_snippets: boolean; initial_sync_days: number } | null
      return { storeSnippets: Boolean(row?.store_snippets), initialSyncDays: row?.initial_sync_days ?? 30 }
    },

    async getRules() {
      const { data, error } = await db.from('bandeja_ia_rules').select('*')
      fail('leer las reglas', error)
      return mergeRules((data ?? []) as RuleRow[])
    },

    async knownMessageIds(ids) {
      const known = new Set<string>()
      for (let index = 0; index < ids.length; index += CHUNK) {
        const { data, error } = await db.from('bandeja_ia_messages').select('gmail_message_id').in('gmail_message_id', ids.slice(index, index + CHUNK))
        fail('consultar mensajes guardados', error)
        for (const row of (data ?? []) as { gmail_message_id: string }[]) known.add(row.gmail_message_id)
      }
      return known
    },

    async saveMessage(row) {
      const { data, error } = await db
        .from('bandeja_ia_messages')
        .upsert(row, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
        .select('id')
      fail('guardar el mensaje', error)
      return ((data ?? []) as { id: string }[])[0]?.id ?? null
    },

    async findAsuntoByThread(threadId) {
      const { data, error } = await db
        .from('bandeja_ia_asuntos')
        .select('id, priority, priority_confirmed_at, status, due_at')
        .eq('gmail_thread_id', threadId)
        .maybeSingle()
      fail('buscar el asunto', error)
      if (!data) return null
      const row = data as { id: string; priority: BandejaPriority; priority_confirmed_at: string | null; status: BandejaStatus; due_at: string | null }
      return { id: row.id, priority: row.priority, priorityConfirmedAt: row.priority_confirmed_at, status: row.status, dueAt: row.due_at } satisfies ExistingAsunto
    },

    async createAsunto(asunto: NewAsunto) {
      const { data, error } = await db
        .from('bandeja_ia_asuntos')
        .upsert(asunto, { onConflict: 'gmail_thread_id', ignoreDuplicates: true })
        .select('id')
      fail('crear el asunto', error)
      return ((data ?? []) as { id: string }[])[0]?.id ?? null
    },

    async updateAsunto(id, patch) {
      const { error } = await db.from('bandeja_ia_asuntos').update(patch).eq('id', id)
      fail('actualizar el asunto', error)
    },

    async linkMessage(asuntoId, messageId) {
      const { error } = await db
        .from('bandeja_ia_asunto_messages')
        .upsert({ asunto_id: asuntoId, message_id: messageId }, { onConflict: 'asunto_id,message_id', ignoreDuplicates: true })
      fail('vincular el mensaje', error)
    },

    async markConnected(mailbox) {
      const { error } = await db.from('bandeja_ia_settings').update({ gmail_enabled: true, mailbox_address: mailbox }).eq('id', true)
      fail('marcar la casilla como conectada', error)
    },
  }
}
