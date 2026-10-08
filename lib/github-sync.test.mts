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

const NEXT_TEMPLATE = [
  'This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).',
  '',
  '## Getting Started',
  '',
  'First, run the development server:',
  '',
  '```bash',
  'npm run dev',
  '# or',
  'yarn dev',
  '```',
  '',
  'Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.',
  '',
  'You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.',
  '',
  'This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.',
  '',
  '## Learn More',
  '',
  'To learn more about Next.js, take a look at the following resources:',
  '',
  '- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.',
  '- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.',
  '',
  'You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!',
  '',
  '## Deploy on Vercel',
  '',
  'The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.',
  '',
  'Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.',
].join('\n')

const CRA_TEMPLATE = [
  '# Getting Started with Create React App',
  '',
  'This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).',
  '',
  '## Available Scripts',
  '',
  'In the project directory, you can run:',
  '',
  '### `npm start`',
  '',
  'Runs the app in the development mode.\\',
  'Open [http://localhost:3000](http://localhost:3000) to view it in your browser.',
  '',
  'The page will reload when you make changes.\\',
  'You may also see any lint errors in the console.',
  '',
  '### `npm run build`',
  '',
  'Builds the app for production to the `build` folder.\\',
  'It correctly bundles React in production mode and optimizes the build for the best performance.',
  '',
  'The build is minified and the filenames include the hashes.\\',
  'Your app is ready to be deployed!',
  '',
  '### `npm run eject`',
  '',
  '**Note: this is a one-way operation. Once you `eject`, you can’t go back!**',
  '',
  'If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.',
  '',
  '## Learn More',
  '',
  'You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).',
  '',
  'To learn React, check out the [React documentation](https://reactjs.org/).',
].join('\n')

const VITE_BODY = [
  'This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.',
  '',
  'Currently, two official plugins are available:',
  '',
  '- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh',
  '- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react) uses [SWC](https://swc.rs/) for Fast Refresh',
  '',
  '## React Compiler',
  '',
  'The React Compiler is not enabled on this template because of its impact on dev & build performances.',
  '',
  '## Expanding the ESLint configuration',
  '',
  'If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:',
  '',
  '```js',
  'export default tseslint.config({ languageOptions: { parserOptions: { project: true } } })',
  '```',
].join('\n')
const VITE_TEMPLATE = `# React + TypeScript + Vite\n\n${VITE_BODY}`

const LOVABLE_TEMPLATE = [
  '# Welcome to your Lovable project',
  '',
  '## Project info',
  '',
  '**URL**: https://lovable.dev/projects/1234',
  '',
  '## How can I edit this code?',
  '',
  'There are several ways of editing your application.',
  '',
  '**Use Lovable**',
  '',
  'Simply visit the [Lovable Project](https://lovable.dev/projects/1234) and start prompting.',
  '',
  '**Use your preferred IDE**',
  '',
  'If you want to work locally using your own IDE, you can clone this repo and push changes.',
  '',
  'Follow these steps:',
  '',
  '```sh',
  'git clone <YOUR_GIT_URL>',
  '```',
  '',
  '**Edit a file directly in GitHub**',
  '',
  '- Navigate to the desired file(s).',
  '- Click the "Edit" button (pencil icon) at the top right of the file view.',
  '- Make your changes and commit the changes.',
  '',
  '## What technologies are used for this project?',
  '',
  'This project is built with:',
  '',
  '- Vite',
  '- TypeScript',
  '',
  '## How can I deploy this project?',
  '',
  'Simply open [Lovable](https://lovable.dev/projects/1234) and click on Share -> Publish.',
  '',
  '## Can I connect a custom domain to my Lovable project?',
  '',
  'Yes, you can!',
  '',
  'To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.',
  '',
  '## I want to use a custom domain - is that possible?',
  '',
  "We don't support custom domains (yet). If you want to deploy your project under your own domain then we recommend using Netlify.",
].join('\n')

