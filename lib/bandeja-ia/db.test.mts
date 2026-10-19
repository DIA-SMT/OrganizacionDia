import assert from 'node:assert/strict'
import test from 'node:test'

const members = [
  { id: 'm-ana', full_name: 'Ana Gómez', email: 'ana@smt.gob.ar' },
  { id: 'm-bruno', full_name: 'Bruno Díaz', email: 'bruno@smt.gob.ar' },
  { id: 'm-carla', full_name: null, email: 'carla@smt.gob.ar' },
]

const permissions = [
  { id: 'p-ana', member_id: 'm-ana', role: 'admin', active: true, revoked_at: null },
  { id: 'p-bruno', member_id: 'm-bruno', role: 'operador', active: true, revoked_at: '2026-10-01T00:00:00Z' },
]

test('arma integrantes con su permiso vigente (revocado = sin acceso)', async () => {
  const { buildPeople } = await import('./db.ts')

  const people = buildPeople(members, permissions)
  assert.deepEqual(
    people.map((person) => [person.name, person.role, person.permissionId]),
    [
      ['Ana Gómez', 'admin', 'p-ana'],
      ['Bruno Díaz', null, 'p-bruno'],
      ['carla@smt.gob.ar', null, null],
    ],
  )
})

test('mapea un asunto con su mensaje mas reciente y fechas validas', async () => {
  const { mapAsunto } = await import('./db.ts')

  const message = (id: string, receivedAt: string) => ({
    id,
    gmail_message_id: `g-${id}`,
    gmail_thread_id: 't1',
    received_at: receivedAt,
    from_name: '',
    from_address: 'mesa@organismo.example',
    subject: 'Nota',
    snippet: null,
    label_ids: null,
    has_attachments: true,
  })

  const asunto = mapAsunto({
    id: 'a1',
    title: 'Nota de prueba',
    summary: null,
    category: 'reunion',
    priority: 'desconocida',
    suggested_priority: 'alta',
    priority_reasons: null,
    priority_confirmed_by: null,
    priority_confirmed_at: null,
    status: 'en_revision',
    requires_response: true,
    detected_dates: [{ date: '2026-10-20', time: '10:30', kind: 'reunion', source: '20/10' }, { date: 'mal' }, null],
    due_at: '2026-10-20T13:30:00Z',
    resolved_at: null,
    created_at: '2026-10-14T12:00:00Z',
    bandeja_ia_asunto_messages: [{ bandeja_ia_messages: message('viejo', '2026-10-13T10:00:00Z') }, { bandeja_ia_messages: message('nuevo', '2026-10-14T10:00:00Z') }, { bandeja_ia_messages: null }],
  })

  assert.equal(asunto.message?.id, 'nuevo')
  assert.equal(asunto.message?.fromName, 'mesa@organismo.example')
  assert.equal(asunto.messageCount, 2)
  assert.equal(asunto.classification.priority, 'normal')
  assert.equal(asunto.suggestedPriority, 'alta')
  assert.deepEqual(asunto.classification.reasons, [])
  assert.deepEqual(asunto.classification.detectedDates, [{ date: '2026-10-20', time: '10:30', kind: 'reunion', source: '20/10' }])
})

test('las reglas guardadas pisan a las del codigo y se agregan las nuevas', async () => {
  const { mergeRules, ruleToRow } = await import('./db.ts')
  const { DEFAULT_RULES } = await import('./rules.ts')

  const urgente = { ...ruleToRow(DEFAULT_RULES[0], 0), id: 'x1', active: false }
  const nueva = { ...ruleToRow({ ...DEFAULT_RULES[1], id: 'propia', name: 'Regla propia' }, 20), id: 'x2' }
  const merged = mergeRules([nueva, urgente])

  assert.equal(merged.length, DEFAULT_RULES.length + 1)
  assert.equal(merged[0].id, 'urgente')
  assert.equal(merged[0].active, false)
  assert.equal(merged.at(-1)?.name, 'Regla propia')
  assert.deepEqual(mergeRules([]), DEFAULT_RULES)
})

test('traduce la auditoria a eventos legibles', async () => {
  const { auditToEvents, buildPeople } = await import('./db.ts')

  const people = buildPeople(members, permissions)
  const context = {
    people,
    permissionMembers: new Map([['p-bruno', 'm-bruno']]),
    ruleNames: new Map([['r1', 'Urgencia explícita']]),
  }
  const row = (id: number, entity_type: string, action: string, details: Record<string, unknown>, actor: string | null = 'm-ana', entity_id = 'a1') => ({
    id,
    actor_member_id: actor,
    action,
    entity_type,
    entity_id,
    details,
    created_at: `2026-10-15T10:${String(id).padStart(2, '0')}:00Z`,
  })

  const events = auditToEvents(
    [
      row(1, 'bandeja_ia_asuntos', 'insert', { title: 'x' }, null),
      row(2, 'bandeja_ia_asuntos', 'update', { status: { antes: 'nuevo', despues: 'en_revision' } }),
      row(3, 'bandeja_ia_asuntos', 'update', { summary: { antes: null, despues: 'x' } }),
      row(4, 'bandeja_ia_asuntos', 'update', { priority: { antes: 'alta', despues: 'critica' }, priority_confirmed_at: { antes: null, despues: 'x' } }),
      row(5, 'bandeja_ia_asuntos', 'update', { status: { antes: 'asignado', despues: 'resuelto' }, resolved_at: { antes: null, despues: 'x' } }),
      row(6, 'bandeja_ia_asuntos', 'update', { status: { antes: 'resuelto', despues: 'en_revision' } }),
      row(7, 'bandeja_ia_notes', 'insert', { asunto_id: 'a1', author_member_id: 'm-ana' }, 'm-ana', 'n1'),
      row(10, 'bandeja_ia_permissions', 'update', { active: { antes: true, despues: false }, revoked_at: { antes: null, despues: 'x' } }, 'm-ana', 'p-bruno'),
      row(11, 'bandeja_ia_rules', 'update', { active: { antes: true, despues: false } }, 'm-ana', 'r1'),
      row(12, 'bandeja_ia_settings', 'update', { store_snippets: { antes: false, despues: true } }, 'm-ana', 'true'),
      row(13, 'bandeja_ia_assignments', 'insert', { asunto_id: 'a1' }),
    ].reverse(),
    context,
  )

  assert.deepEqual(
    events.reverse().map((event) => [event.type, event.description, event.actorName, event.asuntoId]),
    [
      ['creado', 'Asunto creado', 'Sistema', 'a1'],
      ['estado', 'Estado: Nuevo → En revisión', 'Ana Gómez', 'a1'],
      ['prioridad_confirmada', 'Prioridad corregida: Alta → Crítica', 'Ana Gómez', 'a1'],
      ['resuelto', 'Marcado como resuelto', 'Ana Gómez', 'a1'],
      ['reabierto', 'Asunto reabierto', 'Ana Gómez', 'a1'],
      ['nota', 'Agregó una nota', 'Ana Gómez', 'a1'],
      ['permiso', 'Permiso revocado a Bruno Díaz', 'Ana Gómez', null],
      ['configuracion', 'Regla "Urgencia explícita" desactivada', 'Ana Gómez', null],
      ['configuracion', 'Configuración actualizada (store_snippets)', 'Ana Gómez', null],
    ],
  )
})
