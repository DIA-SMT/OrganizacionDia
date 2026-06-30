import assert from 'node:assert/strict'
import test from 'node:test'

test('detecta preguntas sobre integrantes de un proyecto', async () => {
  const engine = await import('./engine.ts')
  assert.equal(engine.isProjectMembersQuestion('quienes son los integrantes de bot turismo'), true)
  assert.equal(engine.isProjectMembersQuestion('quien trabaja en este proyecto'), true)
  assert.equal(engine.isProjectMembersQuestion('como esta bot turismo'), false)
})

test('prioriza miembros conocidos y evita autores duplicados', async () => {
  const engine = await import('./engine.ts')
  const participants = engine.resolveProjectParticipants(
    [
      { id: '1', full_name: 'Lucas Nahuz', email: 'lucas@dia.gob.ar', role: 'Dev', avatar_url: '/lucas.jpg', github_username: 'LucasNahuz' },
      { id: '2', full_name: 'Ana Diaz', email: 'ana@dia.gob.ar', role: 'UX', avatar_url: null, github_username: null },
    ],
    ['2', '2'],
    [
      { name: 'LucasNahuz', login: 'LucasNahuz', avatarUrl: 'https://github.test/lucas.png' },
      { name: 'Lucas Nahuz', login: null, avatarUrl: null },
    ],
  )

  assert.deepEqual(participants.map((participant) => participant.name), ['Ana Diaz', 'Lucas Nahuz'])
  assert.equal(participants[0]?.source, 'task')
  assert.equal(participants[1]?.role, 'Dev')
})

test('prioriza responsables explicitos del proyecto sobre otras fuentes', async () => {
  const engine = await import('./engine.ts')
  const participants = engine.resolveProjectParticipants(
    [
      { id: '1', full_name: 'Lucas Nahuz', email: 'lucas@dia.gob.ar', role: 'Dev', avatar_url: null, github_username: 'LucasNahuz' },
      { id: '2', full_name: 'Ana Diaz', email: 'ana@dia.gob.ar', role: 'UX', avatar_url: null, github_username: null },
    ],
    ['2'],
    [{ name: 'LucasNahuz', login: 'LucasNahuz', avatarUrl: null }],
    ['1'],
  )

  assert.deepEqual(participants.map((participant) => participant.name), ['Lucas Nahuz', 'Ana Diaz'])
  assert.equal(participants[0]?.source, 'project_and_activity')
})

test('detecta dominios del dashboard sin confundirlos', async () => {
  const engine = await import('./engine.ts')
  assert.equal(engine.isCommitQuestion('cuales fueron los ultimos commits'), true)
  assert.equal(engine.isCommitQuestion('como esta bot turismo'), false)
  assert.equal(engine.isExpedienteQuestion('que expedientes nuevos llegaron'), true)
  assert.equal(engine.isTeamQuestion('cuantas personas hay en el equipo'), true)
  assert.equal(engine.isProjectDocumentsQuestion('que PDFs tiene cargados este proyecto'), true)
})

test('interpreta rangos temporales habituales', async () => {
  const engine = await import('./engine.ts')
  assert.equal(engine.resolveAssistantDays('que hicimos en las ultimas 24 horas'), 1)
  assert.equal(engine.resolveAssistantDays('commits de los ultimos 7 dias'), 7)
  assert.equal(engine.resolveAssistantDays('actividad del ultimo mes'), 30)
  assert.equal(engine.resolveAssistantDays('todos los commits'), null)
  assert.equal(engine.resolveAssistantDays('ultimos commits'), null)
})