const INTRO = 'Tablero de Riesgo Hidrico para Defensa Civil: muestra en un mapa los barrios con mas lluvia acumulada y avisa cuando se superan los umbrales de alerta definidos por la Municipalidad.'

test('descarta READMEs vacios, cortos o de plantilla pelada', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  assert.equal(usefulReadme(null), null)
  assert.equal(usefulReadme('# Proyecto\n\nCorto.'), null)
  for (const [name, template] of Object.entries({ NEXT_TEMPLATE, CRA_TEMPLATE, VITE_TEMPLATE, LOVABLE_TEMPLATE })) {
    assert.equal(usefulReadme(template), null, name)
  }
  // La plantilla de Vite con el titulo cambiado sigue siendo solo plantilla.
  assert.equal(usefulReadme(`# Turnos Registro Civil\n\n${VITE_BODY}`), null)
})

test('conserva lo propio del proyecto aunque venga con la plantilla', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  const withNext = usefulReadme(`# Tablero de Riesgo Hidrico\n\n${INTRO}\n\n${NEXT_TEMPLATE}`)
  assert.ok(withNext?.includes('Defensa Civil'))
  assert.ok(!withNext?.includes('Getting Started') && !withNext?.includes('npm run dev') && !withNext?.includes('Vercel'))

  // Un parrafo propio pegado al final, sin titulo, dentro de la ultima seccion de la plantilla.
  const appended = usefulReadme(`${NEXT_TEMPLATE}\n\n${INTRO}`)
  assert.ok(appended?.includes('Defensa Civil') && !appended.includes('Vercel'))

  // Un titulo principal de plantilla no se lleva lo que sigue.
  const withVite = usefulReadme(`${VITE_TEMPLATE}\n\n## Sobre el proyecto\n\n${INTRO}`)
  assert.ok(withVite?.includes('## Sobre el proyecto') && withVite.includes('Defensa Civil'))
  assert.ok(!withVite?.includes('tseslint') && !withVite?.includes('vitejs'))

  const withLovable = usefulReadme(`${LOVABLE_TEMPLATE}\n\n## Que hace\n\n${INTRO}`)
  assert.ok(withLovable?.includes('Defensa Civil') && !withLovable.includes('lovable.dev') && !withLovable.includes('Netlify'))

  const cleaned = usefulReadme(`# LluvIA\n\n<!-- comentario -->![logo](logo.png)\n${INTRO}`)
  assert.ok(cleaned?.startsWith('# LluvIA') && !cleaned.includes('comentario') && !cleaned.includes('logo.png'))
})

test('sin huella de plantilla no descarta secciones con titulos genericos', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  const cases = [
    `# React + Vite\n\nSistema de turnos online para el Registro Civil: el vecino elige el tramite, la sede y el horario, y recibe la confirmacion por correo.\n\n## Expanding the ESLint configuration\n\nReglas de lint.`,
    '# Portal de Transparencia\n\n## Getting started\n\nEl Portal de Transparencia publica los sueldos y las contrataciones del municipio para que cualquier vecino los consulte.',
    '# Mapa de Obras\n\n## Project info\n\nMapa publico de las obras municipales en curso, con avance, presupuesto y empresa a cargo.',
    '# Padron de Comercios\n\nConsulta del padron de comercios habilitados por la Municipalidad, con busqueda por rubro.',
  ]
  for (const readme of cases) assert.ok(usefulReadme(readme), readme.slice(0, 30))
})

test('solo saca bloques de codigo bien formados', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  // Tres comillas invertidas en medio de una oracion no son un bloque.
  const inline = usefulReadme(`# Asistente de codigo\n\nPara citar codigo en las respuestas, el asistente usa bloques con \`\`\` como en Markdown.\n\n## Que hace\n\n${INTRO}`)
  assert.ok(inline?.includes('Defensa Civil'))

  const tilde = usefulReadme(`# LluvIA\n\n${INTRO}\n\n~~~bash\n# esto no es un titulo\nnpm install\n~~~\n\nFin del texto propio del proyecto.`)
  assert.ok(tilde && !tilde.includes('npm install') && !tilde.includes('esto no es un titulo') && tilde.includes('Fin del texto'))
})

