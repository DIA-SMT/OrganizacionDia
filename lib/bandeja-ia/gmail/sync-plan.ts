// Logica pura de la sincronizacion con Gmail: que corrida hacer, cuando renovar el watch,
// como reaccionar a errores y como evitar duplicados. No hace llamadas de red; la usan las
// rutas del servidor cuando la integracion este habilitada (ver docs/bandeja-ia.md).

export type SyncKind = 'inicial' | 'incremental'

export type SyncState = {
  lastHistoryId: string | null
  watchExpiration: string | null
  needsFullSync: boolean
  consecutiveFailures: number
  nextRetryAt: string | null
}

export type SyncPlan = { kind: 'inicial'; reason: string } | { kind: 'incremental'; startHistoryId: string } | { kind: 'esperar'; until: string }

// Ventana de la sincronizacion inicial: no se trae la casilla completa (dias configurables).
export function initialSyncQuery(days: number): string {
  const safeDays = Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 30
  return `in:inbox newer_than:${safeDays}d`
}
// Gmail vence el watch a los 7 dias; se renueva con un dia de margen.
export const WATCH_RENEWAL_MARGIN_MS = 24 * 60 * 60 * 1000
const BASE_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 30 * 60_000

export function planSync(state: SyncState | null, now: Date): SyncPlan {
  if (state?.nextRetryAt && new Date(state.nextRetryAt) > now) return { kind: 'esperar', until: state.nextRetryAt }
  if (!state?.lastHistoryId) return { kind: 'inicial', reason: 'Sin historial previo' }
  if (state.needsFullSync) return { kind: 'inicial', reason: 'El historyId guardado expiro' }
  return { kind: 'incremental', startHistoryId: state.lastHistoryId }
}

export function needsWatchRenewal(watchExpiration: string | null, now: Date): boolean {
  if (!watchExpiration) return true
  return new Date(watchExpiration).getTime() - now.getTime() < WATCH_RENEWAL_MARGIN_MS
}

export function backoffMs(consecutiveFailures: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, consecutiveFailures - 1))
}

export type ErrorAction =
  | { action: 'resincronizar'; message: string }
  | { action: 'reintentar'; message: string }
  | { action: 'reconectar'; message: string }
  | { action: 'fallar'; message: string }

// Traduce la respuesta de Gmail a una accion de recuperacion.
const RATE_LIMIT_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded', 'backendError']

// detail: explicacion de Google (sin datos de correos), para mostrar en Configuracion.
export function classifyGmailError(status: number, reason: string | null = null, detail: string | null = null): ErrorAction {
  const suffix = detail ? ` (${detail})` : ''
  if (status === 404) return { action: 'resincronizar', message: 'historyId invalido o expirado: hace falta una sincronizacion inicial' }
  if (status === 401) return { action: 'reconectar', message: `Token revocado o vencido: hay que volver a autorizar la casilla${suffix}` }
  if (status === 403 && reason && RATE_LIMIT_REASONS.includes(reason)) return { action: 'reintentar', message: `Cuota de Gmail agotada: se reintenta mas tarde${suffix}` }
  // 403 por permisos: reintentar no lo arregla (scope equivocado, API deshabilitada, casilla sin acceso).
  if (status === 403) return { action: 'reconectar', message: `Gmail rechazo el pedido por permisos: revisar la autorizacion de la casilla${suffix}` }
  if (status === 429 || status >= 500) return { action: 'reintentar', message: `Gmail respondio ${status}: se reintenta con espera${suffix}` }
  return { action: 'fallar', message: `Respuesta inesperada de Gmail (${status})${suffix}` }
}

export function stateAfterFailure(state: SyncState, error: ErrorAction, now: Date): SyncState {
  const consecutiveFailures = state.consecutiveFailures + 1
  return {
    ...state,
    needsFullSync: state.needsFullSync || error.action === 'resincronizar',
    consecutiveFailures,
    nextRetryAt: error.action === 'resincronizar' ? null : new Date(now.getTime() + backoffMs(consecutiveFailures)).toISOString(),
  }
}

export function stateAfterSuccess(state: SyncState, historyId: string): SyncState {
  return { ...state, lastHistoryId: maxHistoryId(state.lastHistoryId, historyId), needsFullSync: false, consecutiveFailures: 0, nextRetryAt: null }
}

