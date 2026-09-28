import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

const row = (day: string, conversations: number, resolved: number, extra: Record<string, number> = {}) => ({
  migue_slug: 'x',
  day,
  conversations,
  messages: conversations * 3,
  resolved,
  handed_off: 0,
  unanswered: conversations - resolved,
  positive_feedback: 0,
  negative_feedback: 0,
  timed_conversations: conversations,
  response_ms_total: conversations * 1000,
  cost_usd: 0.5,
  ...extra,
})

test('cada Migue del catalogo tiene sus 4 vistas en public', async () => {
  const { MIGUES } = await import('./migue.ts')
  const slugs = new Set<string>()
  for (const migue of MIGUES) {
    assert.ok(!slugs.has(migue.slug), `slug repetido: ${migue.slug}`)
    slugs.add(migue.slug)
    assert.equal(migue.frames.length, 4)
    for (const frame of migue.frames) assert.ok(existsSync(new URL(`../public${frame}`, import.meta.url)), `falta ${frame}`)
    if (migue.model) assert.ok(existsSync(new URL(`../public${migue.model}`, import.meta.url)), `falta ${migue.model}`)
  }
})

test('filtra el periodo contando el ultimo dia', async () => {
  const { statsInPeriod } = await import('./migue.ts')
  const stats = [row('2026-09-01', 1, 1), row('2026-09-02', 1, 1), row('2026-09-03', 1, 1), row('2026-09-04', 1, 1)]
  assert.deepEqual(statsInPeriod(stats, '2026-09-04', 2).map((r) => r.day), ['2026-09-03', '2026-09-04'])
})

test('suma el periodo y pondera el tiempo de respuesta por conversaciones', async () => {
  const { summarize } = await import('./migue.ts')
  const summary = summarize(
    [
      row('2026-09-01', 30, 24, { response_ms_total: 30_000, positive_feedback: 9, negative_feedback: 1 }),
      row('2026-09-02', 10, 6, { response_ms_total: 30_000 }),
      row('2026-09-03', 0, 0),
    ],
    3,
  )
  assert.equal(summary.conversations, 40)
  assert.equal(summary.effectiveness, 0.75)
  assert.equal(summary.satisfaction, 0.9)
  assert.equal(summary.avg_response_ms, 1500)
  assert.equal(summary.active_days, 2)
  assert.ok(Math.abs(summary.cost_usd - 1.5) < 1e-9)
})

test('sin conversaciones ni valoraciones no inventa porcentajes', async () => {
  const { summarize } = await import('./migue.ts')
  const summary = summarize([row('2026-09-01', 0, 0)], 1)
  assert.equal(summary.effectiveness, null)
  assert.equal(summary.satisfaction, null)
  assert.equal(summary.avg_response_ms, null)
})

test('el tiempo de respuesta se promedia solo con las conversaciones que lo informan', async () => {
  const { achievementsFor, summarize } = await import('./migue.ts')
  // 100 conversaciones sin tiempo y 10 a 4 segundos: el promedio es 4 s, no 364 ms.
  const summary = summarize([row('2026-09-01', 100, 90, { timed_conversations: 0, response_ms_total: 0 }), row('2026-09-02', 10, 9, { timed_conversations: 10, response_ms_total: 40_000 })], 2)
  assert.equal(summary.avg_response_ms, 4000)
  assert.equal(achievementsFor(summary).find((a) => a.id === 'rayo')?.earned, false)
  const untimed = summarize([row('2026-09-01', 5, 5, { timed_conversations: 0, response_ms_total: 0 })], 1)
  assert.equal(untimed.avg_response_ms, null)
  assert.equal(achievementsFor(untimed).find((a) => a.id === 'rayo')?.earned, false)
})

test('la variacion necesita un periodo anterior con datos', async () => {
  const { periodDelta } = await import('./migue.ts')
  assert.equal(periodDelta(150, 100), 0.5)
  assert.equal(periodDelta(10, 0), null)
})

test('ordena por uso y desempata por efectividad', async () => {
  const { rankByUsage, summarize } = await import('./migue.ts')
  const items = [
    { slug: 'a', summary: summarize([row('2026-09-01', 10, 5)], 1) },
    { slug: 'b', summary: summarize([row('2026-09-01', 20, 5)], 1) },
    { slug: 'c', summary: summarize([row('2026-09-01', 10, 9)], 1) },
  ]
  assert.deepEqual(rankByUsage(items).map((item) => item.slug), ['b', 'c', 'a'])
})

test('el estado depende de la ultima actividad', async () => {
  const { healthOf } = await import('./migue.ts')
  assert.equal(healthOf('2026-09-28', '2026-09-28'), 'activo')
  assert.equal(healthOf('2026-09-27', '2026-09-28'), 'activo')
  assert.equal(healthOf('2026-09-26', '2026-09-28'), 'demorado')
  assert.equal(healthOf('2026-09-20', '2026-09-28'), 'inactivo')
  assert.equal(healthOf(null, '2026-09-28'), 'inactivo')
})

test('los logros salen de las metricas del periodo', async () => {
  const { achievementsFor, summarize } = await import('./migue.ts')
  const earned = (summary: ReturnType<typeof summarize>) => achievementsFor(summary).filter((a) => a.earned).map((a) => a.id)
  const strong = summarize([row('2026-09-01', 1200, 1100, { response_ms_total: 1200 * 1500, positive_feedback: 95, negative_feedback: 5 })], 1)
  assert.deepEqual(earned(strong), ['mil-charlas', 'certero', 'querido', 'rayo', 'constante'])
  const idle = summarize([row('2026-09-01', 0, 0)], 1)
  assert.deepEqual(earned(idle), [])
})

test('sin datos, el estado depende de si el Migue ya tiene clave', async () => {
  const { connectionOf } = await import('./migue.ts')
  assert.equal(connectionOf('2026-09-28', false, '2026-09-28'), 'activo')
  assert.equal(connectionOf(null, true, '2026-09-28'), 'esperando')
  assert.equal(connectionOf(null, false, '2026-09-28'), 'sin_conectar')
  // Reporto por ultima vez antes del periodo cargado: inactivo, no "esperando".
  assert.equal(connectionOf(null, true, '2026-09-28', '2026-01-10', '2026-04-02'), 'inactivo')
  // Uso la clave dentro del periodo pero no se guardo nada (todo rechazado): sigue esperando.
  assert.equal(connectionOf(null, true, '2026-09-28', '2026-09-27', '2026-04-02'), 'esperando')
})

test('la serie diaria completa rellena con cero los dias sin conversaciones', async () => {
  const { denseDailyStats } = await import('./migue.ts')
  const series = denseDailyStats([row('2026-09-27', 5, 4), { ...row('2026-09-27', 9, 9), migue_slug: 'otro' }], 'x', '2026-09-28', 3)
  assert.deepEqual(series.map((r) => [r.day, r.conversations]), [['2026-09-26', 0], ['2026-09-27', 5], ['2026-09-28', 0]])
})

test('Migue DIA reporta desde este repo y el resto necesita clave', async () => {
  const { MIGUES } = await import('./migue.ts')
  assert.deepEqual(MIGUES.filter((migue) => migue.internal).map((migue) => migue.slug), ['dashboard-dia'])
})