test('limpia el resumen del modelo sin romper comillas ni nombres', async () => {
  const { cleanSummary } = await import('./github-sync.ts')

  assert.equal(cleanSummary('  "LluvIA es un tablero."  '), 'LluvIA es un tablero.')
  assert.equal(cleanSummary('“LluvIA es un tablero.”'), 'LluvIA es un tablero.')
  assert.equal(cleanSummary('"LluvIA es un tablero de "alertas" de lluvia."'), 'LluvIA es un tablero de "alertas" de lluvia.')
  assert.equal(cleanSummary('"LluvIA" es un tablero para Defensa Civil.'), '"LluvIA" es un tablero para Defensa Civil.')
  assert.equal(cleanSummary('"LluvIA" es un tablero para "Defensa Civil"'), '"LluvIA" es un tablero para "Defensa Civil"')
  assert.equal(cleanSummary('“LluvIA” es un tablero.'), '“LluvIA” es un tablero.')
  assert.equal(cleanSummary('El sistema se llama "LluvIA"'), 'El sistema se llama "LluvIA"')
  assert.equal(cleanSummary('bot_turismo atiende consultas de turistas.'), 'bot_turismo atiende consultas de turistas.')
  assert.equal(cleanSummary('*LluvIA* es un tablero para _Defensa Civil_.'), 'LluvIA es un tablero para Defensa Civil.')
  assert.equal(cleanSummary('**Resumen:** LluvIA es un **tablero**.'), 'LluvIA es un tablero.')
  assert.equal(cleanSummary('Descripción: ver [el mapa](https://x.gob.ar) de lluvias.'), 'Ver el mapa de lluvias.')
  assert.equal(cleanSummary('Según el README, LluvIA es un tablero para Defensa Civil.'), 'LluvIA es un tablero para Defensa Civil.')

  const long = `${'Primera oracion bastante larga para el resumen. '.repeat(10)}Ultima.`
  const cut = cleanSummary(long)
  assert.ok(cut && cut.length <= 700 && cut.endsWith('.'))
})

test('reconoce cuando el modelo dice que no hay informacion', async () => {
  const { cleanSummary } = await import('./github-sync.ts')

  const notSummaries = [
    'SIN_INFO',
    'SIN INFO',
    'sin-info',
    'SIN\\_INFO',
    '**SIN_INFO**',
    'Sin información.',
    'N/A',
    'Información insuficiente.',
    'No hay suficiente información para describir el proyecto.',
    'El README solo contiene instrucciones de instalación y no describe el proyecto.',
    'El archivo README no describe el proyecto.',
    'El repositorio solo trae instrucciones de instalación; no describe de qué se trata el proyecto.',
    'La documentación disponible no explica el propósito del sistema.',
    '',
    null,
  ]
  for (const answer of notSummaries) assert.equal(cleanSummary(answer), null, String(answer))
})

test('no descarta resumenes que mencionan "sin informacion" o "el README"', async () => {
  const { cleanSummary } = await import('./github-sync.ts')

  const summaries = [
    'LluvIA es un tablero que evita que los barrios queden sin información sobre la lluvia acumulada.',
    'Sistema de gestión sin información personal de los vecinos, que respeta la privacidad.',
    'Herramienta que genera el README de cada repositorio del equipo a partir de su código.',
  ]
  for (const summary of summaries) assert.equal(cleanSummary(summary), summary)
})

