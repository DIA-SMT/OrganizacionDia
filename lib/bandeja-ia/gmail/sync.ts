// Motor de sincronizacion Gmail -> Bandeja IA. SOLO SERVIDOR.
// Lee la casilla en solo lectura (metadatos), guarda los mensajes nuevos y crea o
// actualiza un asunto por conversacion, clasificado con las reglas. No responde, no
// borra ni modifica correos. Separado de Supabase y de Gmail por interfaces para poder
// testearlo con datos en memoria (sync.test.mts).

import { classifyMessage, dueDateFromClassification, priorityWeight } from '../rules.ts'
import { tucumanDateTimeToIso } from '../time.ts'
import type { BandejaPriority, BandejaStatus, ClassificationRule, DetectedDate } from '../types.ts'
import { GmailApiError, type GmailReader } from './client.ts'
import {
  classifyGmailError,
  initialSyncQuery,
  needsWatchRenewal,
  newMessageIds,
  planSync,
  stateAfterFailure,
  stateAfterSuccess,
  toMetadataRow,
  type ErrorAction,
  type MessageMetadataRow,
  type SyncKind,
  type SyncState,
} from './sync-plan.ts'

export type SyncTrigger = 'pubsub' | 'cron' | 'manual'

export type StoredSyncState = SyncState & {
  status: 'desconectado' | 'sincronizando' | 'ok' | 'error' | 'reconectar'
  lastError: string | null
  lastSyncAt: string | null
  lastFullSyncAt: string | null
}

export type ExistingAsunto = {
  id: string
  priority: BandejaPriority
  priorityConfirmedAt: string | null
  status: BandejaStatus
  dueAt: string | null
}

export type NewAsunto = {
  gmail_thread_id: string
  title: string
  category: string
  priority: BandejaPriority
  suggested_priority: BandejaPriority
  priority_reasons: string[]
  requires_response: boolean
  detected_dates: DetectedDate[]
  due_at: string | null
  status: 'nuevo'
}

export interface SyncStore {
  getState(mailbox: string): Promise<StoredSyncState | null>
  saveState(mailbox: string, state: StoredSyncState): Promise<void>
  startRun(mailbox: string, kind: SyncKind | 'watch', trigger: SyncTrigger): Promise<string>
  finishRun(runId: string, result: { status: 'ok' | 'error'; found: number; stored: number; error: string | null }): Promise<void>
  getSettings(): Promise<{ storeSnippets: boolean; initialSyncDays: number }>
  getRules(): Promise<ClassificationRule[]>
  knownMessageIds(gmailIds: string[]): Promise<Set<string>>
  // Devuelve el id de la fila, o null si el mensaje ya estaba guardado.
  saveMessage(row: MessageMetadataRow): Promise<string | null>
  findAsuntoByThread(threadId: string): Promise<ExistingAsunto | null>
  // Devuelve el id, o null si otra corrida creo el asunto de esa conversacion al mismo tiempo.
  createAsunto(asunto: NewAsunto): Promise<string | null>
  updateAsunto(id: string, patch: Record<string, unknown>): Promise<void>
  linkMessage(asuntoId: string, messageId: string): Promise<void>
  markConnected(mailbox: string): Promise<void>
}

export type GmailReaderLike = Pick<GmailReader, 'listInboxMessageIds' | 'listHistory' | 'getMessageMetadata' | 'getProfile' | 'watchInbox'>

export type SyncSummary = {
  ok: boolean
  kind: SyncKind | 'esperar'
  found: number
  stored: number
  createdAsuntos: number
  updatedAsuntos: number
  watchRenewed: boolean
  partial: boolean
  error: string | null
  warnings: string[]
}

// Topes por corrida para entrar en el limite de tiempo de Vercel.
export const INITIAL_MESSAGE_LIMIT = 300
const MAX_HISTORY_PAGES = 20
const METADATA_CONCURRENCY = 4

const CLOSED: BandejaStatus[] = ['resuelto', 'descartado']

export function emptyState(): StoredSyncState {
  return {
    lastHistoryId: null,
    watchExpiration: null,
    needsFullSync: true,
    consecutiveFailures: 0,
    nextRetryAt: null,
    status: 'desconectado',
    lastError: null,
    lastSyncAt: null,
    lastFullSyncAt: null,
  }
}

