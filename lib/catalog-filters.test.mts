import assert from 'node:assert/strict'
import test from 'node:test'

const projects = [
  {
    name: 'Complejo Deportivo',
    description: 'Reserva de canchas municipales',
    stack: 'Next.js',
    requester_area: 'Deportes',
    functional_owner: null,
    technical_owner_name: 'Ana',
    team_name: 'DIA',
    team_slug: 'dia',
    team_color: '#7c3aed',
    status: 'En desarrollo',
  },
  {
    name: 'Turnos Deportivos',
    description: 'Gestion de turnos del complejo deportivo',
    stack: 'Laravel',
    requester_area: 'Deportes',
    functional_owner: 'Juan',
    technical_owner_name: null,
    team_name: 'DITEC',
    team_slug: 'ditec',
    team_color: '#0ea5e9',
    status: 'Planificación',
  },
  {
    name: 'Expedientes Digitales',
    description: null,
    stack: null,
    requester_area: 'Mesa de entradas',
    functional_owner: null,
    technical_owner_name: 'Ana',
    team_name: 'DIA',
    team_slug: 'dia',
    team_color: '#7c3aed',
    status: 'En Producción',
  },
]

test('sin filtros devuelve todo ordenado por nombre', async () => {
  const { filterCatalog } = await import('./catalog-filters.ts')

  const result = filterCatalog(projects, null, '')
  assert.deepEqual(
    result.map((p) => p.name),
    ['Complejo Deportivo', 'Expedientes Digitales', 'Turnos Deportivos']
  )
})

test('filtra por equipo', async () => {
  const { filterCatalog } = await import('./catalog-filters.ts')

  const result = filterCatalog(projects, 'ditec', '')
  assert.deepEqual(
    result.map((p) => p.name),
    ['Turnos Deportivos']
  )
})

test('busca sin distinguir mayusculas en todos los campos de la ficha', async () => {
  const { filterCatalog } = await import('./catalog-filters.ts')

  assert.equal(filterCatalog(projects, null, 'DEPORTIVO').length, 2)
  assert.equal(filterCatalog(projects, null, 'laravel').length, 1)
  assert.equal(filterCatalog(projects, null, 'mesa de entradas').length, 1)
  assert.equal(filterCatalog(projects, null, 'ana').length, 2)
  assert.equal(filterCatalog(projects, 'dia', 'deportivo').length, 1)
  assert.equal(filterCatalog(projects, null, 'no-existe').length, 0)
})

test('arma las opciones de equipo con conteo', async () => {
  const { getTeamOptions } = await import('./catalog-filters.ts')

  const options = getTeamOptions(projects)
  assert.deepEqual(options, [
    { slug: 'dia', name: 'DIA', color: '#7c3aed', count: 2 },
    { slug: 'ditec', name: 'DITEC', color: '#0ea5e9', count: 1 },
  ])
})