test('detecta el cupo agotado de GitHub y lo distingue de la falta de permiso', async () => {
  const { isRateLimited } = await import('./github-sync.ts')
  const headers = (values: Record<string, string>) => (name: string) => values[name] ?? null

  assert.equal(isRateLimited(429, headers({})), true)
  assert.equal(isRateLimited(403, headers({ 'x-ratelimit-remaining': '0' })), true)
  assert.equal(isRateLimited(403, headers({ 'retry-after': '60' })), true)
  assert.equal(isRateLimited(403, headers({ 'x-ratelimit-remaining': '4100' }), '{"message":"You have exceeded a secondary rate limit."}'), true)
  assert.equal(isRateLimited(403, headers({ 'x-ratelimit-remaining': '4200' }), '{"message":"Resource not accessible by personal access token"}'), false)
  assert.equal(isRateLimited(404, headers({})), false)
})

const githubRepo = { description: 'Bot de turismo', language: 'TypeScript', homepage: 'turismo.smt.gob.ar', created_at: '2025-11-02T10:00:00Z', pushed_at: '2026-10-07T10:00:00Z' }

test('completa con el listado solo los campos en null', async () => {
  const { listingPatch } = await import('./github-sync.ts')

  assert.deepEqual(listingPatch({ description: null, stack: null, start_date: null, website_url: null }, githubRepo), {
    description: 'Bot de turismo',
    stack: 'TypeScript',
    start_date: '2025-11-02',
    website_url: 'https://turismo.smt.gob.ar',
  })
  assert.deepEqual(listingPatch({ description: 'Escrita a mano', stack: 'Next.js', start_date: '2025-01-01', website_url: 'https://otro.gob.ar' }, githubRepo), {})
  assert.deepEqual(listingPatch({ description: null, stack: null, start_date: null, website_url: null }, { description: '  ', language: null, homepage: '', created_at: null }), {})
})

test('elige que READMEs analizar: los pendientes primero y reanaliza solo si hubo cambios', async () => {
  const { readmeCandidates } = await import('./github-sync.ts')
  const project = (id: string, repoId: number, extra: Record<string, unknown> = {}) => ({
    id,
    description: null,
    stack: null,
    start_date: null,
    website_url: null,
    github_repo_id: repoId,
    github_enriched_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  })
  const day = 24 * 60 * 60 * 1000
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
  const repos = new Map([
    [1, { ...githubRepo, pushed_at: iso(10 * day) }],
    [2, { ...githubRepo, pushed_at: iso(day / 2) }],
    [3, { ...githubRepo, pushed_at: iso(day / 2) }],
    [4, { ...githubRepo, pushed_at: iso(day / 2) }],
    [5, { ...githubRepo }],
    [6, { ...githubRepo }],
  ])

  const candidates = readmeCandidates(
    [
      project('analizado-sin-cambios', 1, { github_enriched_at: iso(5 * day) }),
      project('analizado-con-cambios', 2, { github_enriched_at: iso(3 * day) }),
      project('analizado-hace-poco', 3, { github_enriched_at: iso(day / 4) }),
      project('escrita-a-mano', 4, { description: 'Escrita por el equipo' }),
      project('nuevo-viejo', 5, { created_at: '2026-01-01T00:00:00Z' }),
      project('nuevo-reciente', 6, { created_at: '2026-10-01T00:00:00Z', description: 'Bot de turismo' }),
      project('sin-repo-visible', 99),
    ],
    repos,
  )

  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ['nuevo-reciente', 'nuevo-viejo', 'analizado-con-cambios'],
  )
})

test('el analisis del README solo mejora lo que vino de GitHub', async () => {
  const { readmePatch } = await import('./github-sync.ts')
  const languages = { TypeScript: 10, CSS: 2 }

  assert.deepEqual(readmePatch({ description: 'Bot de turismo', stack: 'TypeScript' }, githubRepo, languages, 'Asistente para turistas.'), {
    description: 'Asistente para turistas.',
    stack: 'TypeScript, CSS',
  })
  assert.deepEqual(readmePatch({ description: null, stack: null }, githubRepo, null, null), {})
  assert.deepEqual(readmePatch({ description: 'Escrita por el equipo', stack: 'Next.js' }, githubRepo, languages, 'Asistente para turistas.'), {})
})
