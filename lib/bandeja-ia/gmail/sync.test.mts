import assert from 'node:assert/strict'
import test from 'node:test'

const NOW = new Date('2026-10-19T13:00:00Z')
const MAILBOX = 'casilla@organismo.example'

type Msg = { id: string; threadId: string; subject: string; from: string; snippet?: string; internalDate?: string }

function gmailMessage(message: Msg) {
  return {
    id: message.id,
    threadId: message.threadId,
    historyId: '1',
    internalDate: message.internalDate ?? String(Date.parse('2026-10-19T12:00:00Z')),
    labelIds: ['INBOX'],
    snippet: message.snippet ?? '',
    payload: { headers: [{ name: 'From', value: message.from }, { name: 'Subject', value: message.subject }] },
  }
}

async function fakeReader(options: { inbox?: Msg[]; history?: Msg[]; historyId?: string; failHistory?: number; deleted?: string[] } = {}) {
  const { GmailApiError } = await import('./client.ts')
  const all = new Map([...(options.inbox ?? []), ...(options.history ?? [])].map((message) => [message.id, message]))
  const calls = { watch: 0, history: 0, inbox: [] as string[] }
  return {
    calls,
    reader: {
      async getProfile() {
        return { emailAddress: MAILBOX, historyId: options.historyId ?? '500' }
      },
      async listInboxMessageIds(query: string) {
        calls.inbox.push(query)
        return { messages: (options.inbox ?? []).map((message) => ({ id: message.id, threadId: message.threadId })) }
      },
      async listHistory() {
        calls.history += 1
        if (options.failHistory) throw new GmailApiError(options.failHistory, 'falla')
        return {
          historyId: options.historyId ?? '600',
          history: [{ messagesAdded: (options.history ?? []).map((message) => ({ message: { id: message.id, threadId: message.threadId } })) }],
        }
      },
      async getMessageMetadata(id: string) {
        if (options.deleted?.includes(id)) throw new GmailApiError(404, 'no existe')
        return gmailMessage(all.get(id)!)
      },
      async watchInbox() {
        calls.watch += 1
        return { historyId: '500', expiration: String(NOW.getTime() + 7 * 24 * 3600 * 1000) }
      },
    },
  }
}

async function memoryStore(initial: { state?: Record<string, unknown>; asuntos?: Record<string, unknown>[]; storeSnippets?: boolean } = {}) {
  const { DEFAULT_RULES } = await import('../rules.ts')
  const { emptyState } = await import('./sync.ts')
  const db = {
    state: initial.state ? { ...emptyState(), ...initial.state } : null as Record<string, unknown> | null,
    messages: [] as Record<string, unknown>[],
    asuntos: (initial.asuntos ?? []) as Record<string, unknown>[],
    links: [] as [string, string][],
    runs: [] as Record<string, unknown>[],
    connected: false,
  }
  const store = {
    async getState() {
      return db.state as never
    },
    async saveState(_mailbox: string, state: Record<string, unknown>) {
      db.state = state
    },
    async startRun(_mailbox: string, kind: string, trigger: string) {
      db.runs.push({ kind, trigger, status: 'en_curso' })
      return String(db.runs.length - 1)
    },
    async finishRun(runId: string, result: Record<string, unknown>) {
      Object.assign(db.runs[Number(runId)], result)
    },
    async getSettings() {
      return { storeSnippets: Boolean(initial.storeSnippets), initialSyncDays: 14 }
    },
    async getRules() {
      return DEFAULT_RULES
    },
    async knownMessageIds(ids: string[]) {
      return new Set(db.messages.map((row) => row.gmail_message_id as string).filter((id) => ids.includes(id)))
    },
    async saveMessage(row: Record<string, unknown>) {
      if (db.messages.some((message) => message.gmail_message_id === row.gmail_message_id)) return null
      const id = `msg-${db.messages.length + 1}`
      db.messages.push({ ...row, id })
      return id
    },
    async findAsuntoByThread(threadId: string) {
      const row = db.asuntos.find((asunto) => asunto.gmail_thread_id === threadId)
      return row ? ({ id: row.id, priority: row.priority, priorityConfirmedAt: row.priority_confirmed_at ?? null, status: row.status, dueAt: row.due_at ?? null } as never) : null
    },
    async createAsunto(asunto: Record<string, unknown>) {
      if (db.asuntos.some((row) => row.gmail_thread_id === asunto.gmail_thread_id)) return null
      const id = `asunto-${db.asuntos.length + 1}`
      db.asuntos.push({ ...asunto, id })
      return id
    },
    async updateAsunto(id: string, patch: Record<string, unknown>) {
      Object.assign(db.asuntos.find((row) => row.id === id)!, patch)
    },
    async linkMessage(asuntoId: string, messageId: string) {
      db.links.push([asuntoId, messageId])
    },
    async markConnected() {
      db.connected = true
    },
  }
  return { db, store }
}

