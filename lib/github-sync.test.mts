import assert from 'node:assert/strict'
import test from 'node:test'

const repo = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  description: null,
  html_url: `https://github.com/DIA-SMT/${name}`,
  language: 'TypeScript',
  archived: false,
  ...extra,
})

const project = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  active: true,
  repository_url: null,
  repository_url_secondary: null,
  github_repo_id: null,
  ...extra,
})

test('normaliza la URL del repo a owner/repo en minusculas', async () => {
  const { githubRepoKey } = await import('./github-sync.ts')

  assert.equal(githubRepoKey('https://github.com/DIA-SMT/LluvIA'), 'dia-smt/lluvia')
  assert.equal(githubRepoKey(' https://github.com/DIA-SMT/LluvIA.git/ '), 'dia-smt/lluvia')
  assert.equal(githubRepoKey('https://github.com/DIA-SMT/LluvIA/tree/main'), 'dia-smt/lluvia')
  assert.equal(githubRepoKey('https://gitlab.com/DIA-SMT/LluvIA'), null)
  assert.equal(githubRepoKey('https://github.com/DIA-SMT'), null)
  assert.equal(githubRepoKey('no es una url'), null)
  assert.equal(githubRepoKey(null), null)
})

test('crea un proyecto por cada repo que no esta cargado', async () => {
  const { planGithubProjectSync } = await import('./github-sync.ts')

  const plan = planGithubProjectSync([repo(1, 'nuevo', { description: '  Bot nuevo  ' })], [])

  assert.deepEqual(plan.inserts, [
    {
      name: 'nuevo',
      description: 'Bot nuevo',
      stack: 'TypeScript',
      repository_url: 'https://github.com/DIA-SMT/nuevo',
      github_repo_id: 1,
      status: 'En desarrollo',
      priority: 'Media',
      progress: 0,
    },
  ])
  assert.deepEqual(plan.links, [])
})

test('no duplica repos cargados como Repo 1 o Repo 2, sin importar mayusculas', async () => {
  const { planGithubProjectSync } = await import('./github-sync.ts')

  const plan = planGithubProjectSync(
    [repo(1, 'GeneracionNotaIA-FRONT'), repo(2, 'GeneracionNotaIA-BACK')],
    [
      project('p1', {
        repository_url: 'https://github.com/dia-smt/generacionnotaia-front',
        repository_url_secondary: 'https://github.com/DIA-SMT/GeneracionNotaIA-BACK.git',
      }),
    ],
  )

  assert.deepEqual(plan.inserts, [])
  assert.deepEqual(plan.links, [{ projectId: 'p1', githubRepoId: 1 }])
})

test('respeta los proyectos dados de baja y sigue repos renombrados por id', async () => {
  const { planGithubProjectSync } = await import('./github-sync.ts')

  const plan = planGithubProjectSync(
    [repo(1, 'descartado'), repo(2, 'nombre-nuevo')],
    [
      project('p1', { active: false, repository_url: 'https://github.com/DIA-SMT/descartado' }),
      project('p2', { repository_url: 'https://github.com/DIA-SMT/nombre-viejo', github_repo_id: 2 }),
    ],
  )

  assert.deepEqual(plan.inserts, [])
  assert.deepEqual(plan.links, [{ projectId: 'p1', githubRepoId: 1 }])
})

test('ignora repos archivados, ocultos y los de la lista de exclusion', async () => {
  const { planGithubProjectSync, parseIgnoredRepos } = await import('./github-sync.ts')

  const ignored = parseIgnoredRepos(' Pruebas , ,otro')
  assert.deepEqual([...ignored], ['pruebas', 'otro'])

  const plan = planGithubProjectSync(
    [repo(1, 'viejo', { archived: true }), repo(2, '.github'), repo(3, 'pruebas'), repo(4, 'sirve')],
    [],
    ignored,
  )

  assert.deepEqual(
    plan.inserts.map((insert) => insert.name),
    ['sirve'],
  )
})
