import assert from 'node:assert/strict'
import test from 'node:test'

type Project = {
  id: string
  name: string
  status: string
  priority: string
}

const projects: Project[] = [
  { id: '1', name: 'Baja activa', status: 'En desarrollo', priority: 'Baja' },
  { id: '2', name: 'Alta pausada', status: 'Pausado', priority: 'Alta' },
  { id: '3', name: 'Media activa', status: 'QA', priority: 'Media' },
  { id: '4', name: 'Alta activa', status: 'En desarrollo', priority: 'Alta' },
  { id: '5', name: 'Produccion', status: 'En Producción', priority: 'Media' },
]

test('ordena los pausados al final y luego respeta la prioridad', async () => {
  let loadedModule: typeof import('./project-filters.ts') | undefined
  try {
    loadedModule = await import('./project-filters.ts')
  } catch {
    // La primera ejecucion debe fallar hasta que exista la implementacion.
  }

  assert.equal(typeof loadedModule?.filterAndSortProjects, 'function')
  const result = loadedModule!.filterAndSortProjects(projects, { kind: 'all' })

  assert.deepEqual(result.map((project) => project.id), ['4', '3', '5', '1', '2'])
})

test('filtra por estado y por prioridad', async () => {
  const { filterAndSortProjects } = await import('./project-filters.ts')

  assert.deepEqual(
    filterAndSortProjects(projects, { kind: 'status', value: 'En desarrollo' }).map((project) => project.id),
    ['4', '1'],
  )
  assert.deepEqual(
    filterAndSortProjects(projects, { kind: 'priority', value: 'Media' }).map((project) => project.id),
    ['3', '5'],
  )
})
