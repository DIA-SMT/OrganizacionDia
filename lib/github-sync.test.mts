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

  const plan = planGithubProjectSync([repo(1, 'nuevo', { description: '  Bot nuevo  ', homepage: 'nuevo.smt.gob.ar', created_at: '2026-03-04T15:20:00Z' })], [])

  assert.deepEqual(plan.inserts, [
    {
      name: 'nuevo',
      description: 'Bot nuevo',
      stack: 'TypeScript',
      repository_url: 'https://github.com/DIA-SMT/nuevo',
      website_url: 'https://nuevo.smt.gob.ar',
      start_date: '2026-03-04',
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

test('arma el stack con los tres lenguajes con mas codigo', async () => {
  const { stackFromLanguages } = await import('./github-sync.ts')

  assert.equal(stackFromLanguages({ CSS: 100, TypeScript: 9000, HTML: 50, JavaScript: 300 }, 'TypeScript'), 'TypeScript, JavaScript, CSS')
  assert.equal(stackFromLanguages({}, 'Python'), 'Python')
  assert.equal(stackFromLanguages(null, null), null)
})

test('descarta READMEs vacios o de plantilla', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  const template = 'This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs). '.repeat(3)
  assert.equal(usefulReadme(null), null)
  assert.equal(usefulReadme('# Proyecto\n\nCorto.'), null)
  assert.equal(usefulReadme(template), null)

  const real = '# LluvIA\n\n<!-- comentario -->![logo](logo.png)\nTablero que avisa a Defensa Civil cuando la lluvia supera los umbrales en cada barrio de la ciudad, con alertas por WhatsApp.'
  const cleaned = usefulReadme(real)
  assert.ok(cleaned?.startsWith('# LluvIA'))
  assert.ok(cleaned?.includes('Tablero que avisa a Defensa Civil'))
  assert.ok(!cleaned?.includes('comentario') && !cleaned?.includes('logo.png'))
})

test('limpia el resumen del modelo y reconoce cuando no hay informacion', async () => {
  const { cleanSummary } = await import('./github-sync.ts')

  assert.equal(cleanSummary('  "**LluvIA** es un tablero."  '), 'LluvIA es un tablero.')
  assert.equal(cleanSummary('SIN_INFO'), null)
  assert.equal(cleanSummary(''), null)

  const long = `${'Primera oracion bastante larga para el resumen. '.repeat(10)}Ultima.`
  const cut = cleanSummary(long)
  assert.ok(cut && cut.length <= 700 && cut.endsWith('.'))
})

test('solo completa lo vacio y mejora la descripcion que vino de GitHub', async () => {
  const { enrichmentPatch } = await import('./github-sync.ts')

  const githubRepo = { description: 'Bot de turismo', language: 'TypeScript', homepage: 'turismo.smt.gob.ar', created_at: '2025-11-02T10:00:00Z' }
  const languages = { TypeScript: 10, CSS: 2 }
  const empty = { description: null, stack: null, start_date: null, website_url: null }

  assert.deepEqual(enrichmentPatch(empty, githubRepo, languages, 'Asistente para turistas.'), {
    description: 'Asistente para turistas.',
    stack: 'TypeScript, CSS',
    start_date: '2025-11-02',
    website_url: 'https://turismo.smt.gob.ar',
  })

  // La descripcion igual a la de GitHub se reemplaza por el resumen; sin resumen queda la de GitHub.
  assert.deepEqual(enrichmentPatch({ ...empty, description: 'Bot de turismo' }, githubRepo, null, 'Resumen.').description, 'Resumen.')
  assert.equal(enrichmentPatch({ ...empty, description: 'Bot de turismo' }, githubRepo, null, null).description, undefined)
  assert.equal(enrichmentPatch(empty, githubRepo, null, null).description, 'Bot de turismo')

  // Lo cargado a mano no se toca.
  const manual = { description: 'Escrita por el equipo', stack: 'Next.js', start_date: '2025-01-01', website_url: 'https://otro.gob.ar' }
  assert.deepEqual(enrichmentPatch(manual, githubRepo, languages, 'Resumen.'), {})
})
