import assert from 'node:assert/strict'
import test from 'node:test'

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/projects', label: 'Proyectos' },
  { href: '/radar', label: 'Radar' },
  { href: '/tasks', label: 'Tareas' },
  { href: '/team', label: 'Equipo' },
  { href: '/expedientes', label: 'Expedientes' },
  { href: '/commit-history', label: 'Historial' },
  { href: '/papelera', label: 'Papelera' },
]

test('el equipo DIA accede a todas las rutas', async () => {
  const { canAccessRoute, filterNavItemsForTeam, homeRouteForTeam, isTeamRestricted } = await import('./team-access.ts')

  assert.equal(isTeamRestricted('dia'), false)
  assert.equal(homeRouteForTeam('dia'), '/')
  for (const item of navItems) {
    assert.equal(canAccessRoute('dia', item.href), true)
  }
  assert.deepEqual(filterNavItemsForTeam('dia', navItems), navItems)
})

test('un equipo externo solo accede a proyectos y equipo', async () => {
  const { canAccessRoute, filterNavItemsForTeam, homeRouteForTeam, isTeamRestricted } = await import('./team-access.ts')

  assert.equal(isTeamRestricted('ditec'), true)
  assert.equal(homeRouteForTeam('ditec'), '/projects')

  assert.equal(canAccessRoute('ditec', '/projects'), true)
  assert.equal(canAccessRoute('ditec', '/proyectos'), true)
  assert.equal(canAccessRoute('ditec', '/radar'), true)
  assert.equal(canAccessRoute('ditec', '/team'), true)
  assert.equal(canAccessRoute('ditec', '/equipo'), true)

  assert.equal(canAccessRoute('ditec', '/'), false)
  assert.equal(canAccessRoute('ditec', '/tasks'), false)
  assert.equal(canAccessRoute('ditec', '/expedientes'), false)
  assert.equal(canAccessRoute('ditec', '/expedientes/123'), false)
  assert.equal(canAccessRoute('ditec', '/commit-history'), false)
  assert.equal(canAccessRoute('ditec', '/papelera'), false)
  assert.equal(canAccessRoute('ditec', '/testing'), false)
  assert.equal(canAccessRoute('ditec', '/supabase'), false)

  assert.deepEqual(
    filterNavItemsForTeam('ditec', navItems).map((item) => item.href),
    ['/projects', '/radar', '/team']
  )
})

test('las rutas publicas quedan accesibles para cualquier equipo', async () => {
  const { canAccessRoute } = await import('./team-access.ts')

  assert.equal(canAccessRoute('ditec', '/login'), true)
  assert.equal(canAccessRoute('ditec', '/forgot-password'), true)
  assert.equal(canAccessRoute('ditec', '/reset-password'), true)
})

test('sin equipo conocido no se restringe la UI (compatibilidad)', async () => {
  const { canAccessRoute, filterNavItemsForTeam, homeRouteForTeam, isTeamRestricted } = await import('./team-access.ts')

  assert.equal(isTeamRestricted(null), false)
  assert.equal(homeRouteForTeam(null), '/')
  assert.equal(canAccessRoute(null, '/expedientes'), true)
  assert.deepEqual(filterNavItemsForTeam(null, navItems), navItems)
})

test('los prefijos no generan falsos positivos', async () => {
  const { canAccessRoute } = await import('./team-access.ts')

  assert.equal(canAccessRoute('ditec', '/projectsecret'), false)
  assert.equal(canAccessRoute('ditec', '/projects/abc'), true)
})
