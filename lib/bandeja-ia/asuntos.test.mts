import assert from 'node:assert/strict'
import test from 'node:test'

const NOW = new Date('2026-10-14T13:00:00Z')

type Priority = 'critica' | 'alta' | 'normal' | 'informativa'
type Status = 'nuevo' | 'en_revision' | 'esperando_respuesta' | 'resuelto' | 'descartado'

function asunto(id: string, options: { priority?: Priority; status?: Status; dueAt?: string | null; title?: string; from?: string; summary?: string; createdAt?: string } = {}) {
  return {
    id,
    title: options.title ?? `Asunto ${id}`,
    summary: options.summary ?? null,
    message: options.from
      ? { id: `m-${id}`, threadId: `t-${id}`, fromName: options.from, fromAddress: 'mesa@organismo.example', subject: '', snippet: null, receivedAt: options.createdAt ?? '2026-10-13T12:00:00Z', hasAttachments: false, labels: [] }
      : null,
    messageCount: options.from ? 1 : 0,
    classification: { priority: options.priority ?? 'normal', category: 'informativo' as const, reasons: [], detectedDates: [], requiresResponse: false },
    suggestedPriority: null,
    priorityConfirmedById: null,
    priorityConfirmedAt: null,
    status: options.status ?? 'nuevo',
    dueAt: options.dueAt ?? null,
    createdAt: options.createdAt ?? '2026-10-13T12:00:00Z',
    resolvedAt: options.status === 'resuelto' ? '2026-10-14T10:00:00Z' : null,
  }
}

const asuntos = [
  asunto('a', { priority: 'critica', dueAt: '2026-10-16T15:00:00Z', summary: 'Pedido de la Intendencia' }),
  asunto('b', { priority: 'critica', dueAt: '2026-10-24T15:00:00Z', from: 'Secretaría de Modernización' }),
  asunto('c', { priority: 'alta', status: 'resuelto' }),
  asunto('d', { priority: 'informativa' }),
  asunto('e', { priority: 'alta', dueAt: '2026-10-12T15:00:00Z', title: 'Pedido de informe' }),
]

test('cuenta importantes pendientes (criticos y altos sin cerrar)', async () => {
  const { countImportantPending } = await import('./asuntos.ts')

  assert.equal(countImportantPending(asuntos), 3)
})

test('vencimientos proximos incluye vencidos y excluye cerrados', async () => {
  const { upcomingDue } = await import('./asuntos.ts')

  assert.deepEqual(upcomingDue(asuntos, NOW).map((item) => item.id), ['e', 'a'])
  assert.deepEqual(upcomingDue(asuntos, NOW, 10).map((item) => item.id), ['e', 'a', 'b'])
})

test('ordena por prioridad y, a igual prioridad, por vencimiento', async () => {
  const { sortForAttention } = await import('./asuntos.ts')

  assert.deepEqual(sortForAttention(asuntos).map((item) => item.id), ['a', 'b', 'e', 'c', 'd'])
})

test('filtra por prioridad, estado y texto sin tildes', async () => {
  const { DEFAULT_FILTERS, filterAsuntos } = await import('./asuntos.ts')

  assert.deepEqual(filterAsuntos(asuntos, DEFAULT_FILTERS, '').map((item) => item.id), ['a', 'b', 'd', 'e'])
  assert.deepEqual(filterAsuntos(asuntos, { ...DEFAULT_FILTERS, status: 'resuelto' }, '').map((item) => item.id), ['c'])
  assert.deepEqual(filterAsuntos(asuntos, { ...DEFAULT_FILTERS, status: 'todos' }, 'modernizacion').map((item) => item.id), ['b'])
  assert.deepEqual(filterAsuntos(asuntos, { ...DEFAULT_FILTERS, status: 'todos' }, 'intendencia').map((item) => item.id), ['a'])
  assert.deepEqual(filterAsuntos(asuntos, { ...DEFAULT_FILTERS, priority: 'alta' }, 'informe').map((item) => item.id), ['e'])
})

test('nombra a quien escribio una nota o confirmo una prioridad', async () => {
  const { personName } = await import('./asuntos.ts')
  const people = [{ id: 'dia', name: 'Cuenta DIA', email: null, role: 'admin' as const, permissionId: 'p1' }]

  assert.equal(personName(people, 'dia'), 'Cuenta DIA')
  assert.equal(personName(people, null), 'Sistema')
  assert.equal(personName(people, 'otro'), 'Integrante')
})

test('la fecha de llegada es la del mensaje o, si no hay, la de alta', async () => {
  const { receivedAt } = await import('./asuntos.ts')

  assert.equal(receivedAt(asunto('x', { from: 'Alguien', createdAt: '2026-10-10T10:00:00Z' })), '2026-10-10T10:00:00Z')
  assert.equal(receivedAt(asunto('y', { createdAt: '2026-10-11T10:00:00Z' })), '2026-10-11T10:00:00Z')
})
