import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

const NOW = Date.parse('2026-09-28T15:00:00Z')
const base = { conversation_id: 'abc-1', started_at: '2026-09-28T14:00:00-03:00', messages: 6, outcome: 'resuelta' }

test('acepta una conversacion valida y toma el slug de la clave, no del cuerpo', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  const parsed = parseMigueConversation({ ...base, migue_slug: 'otro', cost_usd: 0.0012345678, tokens_in: 812.4, channel: '  WhatsApp ' }, 'turismo', NOW)
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  assert.equal(parsed.row.migue_slug, 'turismo')
  assert.equal(parsed.row.external_id, 'abc-1')
  assert.equal(parsed.row.started_at, '2026-09-28T17:00:00.000Z')
  assert.equal(parsed.row.cost_usd, 0.001235)
  assert.equal(parsed.row.tokens_in, 812)
  assert.equal(parsed.row.channel, 'WhatsApp')
  assert.equal(parsed.row.feedback, null)
})

test('rechaza datos que romperian las metricas', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  const errorOf = (input: Record<string, unknown>) => {
    const parsed = parseMigueConversation(input, 'turismo', NOW)
    return parsed.ok ? null : parsed.error
  }
  assert.match(errorOf({ ...base, conversation_id: ' ' }) ?? '', /conversation_id/)
  assert.match(errorOf({ ...base, started_at: 'ayer' }) ?? '', /started_at/)
  assert.match(errorOf({ ...base, started_at: '2026-10-05T00:00:00Z' }) ?? '', /futuro/)
  assert.match(errorOf({ ...base, outcome: 'ok' }) ?? '', /outcome/)
  assert.match(errorOf({ ...base, feedback: 'buena' }) ?? '', /feedback/)
  assert.match(errorOf({ ...base, messages: -1 }) ?? '', /messages/)
  assert.match(errorOf({ ...base, cost_usd: '0.1' }) ?? '', /cost_usd/)
  assert.match(errorOf({ ...base, ended_at: '2026-09-28T10:00:00-03:00' }) ?? '', /anterior/)
  assert.equal(errorOf(base), null)
})

test('una fecha sin zona horaria es ambigua y se rechaza', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  assert.equal(parseMigueConversation({ ...base, started_at: '2026-09-28T14:00:00' }, 'turismo', NOW).ok, false)
  assert.equal(parseMigueConversation({ ...base, started_at: 'Mon, 28 Sep 2026 14:00:00 GMT' }, 'turismo', NOW).ok, false)
  assert.equal(parseMigueConversation({ ...base, started_at: '2026-09-28T17:00:00Z' }, 'turismo', NOW).ok, true)
})

test('los valores fuera de rango se rechazan en su fila, antes de llegar a la base', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  const rejected = (input: Record<string, unknown>) => !parseMigueConversation({ ...base, ...input }, 'turismo', NOW).ok
  assert.ok(rejected({ messages: 3e9 }))
  assert.ok(rejected({ avg_response_ms: NOW }))
  assert.ok(rejected({ tokens_in: 1e12 }))
  assert.ok(rejected({ cost_usd: 2e6 }))
  assert.ok(!rejected({ messages: 40, avg_response_ms: 2500, tokens_in: 90_000, cost_usd: 12.5 }))
})

test('un conversation_id largo se rechaza en lugar de recortarse', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  assert.equal(parseMigueConversation({ ...base, conversation_id: 'x'.repeat(201) }, 'turismo', NOW).ok, false)
  const spaced = parseMigueConversation({ ...base, conversation_id: ' sesion  7 ' }, 'turismo', NOW)
  assert.ok(spaced.ok && spaced.row.external_id === 'sesion  7')
})

test('la pregunta solo se guarda cuando no hubo respuesta, y recortada', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  const answered = parseMigueConversation({ ...base, unanswered_question: 'algo' }, 'turismo', NOW)
  assert.ok(answered.ok && answered.row.unanswered_question === null)
  const unanswered = parseMigueConversation({ ...base, outcome: 'sin_respuesta', unanswered_question: 'x'.repeat(500) }, 'turismo', NOW)
  assert.ok(unanswered.ok && unanswered.row.unanswered_question?.length === 300)
})

test('lee el lote en cualquiera de los formatos y deja una fila por conversacion', async () => {
  const { conversationsFromBody, dedupeConversations, parseMigueConversation } = await import('./migue-ingest.ts')
  assert.equal(conversationsFromBody({ conversations: [1, 2] })?.length, 2)
  assert.equal(conversationsFromBody([1])?.length, 1)
  assert.equal(conversationsFromBody(base)?.length, 1)
  assert.equal(conversationsFromBody({ conversations: 'x' }), null)
  assert.equal(conversationsFromBody('texto'), null)

  const first = parseMigueConversation(base, 'turismo', NOW)
  const updated = parseMigueConversation({ ...base, messages: 9 }, 'turismo', NOW)
  assert.ok(first.ok && updated.ok)
  if (!first.ok || !updated.ok) return
  const rows = dedupeConversations([first.row, updated.row])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].messages, 9)
})

test('el hash de la clave coincide con el del script que la genera', async () => {
  const { bearerToken, hashIngestToken } = await import('./migue-ingest.ts')
  const token = 'migue_prueba'
  assert.equal(await hashIngestToken(token), createHash('sha256').update(token).digest('hex'))
  assert.equal(bearerToken('Bearer migue_prueba'), 'migue_prueba')
  assert.equal(bearerToken('Basic abc'), null)
  assert.equal(bearerToken(null), null)
})

test('el dashboard tapa datos personales de la pregunta sin respuesta al recibirla', async () => {
  const { parseMigueConversation } = await import('./migue-ingest.ts')
  const parsed = parseMigueConversation(
    { ...base, outcome: 'sin_respuesta', unanswered_question: 'Soy Juan Perez, DNI 30.123.456, vivo en Lavalle 1234 y mi mail es juan@correo.com' },
    'turismo',
    NOW,
  )
  assert.ok(parsed.ok)
  if (!parsed.ok) return
  assert.equal(parsed.row.unanswered_question, 'Soy [nombre], DNI [número], vivo en Lavalle [número] y mi mail es [correo]')
})

test('el filtro deja montos, fechas, anios y barrios', async () => {
  const { maskPersonalData } = await import('./migue-ingest.ts')
  for (const texto of ['hay $ 1.500.000 por distrito?', 'se vota el 30-09-2026?', 'la edicion 2024-2025', 'soy de Villa Urquiza, donde voto?']) {
    assert.equal(maskPersonalData(texto), texto, texto)
  }
})

test('en un lote repetido gana la conversacion mas reciente aunque venga antes', async () => {
  const { dedupeConversations, parseMigueConversation } = await import('./migue-ingest.ts')
  const row = (extra: Record<string, unknown>) => {
    const parsed = parseMigueConversation({ ...base, ...extra }, 'turismo', NOW)
    assert.ok(parsed.ok)
    return parsed.ok ? parsed.row : (null as never)
  }
  const nueva = row({ messages: 9, ended_at: '2026-09-28T14:20:00-03:00' })
  const vieja = row({ messages: 4, ended_at: '2026-09-28T14:05:00-03:00' })
  assert.equal(dedupeConversations([nueva, vieja])[0].messages, 9)
  assert.equal(dedupeConversations([vieja, nueva])[0].messages, 9)
  // A igualdad de mensajes y actividad queda la que viene despues.
  const igualA = row({ messages: 5, feedback: 'positiva' })
  const igualB = row({ messages: 5, feedback: 'negativa' })
  assert.equal(dedupeConversations([igualA, igualB])[0].feedback, 'negativa')
})
