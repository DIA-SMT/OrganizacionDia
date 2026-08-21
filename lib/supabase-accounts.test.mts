import assert from 'node:assert/strict'
import test from 'node:test'

const accounts = [
  { id: 'a1', alias_number: 12, email: 'base+12@smt.gob.ar', label: null, notes: null, project_limit: 2, active: true, created_at: '2026-07-01' },
  { id: 'a2', alias_number: 14, email: 'base+14@smt.gob.ar', label: 'Ambiente', notes: null, project_limit: 2, active: true, created_at: '2026-08-01' },
  { id: 'a3', alias_number: 13, email: 'base+13@smt.gob.ar', label: null, notes: null, project_limit: 3, active: true, created_at: '2026-07-15' },
]

const projects = [
  { id: 'p1', name: 'Uno', status: 'En desarrollo', active: true, supabase_account_id: 'a2' },
  { id: 'p2', name: 'Dos', status: 'QA', active: true, supabase_account_id: 'a2' },
  { id: 'p3', name: 'Tres', status: 'Pausado', active: false, supabase_account_id: 'a2' },
  { id: 'p4', name: 'Cuatro', status: 'Planificación', active: true, supabase_account_id: null },
]

test('nextAliasNumber toma el maximo + 1', async () => {
  const { nextAliasNumber } = await import('./supabase-accounts.ts')
  assert.equal(nextAliasNumber(accounts), 15)
  assert.equal(nextAliasNumber([]), 1)
})

test('latestAccount devuelve el de mayor alias, no el ultimo del arreglo', async () => {
  const { latestAccount } = await import('./supabase-accounts.ts')
  assert.equal(latestAccount(accounts)?.alias_number, 14)
  assert.equal(latestAccount([]), null)
})

test('suggestNextEmail reemplaza el patron +N por el proximo', async () => {
  const { suggestNextEmail } = await import('./supabase-accounts.ts')
  assert.equal(suggestNextEmail(accounts), 'base+15@smt.gob.ar')
  assert.equal(suggestNextEmail([]), '')
})

test('suggestNextEmail no arriesga si el ultimo correo no tiene patron +N', async () => {
  const { suggestNextEmail } = await import('./supabase-accounts.ts')
  const sinPatron = [{ ...accounts[1], email: 'cuenta-suelta@smt.gob.ar' }]
  assert.equal(suggestNextEmail(sinPatron), '')
})

test('countActiveProjects ignora los inactivos', async () => {
  const { countActiveProjects } = await import('./supabase-accounts.ts')
  assert.equal(countActiveProjects('a2', projects), 2)
  assert.equal(countActiveProjects('a1', projects), 0)
})

test('isAccountFull respeta el limite por cuenta', async () => {
  const { isAccountFull } = await import('./supabase-accounts.ts')
  assert.equal(isAccountFull(accounts[1], projects), true) // limite 2, tiene 2
  assert.equal(isAccountFull(accounts[2], projects), false) // limite 3, tiene 0
})

test('unassignedProjects lista los activos sin cuenta', async () => {
  const { unassignedProjects } = await import('./supabase-accounts.ts')
  assert.deepEqual(
    unassignedProjects(projects).map((p) => p.id),
    ['p4']
  )
})

test('sortAccounts ordena por alias ascendente sin mutar', async () => {
  const { sortAccounts } = await import('./supabase-accounts.ts')
  const original = [...accounts]
  assert.deepEqual(
    sortAccounts(accounts).map((a) => a.alias_number),
    [12, 13, 14]
  )
  assert.deepEqual(accounts, original)
})

test('sortAccounts puede ordenar del ultimo alias al primero', async () => {
  const { sortAccounts } = await import('./supabase-accounts.ts')
  const original = [...accounts]
  assert.deepEqual(
    sortAccounts(accounts, 'desc').map((a) => a.alias_number),
    [14, 13, 12]
  )
  assert.deepEqual(accounts, original)
})
