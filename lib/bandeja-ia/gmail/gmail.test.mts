import assert from 'node:assert/strict'
import test from 'node:test'

const FULL_ENV = {
  BANDEJA_IA_GMAIL_ENABLED: 'true',
  BANDEJA_IA_GMAIL_CLIENT_ID: 'id',
  BANDEJA_IA_GMAIL_CLIENT_SECRET: 'secreto',
  BANDEJA_IA_GMAIL_REFRESH_TOKEN: 'refresh',
  BANDEJA_IA_GMAIL_MAILBOX: 'Casilla@Organismo.example',
  BANDEJA_IA_PUBSUB_TOPIC: 'projects/demo/topics/bandeja',
  BANDEJA_IA_PUBSUB_AUDIENCE: 'https://dashboard.example/api/bandeja-ia/gmail/push',
  BANDEJA_IA_CRON_SECRET: 'cron',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
}

test('la integracion arranca deshabilitada aunque falte solo el interruptor', async () => {
  const { readGmailCredentials, readGmailStatus } = await import('./config.ts')

  assert.equal(readGmailStatus({}).ready, false)
  assert.equal(readGmailStatus({}).missing.length, 8)
  const withoutFlag = { ...FULL_ENV, BANDEJA_IA_GMAIL_ENABLED: undefined }
  assert.equal(readGmailStatus(withoutFlag).ready, false)
  assert.equal(readGmailCredentials(withoutFlag), null)
  assert.equal(readGmailStatus(FULL_ENV).ready, true)
  assert.equal(readGmailCredentials(FULL_ENV)?.mailbox, 'casilla@organismo.example')
})

test('el estado informa que variables faltan sin exponer valores', async () => {
  const { readGmailStatus } = await import('./config.ts')

  const status = readGmailStatus({ ...FULL_ENV, BANDEJA_IA_GMAIL_REFRESH_TOKEN: ' ' })
  assert.deepEqual(status.missing, ['BANDEJA_IA_GMAIL_REFRESH_TOKEN'])
  assert.equal(JSON.stringify(status).includes('secreto'), false)
})

test('una variable de Gmail con prefijo NEXT_PUBLIC_ bloquea la integracion', async () => {
  const { readGmailStatus } = await import('./config.ts')

  const status = readGmailStatus({ ...FULL_ENV, NEXT_PUBLIC_BANDEJA_IA_GMAIL_CLIENT_SECRET: 'x' })
  assert.deepEqual(status.exposedPublicVars, ['NEXT_PUBLIC_BANDEJA_IA_GMAIL_CLIENT_SECRET'])
  assert.equal(status.ready, false)
})

test('planifica sincronizacion inicial, incremental o espera', async () => {
  const { planSync } = await import('./sync-plan.ts')
  const now = new Date('2026-10-14T13:00:00Z')
  const base = { lastHistoryId: '900', watchExpiration: null, needsFullSync: false, consecutiveFailures: 0, nextRetryAt: null }

  assert.equal(planSync(null, now).kind, 'inicial')
  assert.deepEqual(planSync(base, now), { kind: 'incremental', startHistoryId: '900' })
  assert.equal(planSync({ ...base, needsFullSync: true }, now).kind, 'inicial')
  assert.equal(planSync({ ...base, nextRetryAt: '2026-10-14T13:05:00Z' }, now).kind, 'esperar')
})

test('renueva el watch con un dia de margen', async () => {
  const { needsWatchRenewal } = await import('./sync-plan.ts')
  const now = new Date('2026-10-14T13:00:00Z')

  assert.equal(needsWatchRenewal(null, now), true)
  assert.equal(needsWatchRenewal('2026-10-15T10:00:00Z', now), true)
  assert.equal(needsWatchRenewal('2026-10-20T10:00:00Z', now), false)
})