test('la primera corrida es inicial: renueva el aviso, guarda metadatos y crea asuntos clasificados', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const { reader, calls } = await fakeReader({
    historyId: '500',
    inbox: [
      { id: 'g1', threadId: 't1', subject: 'URGENTE: informe para la Intendencia', from: 'Despacho <despacho@municipio.example>', snippet: 'Remitir antes del 20/10' },
      { id: 'g2', threadId: 't2', subject: 'Newsletter semanal', from: 'no-reply@boletin.example', snippet: 'Por favor no responder' },
      { id: 'g3', threadId: 't1', subject: 'Re: URGENTE: informe para la Intendencia', from: 'Despacho <despacho@municipio.example>' },
    ],
  })
  const { db, store } = await memoryStore()

  const summary = await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'manual', now: () => NOW })

  assert.equal(summary.ok, true)
  assert.equal(summary.kind, 'inicial')
  assert.equal(summary.watchRenewed, true)
  assert.equal(calls.watch, 1)
  assert.deepEqual(calls.inbox, ['in:inbox newer_than:14d'])
  assert.equal(summary.stored, 3)
  assert.equal(db.asuntos.length, 2, 'un asunto por conversacion')
  const urgente = db.asuntos.find((row) => row.gmail_thread_id === 't1')!
  assert.equal(urgente.priority, 'critica')
  assert.equal(urgente.title, 'URGENTE: informe para la Intendencia')
  assert.equal(db.asuntos.find((row) => row.gmail_thread_id === 't2')!.priority, 'informativa')
  assert.equal(db.links.length, 3)
  assert.equal(db.state!.lastHistoryId, '500')
  assert.equal(db.state!.needsFullSync, false)
  assert.equal(db.state!.status, 'ok')
  assert.equal(db.connected, true)
  // El extracto se usa para clasificar pero no se guarda (store_snippets apagado).
  assert.ok(db.messages.every((row) => row.snippet === null))
})

test('la incremental solo procesa lo nuevo y no duplica', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const future = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000).toISOString()
  const { db, store } = await memoryStore({ state: { lastHistoryId: '500', needsFullSync: false, watchExpiration: future } })
  db.messages.push({ id: 'msg-viejo', gmail_message_id: 'g1' })
  const { reader, calls } = await fakeReader({
    historyId: '650',
    history: [
      { id: 'g1', threadId: 't1', subject: 'Ya guardado', from: 'a@b.example' },
      { id: 'g9', threadId: 't9', subject: 'Convocatoria a reunión', from: 'agenda@municipio.example' },
      { id: 'g9', threadId: 't9', subject: 'Convocatoria a reunión', from: 'agenda@municipio.example' },
    ],
  })

  const summary = await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'pubsub', now: () => NOW })

  assert.equal(summary.kind, 'incremental')
  assert.equal(calls.watch, 0, 'el aviso todavia no vence')
  assert.equal(summary.found, 1)
  assert.equal(db.asuntos.length, 1)
  assert.equal(db.asuntos[0].category, 'reunion')
  assert.equal(db.state!.lastHistoryId, '650')
})

