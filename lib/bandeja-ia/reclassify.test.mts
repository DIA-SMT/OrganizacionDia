import assert from 'node:assert/strict'
import test from 'node:test'

const NOW = new Date('2026-10-19T13:00:00Z')

function message(subject: string, fromAddress: string, snippet: string | null = null) {
  return { subject, snippet, from_name: '', from_address: fromAddress, received_at: '2026-10-19T12:00:00Z' }
}

test('el aviso de pausa de Supabase pasa a "Base por pausarse" con prioridad critica', async () => {
  const { reclassifyPatch } = await import('./reclassify.ts')
  const { DEFAULT_RULES } = await import('./rules.ts')

  const patch = reclassifyPatch(
    { category: 'informativo', priority: 'informativa', priority_confirmed_at: null, due_at: null },
    message('Your Supabase project "dashboard" will be paused in 7 days', 'noreply@supabase.com'),
    DEFAULT_RULES,
    NOW,
  )
  assert.equal(patch?.category, 'base_pausa')
  assert.equal(patch?.priority, 'critica')
})

test('la regla de Supabase exige que el remitente sea de Supabase', async () => {
  const { classifyMessage } = await import('./rules.ts')

  const otro = classifyMessage({ subject: 'La reunión queda en pausa hasta nuevo aviso', snippet: '', fromName: 'Mesa', fromAddress: 'mesa@municipio.example' }, NOW)
  assert.notEqual(otro.category, 'base_pausa')

  const supa = classifyMessage({ subject: 'Your project has been paused due to inactivity', snippet: '', fromName: 'Supabase', fromAddress: 'notify@supabase.io' }, NOW)
  assert.equal(supa.category, 'base_pausa')
  assert.equal(supa.priority, 'critica')
})

test('las invitaciones quedan como "Posible evento" con prioridad alta', async () => {
  const { classifyMessage, CATEGORY_LABELS } = await import('./rules.ts')

  const result = classifyMessage({ subject: 'Invitación: Jornada de innovación pública', snippet: '', fromName: '', fromAddress: 'eventos@universidad.example' }, NOW)
  assert.equal(result.category, 'invitacion')
  assert.equal(result.priority, 'alta')
  assert.equal(CATEGORY_LABELS.invitacion, 'Posible evento')
})

test('si una persona confirmo la prioridad, solo cambia la categoria', async () => {
  const { reclassifyPatch } = await import('./reclassify.ts')
  const { DEFAULT_RULES } = await import('./rules.ts')

  const patch = reclassifyPatch(
    { category: 'informativo', priority: 'normal', priority_confirmed_at: '2026-10-18T10:00:00Z', due_at: null },
    message('Your Supabase project will be paused', 'noreply@supabase.com'),
    DEFAULT_RULES,
    NOW,
  )
  assert.deepEqual(patch, { category: 'base_pausa' })
})

test('sin cambios devuelve null y no pisa un vencimiento existente', async () => {
  const { reclassifyPatch } = await import('./reclassify.ts')
  const { DEFAULT_RULES } = await import('./rules.ts')

  assert.equal(
    reclassifyPatch({ category: 'informativo', priority: 'informativa', priority_confirmed_at: null, due_at: null }, message('Newsletter semanal', 'no-reply@boletin.example'), DEFAULT_RULES, NOW),
    null,
  )
  const withDue = reclassifyPatch(
    { category: 'fecha_limite', priority: 'alta', priority_confirmed_at: null, due_at: '2026-10-25T12:00:00Z' },
    message('Plazo de entrega: 22/10', 'mesa@municipio.example'),
    DEFAULT_RULES,
    NOW,
  )
  assert.equal(withDue?.due_at, undefined)
})