// Los historyId son enteros de 64 bits: se comparan como BigInt, nunca como Number.
export function maxHistoryId(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return BigInt(a) >= BigInt(b) ? a : b
}

// Pub/Sub entrega "al menos una vez": una notificacion con historyId ya procesado se ignora.
export function isStaleNotification(notificationHistoryId: string, lastHistoryId: string | null): boolean {
  return Boolean(lastHistoryId) && BigInt(notificationHistoryId) <= BigInt(lastHistoryId!)
}

// IDs nuevos, sin repetidos y sin los que ya estan guardados (la base ademas tiene unique).
export function newMessageIds(ids: string[], known: Iterable<string>): string[] {
  const seen = new Set(known)
  const result: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export type GmailPushNotification = { emailAddress: string; historyId: string; pubsubMessageId: string }

// Cuerpo de un push de Pub/Sub: { message: { data: base64(JSON), messageId }, subscription }.
// Devuelve null si no tiene la forma esperada o si es de otra casilla.
export function parsePubSubPush(body: unknown, expectedMailbox: string): GmailPushNotification | null {
  if (!body || typeof body !== 'object') return null
  const message = (body as { message?: { data?: unknown; messageId?: unknown; message_id?: unknown } }).message
  if (!message || typeof message.data !== 'string') return null
  const pubsubMessageId = typeof message.messageId === 'string' ? message.messageId : typeof message.message_id === 'string' ? message.message_id : null
  if (!pubsubMessageId) return null

  try {
    const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) as { emailAddress?: unknown; historyId?: unknown }
    const emailAddress = typeof decoded.emailAddress === 'string' ? decoded.emailAddress.trim().toLowerCase() : null
    const historyId = typeof decoded.historyId === 'number' || typeof decoded.historyId === 'string' ? String(decoded.historyId) : null
    if (!emailAddress || !historyId || !/^\d+$/.test(historyId)) return null
    if (emailAddress !== expectedMailbox.trim().toLowerCase()) return null
    return { emailAddress, historyId, pubsubMessageId }
  } catch {
    return null
  }
}

type GmailHeader = { name: string; value: string }
type GmailPart = { filename?: string; parts?: GmailPart[] }

export type GmailMetadataMessage = {
  id: string
  threadId: string
  historyId?: string
  internalDate?: string
  labelIds?: string[]
  snippet?: string
  sizeEstimate?: number
  payload?: { headers?: GmailHeader[]; parts?: GmailPart[] }
}

export type MessageMetadataRow = {
  gmail_message_id: string
  gmail_thread_id: string
  history_id: string | null
  received_at: string | null
  from_name: string
  from_address: string
  subject: string
  snippet: string | null
  label_ids: string[]
  has_attachments: boolean
  rfc822_message_id: string | null
}

export function parseFromHeader(value: string): { name: string; address: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1].trim() || match[2].trim(), address: match[2].trim().toLowerCase() }
  const address = value.trim().toLowerCase()
  return { name: address, address }
}

function hasAttachment(parts: GmailPart[] | undefined): boolean {
  return (parts ?? []).some((part) => Boolean(part.filename) || hasAttachment(part.parts))
}

// Convierte un mensaje pedido con format=metadata a la fila que se guarda. Solo metadatos:
// el cuerpo y los adjuntos no se descargan ni se guardan. El extracto es opcional.
export function toMetadataRow(message: GmailMetadataMessage, options: { storeSnippet: boolean }): MessageMetadataRow {
  const header = (name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  const from = parseFromHeader(header('From'))
  const internalDate = message.internalDate ? Number(message.internalDate) : NaN

  return {
    gmail_message_id: message.id,
    gmail_thread_id: message.threadId,
    history_id: message.historyId ?? null,
    received_at: Number.isFinite(internalDate) ? new Date(internalDate).toISOString() : null,
    from_name: from.name,
    from_address: from.address,
    subject: header('Subject') || '(sin asunto)',
    snippet: options.storeSnippet ? (message.snippet ?? '').slice(0, 300) : null,
    label_ids: message.labelIds ?? [],
    // format=metadata no trae las partes: multipart/mixed es la senal de que hay adjuntos.
    has_attachments: hasAttachment(message.payload?.parts) || /multipart\/mixed/i.test(header('Content-Type')),
    rfc822_message_id: header('Message-ID') || null,
  }
}