test('recupera errores: 404 resincroniza, 5xx reintenta con espera creciente', async () => {
  const { backoffMs, classifyGmailError, stateAfterFailure, stateAfterSuccess } = await import('./sync-plan.ts')
  const now = new Date('2026-10-14T13:00:00Z')
  const base = { lastHistoryId: '900', watchExpiration: null, needsFullSync: false, consecutiveFailures: 0, nextRetryAt: null }

  assert.equal(classifyGmailError(404).action, 'resincronizar')
  assert.equal(classifyGmailError(401).action, 'reconectar')
  assert.equal(classifyGmailError(503).action, 'reintentar')
  assert.equal(classifyGmailError(429).action, 'reintentar')
  // 403 por cuota se reintenta; 403 por permisos no se arregla solo y se muestra el motivo.
  assert.equal(classifyGmailError(403, 'userRateLimitExceeded').action, 'reintentar')
  const scope = classifyGmailError(403, 'forbidden', "Metadata scope does not support 'q' parameter")
  assert.equal(scope.action, 'reconectar')
  assert.match(scope.message, /Metadata scope does not support 'q' parameter/)

  const expired = stateAfterFailure(base, classifyGmailError(404), now)
  assert.equal(expired.needsFullSync, true)
  assert.equal(expired.nextRetryAt, null)

  const failed = stateAfterFailure(base, classifyGmailError(503), now)
  assert.equal(failed.nextRetryAt, '2026-10-14T13:00:30.000Z')
  assert.ok(backoffMs(3) > backoffMs(2))
  assert.equal(backoffMs(50), 30 * 60_000)

  const recovered = stateAfterSuccess({ ...failed, needsFullSync: true }, '950')
  assert.deepEqual([recovered.lastHistoryId, recovered.needsFullSync, recovered.consecutiveFailures, recovered.nextRetryAt], ['950', false, 0, null])
})

test('compara historyId como enteros grandes e ignora notificaciones viejas', async () => {
  const { isStaleNotification, maxHistoryId } = await import('./sync-plan.ts')

  assert.equal(maxHistoryId('9007199254740993', '9007199254740992'), '9007199254740993')
  assert.equal(maxHistoryId('99', '100'), '100')
  assert.equal(isStaleNotification('100', '100'), true)
  assert.equal(isStaleNotification('101', '100'), false)
  assert.equal(isStaleNotification('5', null), false)
})

test('no duplica mensajes', async () => {
  const { newMessageIds } = await import('./sync-plan.ts')

  assert.deepEqual(newMessageIds(['a', 'b', 'a', 'c'], ['b']), ['a', 'c'])
})

test('valida el push de Pub/Sub y la casilla', async () => {
  const { parsePubSubPush } = await import('./sync-plan.ts')
  const data = Buffer.from(JSON.stringify({ emailAddress: 'Casilla@organismo.example', historyId: 1234 })).toString('base64')

  assert.deepEqual(parsePubSubPush({ message: { data, messageId: 'm1' } }, 'casilla@organismo.example'), {
    emailAddress: 'casilla@organismo.example',
    historyId: '1234',
    pubsubMessageId: 'm1',
  })
  assert.equal(parsePubSubPush({ message: { data, messageId: 'm1' } }, 'otra@organismo.example'), null)
  assert.equal(parsePubSubPush({ message: { data: 'no-es-json', messageId: 'm1' } }, 'casilla@organismo.example'), null)
  assert.equal(parsePubSubPush({ message: { data } }, 'casilla@organismo.example'), null)
  assert.equal(parsePubSubPush(null, 'casilla@organismo.example'), null)
})

test('extrae solo metadatos y el extracto es opcional', async () => {
  const { toMetadataRow, parseFromHeader } = await import('./sync-plan.ts')

  const message = {
    id: 'g1',
    threadId: 't1',
    historyId: '77',
    internalDate: '1760446800000',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Texto del extracto',
    payload: {
      headers: [
        { name: 'From', value: '"Mesa de Entradas" <Mesa@Organismo.example>' },
        { name: 'Subject', value: 'Nota' },
        { name: 'Content-Type', value: 'multipart/mixed; boundary=x' },
        { name: 'Message-ID', value: '<abc@organismo.example>' },
      ],
    },
  }

  const row = toMetadataRow(message, { storeSnippet: false })
  assert.equal(row.from_name, 'Mesa de Entradas')
  assert.equal(row.from_address, 'mesa@organismo.example')
  assert.equal(row.snippet, null)
  assert.equal(row.has_attachments, true)
  assert.equal(row.received_at, '2025-10-14T13:00:00.000Z')
  assert.equal(toMetadataRow(message, { storeSnippet: true }).snippet, 'Texto del extracto')
  assert.equal(toMetadataRow({ id: 'g2', threadId: 't2' }, { storeSnippet: true }).subject, '(sin asunto)')
  assert.deepEqual(parseFromHeader('alguien@organismo.example'), { name: 'alguien@organismo.example', address: 'alguien@organismo.example' })
})
