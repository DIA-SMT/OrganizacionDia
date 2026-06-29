import assert from 'node:assert/strict'
import test from 'node:test'

test('calcula responsables agregados y quitados sin duplicados', async () => {
  let loadedModule: typeof import('./task-assignees.ts') | undefined
  try {
    loadedModule = await import('./task-assignees.ts')
  } catch {
    // La primera ejecucion debe fallar hasta que exista la implementacion.
  }

  assert.equal(typeof loadedModule?.getAssigneeChanges, 'function')
  assert.deepEqual(loadedModule!.getAssigneeChanges(['a', 'b'], ['b', 'c', 'c']), {
    added: ['c'],
    removed: ['a'],
    next: ['b', 'c'],
  })
})

test('no genera cambios si la seleccion es equivalente', async () => {
  const { getAssigneeChanges } = await import('./task-assignees.ts')
  assert.deepEqual(getAssigneeChanges(['b', 'a'], ['a', 'b']), {
    added: [],
    removed: [],
    next: ['a', 'b'],
  })
})