test('un mensaje nuevo en una conversacion cerrada la reabre y sube la prioridad si nadie la confirmo', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const future = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000).toISOString()
  const { db, store } = await memoryStore({
    state: { lastHistoryId: '500', needsFullSync: false, watchExpiration: future },
    asuntos: [
      { id: 'a-cerrado', gmail_thread_id: 't1', priority: 'normal', status: 'resuelto', priority_confirmed_at: null },
      { id: 'a-confirmado', gmail_thread_id: 't2', priority: 'normal', status: 'en_revision', priority_confirmed_at: '2026-10-18T10:00:00Z' },
    ],
  })
  const { reader } = await fakeReader({
    history: [
      { id: 'g5', threadId: 't1', subject: 'URGENTE: falta respuesta', from: 'a@b.example' },
      { id: 'g6', threadId: 't2', subject: 'URGENTE: otra cosa', from: 'a@b.example' },
    ],
  })

  await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'pubsub', now: () => NOW })

  const cerrado = db.asuntos.find((row) => row.id === 'a-cerrado')!
  assert.equal(cerrado.status, 'nuevo')
  assert.equal(cerrado.priority, 'critica')
  const confirmado = db.asuntos.find((row) => row.id === 'a-confirmado')!
  assert.equal(confirmado.priority, 'normal', 'la prioridad confirmada por una persona no se pisa')
})

test('si el historyId vencio (404) marca resincronizacion completa', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const future = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000).toISOString()
  const { db, store } = await memoryStore({ state: { lastHistoryId: '10', needsFullSync: false, watchExpiration: future } })
  const { reader } = await fakeReader({ failHistory: 404 })

  const summary = await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'cron', now: () => NOW })

  assert.equal(summary.ok, false)
  assert.equal(db.state!.needsFullSync, true)
  assert.equal(db.state!.status, 'error')
  assert.equal(db.runs[0].status, 'error')
})

test('un token revocado (401) deja el estado en "reconectar" y programa reintento', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const future = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000).toISOString()
  const { db, store } = await memoryStore({ state: { lastHistoryId: '10', needsFullSync: false, watchExpiration: future } })
  const { reader } = await fakeReader({ failHistory: 401 })

  await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'cron', now: () => NOW })

  assert.equal(db.state!.status, 'reconectar')
  assert.equal(db.state!.consecutiveFailures, 1)
  assert.ok(db.state!.nextRetryAt)
})

test('respeta la espera entre reintentos', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const future = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000).toISOString()
  const { db, store } = await memoryStore({ state: { lastHistoryId: '10', needsFullSync: false, watchExpiration: future, nextRetryAt: '2026-10-19T13:05:00Z' } })
  const { reader, calls } = await fakeReader({})

  const summary = await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'pubsub', now: () => NOW })

  assert.equal(summary.kind, 'esperar')
  assert.equal(calls.history, 0)
  assert.equal(db.runs.length, 0)
})

test('ignora mensajes borrados entre el aviso y la lectura', async () => {
  const { runGmailSync } = await import('./sync.ts')
  const future = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000).toISOString()
  const { db, store } = await memoryStore({ state: { lastHistoryId: '10', needsFullSync: false, watchExpiration: future } })
  const { reader } = await fakeReader({ history: [{ id: 'gx', threadId: 'tx', subject: 'Borrado', from: 'a@b.example' }], deleted: ['gx'] })

  const summary = await runGmailSync({ reader, store, mailbox: MAILBOX, trigger: 'pubsub', now: () => NOW })

  assert.equal(summary.ok, true)
  assert.equal(db.messages.length, 0)
})

test('la fecha de vencimiento de un mensaje nuevo solo reemplaza si es mas cercana y futura', async () => {
  const { asuntoPatchForNewMessage } = await import('./sync.ts')
  const nowIso = NOW.toISOString()
  const base = { id: 'a', priority: 'alta' as const, priorityConfirmedAt: null, status: 'en_revision' as const }

  assert.deepEqual(asuntoPatchForNewMessage({ ...base, dueAt: '2026-10-25T12:00:00Z' }, { priority: 'normal', reasons: [], dueAt: '2026-10-21T12:00:00Z' }, nowIso), { due_at: '2026-10-21T12:00:00Z' })
  assert.deepEqual(asuntoPatchForNewMessage({ ...base, dueAt: '2026-10-21T12:00:00Z' }, { priority: 'normal', reasons: [], dueAt: '2026-10-25T12:00:00Z' }, nowIso), {})
  assert.deepEqual(asuntoPatchForNewMessage({ ...base, dueAt: null }, { priority: 'normal', reasons: [], dueAt: '2026-10-10T12:00:00Z' }, nowIso), {})
})
