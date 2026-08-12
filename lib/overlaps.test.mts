import assert from 'node:assert/strict'
import test from 'node:test'

test('formatea el score como porcentaje acotado', async () => {
  const { formatOverlapScore } = await import('./overlaps.ts')

  assert.equal(formatOverlapScore(0.85), '85%')
  assert.equal(formatOverlapScore(1), '100%')
  assert.equal(formatOverlapScore(1.4), '100%')
  assert.equal(formatOverlapScore(-0.2), '0%')
  assert.equal(formatOverlapScore(Number.NaN), '0%')
})

test('ordena pendientes primero, luego por score y fecha', async () => {
  const { sortOverlaps } = await import('./overlaps.ts')

  const rows = [
    { id: 'a', status: 'Descartado', score: 0.9, created_at: '2026-08-01' },
    { id: 'b', status: 'Pendiente', score: 0.4, created_at: '2026-08-02' },
    { id: 'c', status: 'Pendiente', score: 0.8, created_at: '2026-08-01' },
    { id: 'd', status: 'Confirmado', score: 0.7, created_at: '2026-08-03' },
    { id: 'e', status: 'Pendiente', score: 0.4, created_at: '2026-08-05' },
  ]

  assert.deepEqual(
    sortOverlaps(rows).map((row) => row.id),
    ['c', 'e', 'b', 'd', 'a']
  )
})

test('no muta el arreglo original', async () => {
  const { sortOverlaps } = await import('./overlaps.ts')

  const rows = [
    { id: 'a', status: 'Descartado', score: 0.9, created_at: '2026-08-01' },
    { id: 'b', status: 'Pendiente', score: 0.4, created_at: '2026-08-02' },
  ]
  const copy = [...rows]
  sortOverlaps(rows)
  assert.deepEqual(rows, copy)
})
