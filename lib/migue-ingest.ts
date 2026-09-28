// Formato con el que cada Migue reporta sus conversaciones (ver docs/migue-conexion.md).
// Sin imports con alias: lo usan el endpoint, el registro interno y los tests de node.

export const MIGUE_OUTCOMES = ['resuelta', 'derivada', 'sin_respuesta'] as const
export const MIGUE_FEEDBACK = ['positiva', 'negativa'] as const
export const MAX_CONVERSATIONS_PER_REQUEST = 500

export type MigueOutcome = (typeof MIGUE_OUTCOMES)[number]
export type MigueFeedback = (typeof MIGUE_FEEDBACK)[number]

// Fila tal cual se guarda en public.migue_conversations.
export type MigueConversationRow = {
  migue_slug: string
  external_id: string
  channel: string | null
  started_at: string
  ended_at: string | null
  messages: number
  outcome: MigueOutcome
  feedback: MigueFeedback | null
  avg_response_ms: number | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  topic: string | null
  unanswered_question: string | null
}

export type ParseResult = { ok: true; row: MigueConversationRow } | { ok: false; error: string }

const DAY_MS = 86_400_000

// Topes por campo: un valor fuera de rango se rechaza en esa fila (y no hace fallar el lote
// entero en la base). Holgados para cualquier uso real, dentro de los tipos de las columnas.
export const MIGUE_LIMITS = {
  messages: 100_000,
  avg_response_ms: 600_000,
  tokens_in: 100_000_000,
  tokens_out: 100_000_000,
  cost_usd: 1_000,
} as const

// ISO 8601 con zona horaria explicita (Z o +-hh:mm): sin zona, la hora seria ambigua.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed ? trimmed.slice(0, max) : null
}

function count(value: unknown, max: number): number | null | 'invalid' {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) return 'invalid'
  return Math.round(value)
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value.trim())) return null
  const time = Date.parse(value.trim())
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

// Valida una conversacion reportada por un bot. El slug sale de la clave, nunca del cuerpo:
// un bot no puede escribir datos de otro Migue.
export function parseMigueConversation(input: unknown, migueSlug: string, now: number): ParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'La conversacion debe ser un objeto.' }
  const data = input as Record<string, unknown>

  // El id no se recorta ni se normaliza: dos conversaciones distintas no pueden terminar iguales.
  const externalId = typeof data.conversation_id === 'string' ? data.conversation_id.trim() : ''
  if (!externalId) return { ok: false, error: 'Falta conversation_id.' }
  if (externalId.length > 200) return { ok: false, error: 'conversation_id supera los 200 caracteres.' }

  const startedAt = timestamp(data.started_at)
  if (!startedAt) return { ok: false, error: 'started_at debe ser una fecha ISO 8601 con zona horaria (por ejemplo 2026-09-28T14:03:00-03:00).' }
  const started = Date.parse(startedAt)
  if (started > now + DAY_MS) return { ok: false, error: 'started_at esta en el futuro.' }
  if (started < now - 400 * DAY_MS) return { ok: false, error: 'started_at tiene mas de 400 dias.' }

  const endedAt = data.ended_at === undefined || data.ended_at === null ? null : timestamp(data.ended_at)
  if (data.ended_at !== undefined && data.ended_at !== null && !endedAt) return { ok: false, error: 'ended_at debe ser una fecha ISO 8601 con zona horaria.' }
  if (endedAt && Date.parse(endedAt) < started) return { ok: false, error: 'ended_at es anterior a started_at.' }

  if (!MIGUE_OUTCOMES.includes(data.outcome as MigueOutcome)) {
    return { ok: false, error: `outcome debe ser uno de: ${MIGUE_OUTCOMES.join(', ')}.` }
  }
  const outcome = data.outcome as MigueOutcome

  let feedback: MigueFeedback | null = null
  if (data.feedback !== undefined && data.feedback !== null) {
    if (!MIGUE_FEEDBACK.includes(data.feedback as MigueFeedback)) return { ok: false, error: `feedback debe ser ${MIGUE_FEEDBACK.join(' o ')}.` }
    feedback = data.feedback as MigueFeedback
  }

  const numbers = {
    messages: count(data.messages, MIGUE_LIMITS.messages),
    avg_response_ms: count(data.avg_response_ms, MIGUE_LIMITS.avg_response_ms),
    tokens_in: count(data.tokens_in, MIGUE_LIMITS.tokens_in),
    tokens_out: count(data.tokens_out, MIGUE_LIMITS.tokens_out),
  }
  for (const [key, value] of Object.entries(numbers)) {
    if (value === 'invalid') {
      return { ok: false, error: `${key} debe ser un numero entre 0 y ${MIGUE_LIMITS[key as keyof typeof numbers]}.` }
    }
  }

  let costUsd: number | null = null
  if (data.cost_usd !== undefined && data.cost_usd !== null) {
    if (typeof data.cost_usd !== 'number' || !Number.isFinite(data.cost_usd) || data.cost_usd < 0 || data.cost_usd >= MIGUE_LIMITS.cost_usd) {
      return { ok: false, error: `cost_usd debe ser un numero mayor o igual a 0 y menor a ${MIGUE_LIMITS.cost_usd}.` }
    }
    costUsd = Math.round(data.cost_usd * 1_000_000) / 1_000_000
  }

  return {
    ok: true,
    row: {
      migue_slug: migueSlug,
      external_id: externalId,
      channel: text(data.channel, 30),
      started_at: startedAt,
      ended_at: endedAt,
      messages: (numbers.messages as number | null) ?? 0,
      outcome,
      feedback,
      avg_response_ms: numbers.avg_response_ms as number | null,
      tokens_in: numbers.tokens_in as number | null,
      tokens_out: numbers.tokens_out as number | null,
      cost_usd: costUsd,
      topic: text(data.topic, 80),
      // La pregunta solo se guarda cuando el bot no supo responder.
      unanswered_question: outcome === 'sin_respuesta' ? text(data.unanswered_question, 300) : null,
    },
  }
}

// Acepta { conversations: [...] }, una lista o una sola conversacion.
export function conversationsFromBody(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    const list = (body as { conversations?: unknown }).conversations
    if (Array.isArray(list)) return list
    if (list === undefined) return [body]
  }
  return null
}

// Si un lote repite la misma conversacion, queda la ultima (el upsert no admite repetidos).
export function dedupeConversations(rows: MigueConversationRow[]): MigueConversationRow[] {
  const byId = new Map<string, MigueConversationRow>()
  for (const row of rows) byId.set(row.external_id, row)
  return [...byId.values()]
}

export async function hashIngestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}
