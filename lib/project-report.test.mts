import assert from 'node:assert/strict'
import test from 'node:test'

const NOW = new Date(2026, 9, 6, 12, 0, 0)

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  description: null,
  requester_area: null,
  website_url: null,
  production_url: null,
  note: null,
  status: 'En desarrollo',
  priority: 'Media',
  progress: 0,
  estimated_delivery: null,
  ...extra,
})

const emptyInput = { projects: [], members: [], projectMembers: [], tasks: [], blockers: [], commits: [] }

test('solo entran desarrollo, QA y produccion, agrupados en ese orden', async () => {
  const { buildProjectReport } = await import('./project-report.ts')

  const report = buildProjectReport(
    {
      ...emptyInput,
      projects: [
        row('a', { status: 'En desarrollo' }),
        row('b', { status: 'Pausado' }),
        row('c', { status: 'En Producción' }),
        row('d', { status: 'MVP aprobado' }),
        row('e', { status: 'QA' }),
      ],
    },
    NOW,
  )

  assert.deepEqual(
    report.sections.map((section) => [section.status, section.projects.map((project) => project.id)]),
    [
      ['En Producción', ['c']],
      ['QA', ['e']],
      ['En desarrollo', ['a']],
    ],
  )
  assert.equal(report.totals.projects, 3)
  assert.deepEqual(report.totals.byStatus, { 'En Producción': 1, QA: 1, 'En desarrollo': 1 })
})

test('ordena por prioridad y despues por nombre', async () => {
  const { buildProjectReport } = await import('./project-report.ts')

  const report = buildProjectReport(
    {
      ...emptyInput,
      projects: [row('zeta', { priority: 'Alta' }), row('beta'), row('alfa'), row('omega', { priority: 'Baja' }), row('crit', { priority: 'Critica' })],
    },
    NOW,
  )

  assert.deepEqual(
    report.sections[0].projects.map((project) => project.id),
    ['crit', 'zeta', 'alfa', 'beta', 'omega'],
  )
})

test('marca entregas vencidas y proximas, salvo lo que ya esta en produccion', async () => {
  const { buildProjectReport } = await import('./project-report.ts')

  const report = buildProjectReport(
    {
      ...emptyInput,
      projects: [
        row('vencida', { estimated_delivery: '2026-10-05' }),
        row('hoy', { estimated_delivery: '2026-10-06' }),
        row('lejos', { estimated_delivery: '2026-12-20' }),
        row('entregada', { status: 'En Producción', estimated_delivery: '2026-01-01' }),
      ],
    },
    NOW,
  )

  const states = Object.fromEntries(report.sections.flatMap((section) => section.projects).map((project) => [project.id, project.deliveryState]))
  assert.deepEqual(states, { vencida: 'vencida', hoy: 'proxima', lejos: 'en-plazo', entregada: null })
  assert.deepEqual(report.overdue.map((project) => project.id), ['vencida'])
  assert.deepEqual(report.upcoming.map((project) => project.id), ['hoy'])
  assert.equal(report.missing.delivery, 0)
})

test('cuenta actividad de los ultimos 30 dias, equipo, tareas y bloqueos', async () => {
  const { buildProjectReport } = await import('./project-report.ts')

  const report = buildProjectReport(
    {
      projects: [row('p1', { website_url: 'p1.smt.gob.ar', description: '  ' }), row('p2', { status: 'QA' })],
      members: [
        { id: 'm1', full_name: 'Zoe' },
        { id: 'm2', full_name: 'Ana' },
      ],
      projectMembers: [
        { project_id: 'p1', member_id: 'm1' },
        { project_id: 'p1', member_id: 'm2' },
        { project_id: 'p1', member_id: 'borrado' },
      ],
      tasks: [
        { id: 't1', project_id: 'p1', status: 'Terminada' },
        { id: 't2', project_id: 'p1', status: 'Bloqueada' },
      ],
      blockers: [{ task_id: 't2', reason: 'Falta acceso al servidor' }],
      commits: [
        { project_id: 'p1', committed_at: '2026-10-01T10:00:00Z', author: 'Ana' },
        { project_id: 'p1', committed_at: '2026-10-03T10:00:00Z', author: 'ana ' },
        { project_id: 'p1', committed_at: '2026-08-01T10:00:00Z', author: 'Viejo' },
        { project_id: 'p1', committed_at: null, author: 'Sin fecha' },
      ],
    },
    NOW,
  )

  const p1 = report.sections.flatMap((section) => section.projects).find((project) => project.id === 'p1')
  assert.ok(p1)
  assert.equal(p1.site, 'https://p1.smt.gob.ar')
  assert.equal(p1.description, null)
  assert.deepEqual(p1.team, ['Ana', 'Zoe'])
  assert.equal(p1.commits, 2)
  assert.equal(p1.contributors, 1)
  assert.equal(p1.lastCommitAt, '2026-10-03T10:00:00Z')
  assert.deepEqual([p1.tasksOpen, p1.tasksDone], [1, 1])
  assert.deepEqual(p1.openBlockers, ['Falta acceso al servidor'])

  assert.equal(report.totals.commits, 2)
  assert.equal(report.totals.activeProjects, 1)
  assert.equal(report.totals.openBlockers, 1)
  assert.deepEqual(report.inactive.map((project) => project.id), ['p2'])
  assert.deepEqual(report.mostActive.map((project) => project.id), ['p1'])
  assert.deepEqual(report.missing, { description: 2, area: 2, delivery: 2, team: 1 })
})

test('reparte bloques en hojas sin dejar titulos sueltos', async () => {
  const { paginateBlocks } = await import('./project-report.ts')

  assert.deepEqual(paginateBlocks([40, 40, 40], 100, 100), [[0, 1], [2]])
  assert.deepEqual(paginateBlocks([30, 30, 30, 30], 70, 100), [[0, 1], [2, 3]])
  // El titulo (indice 1) no entra junto con su primer bloque: pasa a la hoja siguiente.
  assert.deepEqual(paginateBlocks([60, 10, 50], 100, 100, [false, true, false]), [[0], [1, 2]])
  // Un bloque mas alto que la hoja va solo.
  assert.deepEqual(paginateBlocks([20, 150, 20], 100, 100), [[0], [1], [2]])
  assert.deepEqual(paginateBlocks([], 100, 100), [[]])
})

test('formatea fechas sin correr un dia', async () => {
  const { formatReportDate, formatLongDate, formatMonthYear, plural } = await import('./project-report.ts')

  assert.equal(formatReportDate('2026-08-21'), '21 ago 2026')
  assert.equal(formatReportDate('2026-01-01'), '1 ene 2026')
  assert.equal(formatLongDate(NOW), '6 de octubre de 2026')
  assert.equal(formatMonthYear(NOW), 'Octubre de 2026')
  assert.equal(formatReportDate(null), null)
  assert.equal(formatReportDate('cualquier cosa'), null)
  assert.equal(plural(1, 'proyecto', 'proyectos'), '1 proyecto')
  assert.equal(plural(3, 'proyecto', 'proyectos'), '3 proyectos')
})