function errorAction(error: unknown): ErrorAction {
  if (error instanceof GmailApiError) return classifyGmailError(error.status, error.reason, error.detail)
  return { action: 'reintentar', message: error instanceof Error ? error.message : 'Error desconocido' }
}

// Cambios sobre un asunto existente cuando llega otro mensaje de la misma conversacion.
export function asuntoPatchForNewMessage(existing: ExistingAsunto, incoming: { priority: BandejaPriority; reasons: string[]; dueAt: string | null }, nowIso: string) {
  const patch: Record<string, unknown> = {}
  // Una persona ya confirmo la prioridad: las reglas no la pisan.
  if (!existing.priorityConfirmedAt && priorityWeight(incoming.priority) > priorityWeight(existing.priority)) {
    patch.priority = incoming.priority
    patch.suggested_priority = incoming.priority
    patch.priority_reasons = incoming.reasons
  }
  if (incoming.dueAt && incoming.dueAt >= nowIso && (!existing.dueAt || existing.dueAt < nowIso || incoming.dueAt < existing.dueAt)) {
    patch.due_at = incoming.dueAt
  }
  // Una respuesta en una conversacion cerrada vuelve a pedir atencion.
  if (CLOSED.includes(existing.status)) patch.status = 'nuevo'
  return patch
}

