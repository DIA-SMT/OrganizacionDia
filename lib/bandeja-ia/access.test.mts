import assert from 'node:assert/strict'
import test from 'node:test'

test('la lista de demo asigna roles y por defecto es operador', async () => {
  const { parseDemoAccessList } = await import('./access.ts')

  const access = parseDemoAccessList(' Ana@SMT.gob.ar:admin, bruno@smt.gob.ar ,carla@smt.gob.ar:lector')
  assert.equal(access.get('ana@smt.gob.ar'), 'admin')
  assert.equal(access.get('bruno@smt.gob.ar'), 'operador')
  assert.equal(access.get('carla@smt.gob.ar'), 'lector')
})

test('las entradas invalidas nunca otorgan acceso', async () => {
  const { demoRoleForEmail, parseDemoAccessList } = await import('./access.ts')

  assert.equal(parseDemoAccessList('ana@smt.gob.ar:superadmin, sin-arroba, :admin, ').size, 0)
  assert.equal(demoRoleForEmail('', 'ana@smt.gob.ar'), null)
  assert.equal(demoRoleForEmail(undefined, 'ana@smt.gob.ar'), null)
  assert.equal(demoRoleForEmail('ana@smt.gob.ar', null), null)
  assert.equal(demoRoleForEmail('ana@smt.gob.ar', 'otra@smt.gob.ar'), null)
})

test('solo admin y operador gestionan; solo admin administra', async () => {
  const { canAdminister, canOperate } = await import('./access.ts')

  assert.equal(canOperate('admin'), true)
  assert.equal(canOperate('operador'), true)
  assert.equal(canOperate('lector'), false)
  assert.equal(canOperate(null), false)
  assert.equal(canAdminister('operador'), false)
  assert.equal(canAdminister('admin'), true)
})

test('reconoce el error de funcion inexistente (base sin migrar)', async () => {
  const { isMissingFunctionError } = await import('./access.ts')

  assert.equal(isMissingFunctionError({ code: 'PGRST202', message: '' }), true)
  assert.equal(isMissingFunctionError({ code: '42883' }), true)
  assert.equal(isMissingFunctionError({ code: '42501', message: 'permission denied' }), false)
  assert.equal(isMissingFunctionError(null), false)
})

test('Bandeja IA queda cerrada para equipos externos', async () => {
  const { canAccessRoute } = await import('../team-access.ts')

  assert.equal(canAccessRoute('ditec', '/bandeja-ia'), false)
  assert.equal(canAccessRoute('ditec', '/bandeja-ia/asunto/123'), false)
})