async function mapLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>, shouldStop: () => boolean) {
  let index = 0
  async function next(): Promise<void> {
    while (index < items.length && !shouldStop()) {
      const item = items[index++]
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
}

export async function runGmailSync(options: {
  reader: GmailReaderLike
  store: SyncStore
  mailbox: string
  trigger: SyncTrigger
  now?: () => Date
  budgetMs?: number
  // "Sincronizar ahora" desde Configuracion: no espera el reintento programado.
  ignoreBackoff?: boolean
}): Promise<SyncSummary> {
  const { reader, store, mailbox, trigger } = options
  const now = options.now ?? (() => new Date())
  const startedAt = now().getTime()
  const outOfTime = () => now().getTime() - startedAt > (options.budgetMs ?? 45_000)

  const summary: SyncSummary = { ok: false, kind: 'esperar', found: 0, stored: 0, createdAsuntos: 0, updatedAsuntos: 0, watchRenewed: false, partial: false, error: null, warnings: [] }
  let state = (await store.getState(mailbox)) ?? emptyState()
  if (options.ignoreBackoff) state = { ...state, nextRetryAt: null }

  // 1) Aviso de Gmail (watch): vence a los 7 dias y se renueva con margen. Si falla, se
  //    sigue igual: el cron hace de respaldo.
  if (needsWatchRenewal(state.watchExpiration, now())) {
    try {
      const watch = await reader.watchInbox()
      state = { ...state, watchExpiration: new Date(Number(watch.expiration)).toISOString() }
      summary.watchRenewed = true
    } catch (error) {
      summary.warnings.push(`No se pudo renovar el aviso de Gmail: ${errorAction(error).message}`)
    }
  }

  const plan = planSync(state, now())
  if (plan.kind === 'esperar') {
    await store.saveState(mailbox, state)
    return { ...summary, ok: true, kind: 'esperar' }
  }
  summary.kind = plan.kind

  const runId = await store.startRun(mailbox, plan.kind, trigger)
  await store.saveState(mailbox, { ...state, status: 'sincronizando' })

  try {
    const settings = await store.getSettings()
    const rules = await store.getRules()
    let ids: string[] = []
    let newHistoryId: string

    if (plan.kind === 'inicial') {
      // Primero el historyId actual: lo que llegue mientras tanto lo toma la proxima corrida.
      newHistoryId = (await reader.getProfile()).historyId
      let pageToken: string | undefined
      do {
        const page = await reader.listInboxMessageIds(initialSyncQuery(settings.initialSyncDays), pageToken)
        ids.push(...(page.messages ?? []).map((message) => message.id))
        pageToken = page.nextPageToken
      } while (pageToken && ids.length < INITIAL_MESSAGE_LIMIT)
      if (ids.length > INITIAL_MESSAGE_LIMIT) {
        ids = ids.slice(0, INITIAL_MESSAGE_LIMIT)
        summary.warnings.push(`La sincronización inicial trae los ${INITIAL_MESSAGE_LIMIT} correos más recientes.`)
      }
    } else {
      newHistoryId = plan.startHistoryId
      let pageToken: string | undefined
      let pages = 0
      do {
        const page = await reader.listHistory(plan.startHistoryId, pageToken)
        for (const entry of page.history ?? []) ids.push(...(entry.messagesAdded ?? []).map((added) => added.message.id))
        newHistoryId = page.historyId
        pageToken = page.nextPageToken
        pages += 1
      } while (pageToken && pages < MAX_HISTORY_PAGES)
      if (pageToken) {
        // Quedaron paginas: no se avanza el historyId para no perder nada.
        newHistoryId = plan.startHistoryId
        summary.partial = true
      }
    }

    const pending = newMessageIds(ids, await store.knownMessageIds([...new Set(ids)]))
    summary.found = pending.length
    const nowIso = now().toISOString()

    await mapLimited(
      pending,
      METADATA_CONCURRENCY,
      async (gmailId) => {
        let message
        try {
          message = await reader.getMessageMetadata(gmailId)
        } catch (error) {
          // El mensaje se borro entre el aviso y la lectura: se ignora.
          if (error instanceof GmailApiError && error.status === 404) return
          throw error
        }

        const row = toMetadataRow(message, { storeSnippet: settings.storeSnippets })
        const messageId = await store.saveMessage(row)
        if (!messageId) return
        summary.stored += 1

        // Se clasifica con el extracto en memoria aunque no se guarde.
        const receivedAt = row.received_at ? new Date(row.received_at) : now()
        const result = classifyMessage({ subject: row.subject, snippet: message.snippet ?? '', fromName: row.from_name, fromAddress: row.from_address }, receivedAt, rules)
        const due = dueDateFromClassification(result)
        const dueAt = due ? tucumanDateTimeToIso(due.date, due.time) : null

        let asuntoId: string | null = null
        const existing = await store.findAsuntoByThread(row.gmail_thread_id)
        if (!existing) {
          asuntoId = await store.createAsunto({
            gmail_thread_id: row.gmail_thread_id,
            title: row.subject,
            category: result.category,
            priority: result.priority,
            suggested_priority: result.priority,
            priority_reasons: result.reasons,
            requires_response: result.requiresResponse,
            detected_dates: result.detectedDates,
            due_at: dueAt,
            status: 'nuevo',
          })
          if (asuntoId) summary.createdAsuntos += 1
        }

        const target = asuntoId ? null : existing ?? (await store.findAsuntoByThread(row.gmail_thread_id))
        if (target) {
          asuntoId = target.id
          const patch = asuntoPatchForNewMessage(target, { priority: result.priority, reasons: result.reasons, dueAt }, nowIso)
          if (Object.keys(patch).length > 0) {
            await store.updateAsunto(target.id, patch)
            summary.updatedAsuntos += 1
          }
        }

        if (asuntoId) await store.linkMessage(asuntoId, messageId)
      },
      () => {
        if (!outOfTime()) return false
        summary.partial = true
        return true
      },
    )

    // Cortada por tiempo en una incremental: se repite desde el mismo punto (sin duplicar).
    if (summary.partial && plan.kind === 'incremental') newHistoryId = plan.startHistoryId

    const finishedAt = now().toISOString()
    state = {
      ...stateAfterSuccess(state, newHistoryId),
      status: 'ok',
      lastError: summary.warnings[0] ?? null,
      lastSyncAt: finishedAt,
      lastFullSyncAt: plan.kind === 'inicial' ? finishedAt : state.lastFullSyncAt,
    }
    await store.saveState(mailbox, state)
    await store.finishRun(runId, { status: 'ok', found: summary.found, stored: summary.stored, error: null })
    await store.markConnected(mailbox)
    return { ...summary, ok: true }
  } catch (error) {
    const action = errorAction(error)
    state = {
      ...state,
      ...stateAfterFailure(state, action, now()),
      status: action.action === 'reconectar' ? 'reconectar' : 'error',
      lastError: action.message,
    }
    await store.saveState(mailbox, state)
    await store.finishRun(runId, { status: 'error', found: summary.found, stored: summary.stored, error: action.message })
    return { ...summary, ok: false, error: action.message }
  }
}
