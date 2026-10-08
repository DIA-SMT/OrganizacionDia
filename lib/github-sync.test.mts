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

test('prepara el README: sin codigo, imagenes ni comentarios; null si no queda texto', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  assert.equal(usefulReadme(null), null)
  assert.equal(usefulReadme('# Proyecto\n\nCorto.'), null)
  assert.equal(usefulReadme('# Solo titulos\n\n## Otro titulo\n\n```bash\nnpm install && npm run dev && echo listo para usar\n```'), null)

  // Las plantillas llegan al modelo, que decide si describen el proyecto; sin sus bloques de codigo.
  for (const [name, template] of Object.entries({ NEXT_TEMPLATE, CRA_TEMPLATE, VITE_TEMPLATE, LOVABLE_TEMPLATE })) {
    const text = usefulReadme(template)
    assert.ok(text, name)
    assert.ok(!text.includes('```') && !text.includes('git clone <YOUR_GIT_URL>') && !text.includes('tseslint.config'), name)
  }

  const cleaned = usefulReadme(`# LluvIA\n\n<!-- comentario -->![logo](logo.png)\n${INTRO}`)
  assert.ok(cleaned?.startsWith('# LluvIA') && cleaned.includes('Defensa Civil') && !cleaned.includes('comentario') && !cleaned.includes('logo.png'))
})

test('no pierde contenido propio en ningun formato', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  const cases = [
    `# Tablero de Riesgo Hidrico\n\n${INTRO}\n\n${NEXT_TEMPLATE}`,
    `${NEXT_TEMPLATE}\n\n${INTRO}`,
    `${NEXT_TEMPLATE}\n\nAplicacion en Next.js desplegada en Vercel: ${INTRO}`,
    `${VITE_TEMPLATE}\n\n## Sobre el proyecto\n\n${INTRO}`,
    `# React + TypeScript + Vite\n\nAplicacion React de turnos online para el Registro Civil.\n\n- Reserva de turnos\n- Recordatorios por correo\n\n${VITE_BODY}`,
    `${LOVABLE_TEMPLATE}\n\n## Que hace\n\n${INTRO}`,
    '# Portal de Transparencia\n\n## Getting started\n\nEl Portal de Transparencia publica los sueldos y las contrataciones del municipio para que cualquier vecino los consulte.',
    '# Padron de Comercios\n\nConsulta del padron de comercios habilitados por la Municipalidad, con busqueda por rubro.',
  ]
  for (const readme of cases) {
    const text = usefulReadme(readme)
    assert.ok(text, readme.slice(0, 40))
  }
  assert.ok(usefulReadme(`${VITE_TEMPLATE}\n\n## Sobre el proyecto\n\n${INTRO}`)?.includes('Defensa Civil'))
  assert.ok(usefulReadme(`# React + TypeScript + Vite\n\nAplicacion React de turnos online para el Registro Civil.\n\n- Reserva de turnos\n\n${VITE_BODY}`)?.includes('- Reserva de turnos'))
})

test('solo saca bloques de codigo bien formados', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  // Tres comillas invertidas en medio de una oracion, o al principio de una linea con mas
  // comillas en la misma linea, no abren un bloque.
  const inline = usefulReadme(`# Asistente de codigo\n\nPara citar codigo en las respuestas, el asistente usa bloques con \`\`\` como en Markdown.\n\n## Que hace\n\n${INTRO}`)
  assert.ok(inline?.includes('Defensa Civil'))
  const lineStart = usefulReadme(`# Asistente\n\n\`\`\`usa\`\`\` para marcar codigo en una respuesta del asistente.\n\n${INTRO}`)
  assert.ok(lineStart?.includes('Defensa Civil'))

  const tilde = usefulReadme(`# LluvIA\n\n${INTRO}\n\n~~~bash\n# esto no es un titulo\nnpm install\n~~~\n\nFin del texto propio del proyecto.`)
  assert.ok(tilde && !tilde.includes('npm install') && !tilde.includes('esto no es un titulo') && tilde.includes('Fin del texto'))
})

test('limpia el resumen sin romper comillas ni nombres', async () => {
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

test('interpreta la respuesta del modelo', async () => {
  const { parseModelSummary } = await import('./github-sync.ts')

  assert.deepEqual(parseModelSummary('{"describe": true, "resumen": "LluvIA es un tablero para Defensa Civil."}'), {
    outcome: 'summary',
    text: 'LluvIA es un tablero para Defensa Civil.',
  })
  assert.deepEqual(parseModelSummary('```json\n{"describe": true, "resumen": "**LluvIA** avisa por lluvia."}\n```'), { outcome: 'summary', text: 'LluvIA avisa por lluvia.' })
  assert.deepEqual(parseModelSummary('{"describe": false, "resumen": ""}'), { outcome: 'no-info' })
  assert.deepEqual(parseModelSummary('{"describe": false, "resumen": "El README es la plantilla de Next.js."}'), { outcome: 'no-info' })
  assert.deepEqual(parseModelSummary('{"describe": true, "resumen": ""}'), { outcome: 'no-info' })

  // Si el modelo igual responde texto libre.
  assert.deepEqual(parseModelSummary('LluvIA es un tablero para Defensa Civil.'), { outcome: 'summary', text: 'LluvIA es un tablero para Defensa Civil.' })
  for (const answer of ['SIN_INFO', 'SIN INFO', 'sin-info', 'SIN\\_INFO', '**SIN_INFO**', 'SIN_INFO. El README solo tiene instrucciones de instalacion.', 'SIN_INFO\n\nEl README es la plantilla de Next.js.', 'Respuesta: SIN_INFO', 'Sin información.', 'Sin información suficiente', 'N/A', 'Información insuficiente.']) {
    assert.deepEqual(parseModelSummary(answer), { outcome: 'no-info' }, answer)
  }
})

test('no descarta resumenes que mencionan "sin informacion" o "el README"', async () => {
  const { cleanSummary } = await import('./github-sync.ts')

  const summaries = [
    'LluvIA es un tablero que evita que los barrios queden sin información sobre la lluvia acumulada.',
    'Sistema de gestión sin información personal de los vecinos, que respeta la privacidad.',
    'Herramienta que genera el README de cada repositorio del equipo a partir de su código.',
    'El README describe a LluvIA, un tablero que avisa cuando no se puede circular por lluvia.',
    'El proyecto no tiene costo para los vecinos: permite reservar canchas municipales.',
    'No hay información centralizada sobre las obras, por eso este mapa las reúne en un solo lugar.',
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
    github_filled_at: null,
    github_enriched_at: null,
    github_readme_failed_at: null,
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

test('despues de un fallo espera unas horas antes de reintentar el README', async () => {
  const { readmeCandidates, README_FAILURE_COOLDOWN_MS } = await import('./github-sync.ts')
  const now = Date.parse('2026-10-08T12:00:00Z')
  const project = (id: string, failedMsAgo: number | null) => ({
    id,
    description: null,
    stack: null,
    start_date: null,
    website_url: null,
    github_repo_id: 1,
    github_filled_at: null,
    github_enriched_at: null,
    github_readme_failed_at: failedMsAgo === null ? null : new Date(now - failedMsAgo).toISOString(),
    created_at: null,
  })
  const repos = new Map([[1, { description: null, language: null, homepage: null, created_at: null, pushed_at: null }]])

  const candidates = readmeCandidates([project('nunca', null), project('reciente', 60_000), project('viejo', README_FAILURE_COOLDOWN_MS + 1)], repos, now)
  assert.deepEqual(candidates.map((candidate) => candidate.id).sort(), ['nunca', 'viejo'])
})

test('una valla de codigo con lineas en blanco adentro se saca entera', async () => {
  const { usefulReadme } = await import('./github-sync.ts')

  const readme = '# Turnos\n\n## Instalacion\n\n```bash\nnpm install\n\nnpm run dev\n```\n## Que es\nEste sistema permite a los vecinos sacar turnos para tramites municipales sin hacer fila.'
  const text = usefulReadme(readme)
  assert.ok(text?.includes('sacar turnos'))
  assert.ok(!text?.includes('npm install') && !text?.includes('npm run dev'))

  const js = usefulReadme('# Calculadora\n\n```js\nconst a = 1\n\nconst b = 2\n```\nMas texto propio que explica que la calculadora estima tasas municipales para comercios.')
  assert.ok(js?.includes('estima tasas') && !js.includes('const b'))
})

test('nunca guarda como resumen un JSON crudo o mal formado', async () => {
  const { parseModelSummary } = await import('./github-sync.ts')

  // Lo que sigue al objeto se ignora.
  assert.deepEqual(parseModelSummary('{"describe": false, "resumen": ""} (el README es la plantilla {create-next-app})'), { outcome: 'no-info' })
  assert.deepEqual(parseModelSummary('{"describe": true, "resumen": "LluvIA avisa por lluvia."}\nNota: resumen breve.'), { outcome: 'summary', text: 'LluvIA avisa por lluvia.' })
  // Saltos de linea crudos dentro del texto.
  assert.deepEqual(parseModelSummary('{"describe": true, "resumen": "Sistema de turnos.\nPermite reservar."}'), { outcome: 'summary', text: 'Sistema de turnos. Permite reservar.' })
  // Ilegible o sin "describe": falla, para reintentar mas adelante.
  for (const answer of ['{"describe": true, "resumen": "Sistema de "turnos" para vecinos."}', '{"describe": false, "resumen": "El README es la plantilla."', '{"resumen": "Algo."}', '```json\n{"describe": tru']) {
    assert.deepEqual(parseModelSummary(answer), { outcome: 'failed' }, answer)
  }
})

test('en texto libre descarta las explicaciones de que no hay informacion', async () => {
  const { parseModelSummary } = await import('./github-sync.ts')

  assert.deepEqual(parseModelSummary('El README no explica de qué se trata el proyecto.'), { outcome: 'no-info' })
  assert.deepEqual(parseModelSummary('Este README solo tiene instrucciones de instalación.'), { outcome: 'no-info' })
  assert.deepEqual(parseModelSummary('El README describe a LluvIA, un tablero que avisa cuando no se puede circular.'), {
    outcome: 'summary',
    text: 'El README describe a LluvIA, un tablero que avisa cuando no se puede circular.',
  })
})

test('interpreta respuestas del modelo fuera de lo comun', async () => {
  const { parseModelSummary } = await import('./github-sync.ts')

  // Oraciones como lista.
  assert.deepEqual(parseModelSummary('{"describe": true, "resumen": ["LluvIA es un tablero.", "Avisa por lluvia."]}'), { outcome: 'summary', text: 'LluvIA es un tablero. Avisa por lluvia.' })
  // describe true sin un texto legible: falla, no "sin informacion" definitivo.
  for (const answer of ['{"describe": true, "resumen": {"a": 1}}', '{"describe": true}', '{"describe": "true", "resumen": "X."}']) {
    assert.deepEqual(parseModelSummary(answer), { outcome: 'failed' }, answer)
  }
  // El modelo se contradice: describe true con una explicacion de que no hay informacion.
  for (const resumen of ['El README no explica de qué se trata el proyecto.', 'Este README solo contiene instrucciones técnicas de instalación.', 'No hay información suficiente en el README para describir el proyecto.']) {
    assert.deepEqual(parseModelSummary(JSON.stringify({ describe: true, resumen })), { outcome: 'no-info' }, resumen)
  }
  // Otras comillas o YAML: falla en lugar de guardar el texto crudo.
  for (const answer of ['describe: false\nresumen:', 'Respuesta: {“describe”: true, “resumen”: “LluvIA es un tablero.”}', "Resultado: {'describe': True, 'resumen': 'LluvIA.'}"]) {
    assert.deepEqual(parseModelSummary(answer), { outcome: 'failed' }, answer)
  }
  for (const answer of ['true', 'false']) assert.deepEqual(parseModelSummary(answer), { outcome: 'no-info' }, answer)
  // Un preambulo con llaves no tapa el objeto, y llaves sueltas en texto libre no lo rompen.
  assert.deepEqual(parseModelSummary('<think>analizo el {readme}</think>{"describe": true, "resumen": "LluvIA es un tablero."}'), { outcome: 'summary', text: 'LluvIA es un tablero.' })
  assert.deepEqual(parseModelSummary('LluvIA {} es un tablero para Defensa Civil.'), { outcome: 'summary', text: 'LluvIA {} es un tablero para Defensa Civil.' })
  // Un resumen real que empieza con "No hay informacion..." no se descarta.
  assert.deepEqual(parseModelSummary(JSON.stringify({ describe: true, resumen: 'No hay información centralizada sobre las obras, por eso este mapa las reúne.' })), {
    outcome: 'summary',
    text: 'No hay información centralizada sobre las obras, por eso este mapa las reúne.',
  })
})

test('un "##" suelto no le resta prosa al README', async () => {
  const { usefulReadme } = await import('./github-sync.ts')
  assert.ok(usefulReadme('# T\n\n##\nEste sistema permite a los vecinos sacar turnos para tramites municipales sin hacer fila.'))
})

test('los que ya fallaron van despues en la cola', async () => {
  const { readmeCandidates, README_FAILURE_COOLDOWN_MS } = await import('./github-sync.ts')
  const now = Date.parse('2026-10-08T12:00:00Z')
  const project = (id: string, failed: boolean, created: string) => ({
    id,
    description: null,
    stack: null,
    start_date: null,
    website_url: null,
    github_repo_id: 1,
    github_filled_at: null,
    github_enriched_at: null,
    github_readme_failed_at: failed ? new Date(now - README_FAILURE_COOLDOWN_MS - 1).toISOString() : null,
    created_at: created,
  })
  const repos = new Map([[1, { description: null, language: null, homepage: null, created_at: null, pushed_at: null }]])
  const order = readmeCandidates([project('fallo-nuevo', true, '2026-10-07'), project('sano-viejo', false, '2026-01-01')], repos, now).map((candidate) => candidate.id)
  assert.deepEqual(order, ['sano-viejo', 'fallo-nuevo'])
})

test('la actualizacion a pedido propone todo lo que da GitHub, aunque haya datos cargados', async () => {
  const { refreshProposal } = await import('./github-sync.ts')
  const repo = { description: 'Plataforma del CIMT', language: 'TypeScript', homepage: 'cimt-connect.vercel.app', created_at: '2026-04-27T15:00:00Z', pushed_at: null }

  assert.deepEqual(refreshProposal(repo, { TypeScript: 90, CSS: 10 }, 'Plataforma web del CIMT con un asistente que responde consultas.'), {
    description: 'Plataforma web del CIMT con un asistente que responde consultas.',
    stack: 'TypeScript, CSS',
    website_url: 'https://cimt-connect.vercel.app',
    start_date: '2026-04-27',
  })
  // Sin resumen se propone la descripcion de GitHub; sin nada, null.
  assert.equal(refreshProposal(repo, null, null).description, 'Plataforma del CIMT')
  assert.deepEqual(refreshProposal({ description: null, language: null, homepage: null, created_at: null, pushed_at: null }, null, null), {
    description: null,
    stack: null,
    website_url: null,
    start_date: null,
  })
})

test('un repo renombrado no se da de alta de nuevo: se vincula al proyecto que tenia el nombre viejo', async () => {
  const { planGithubProjectSync, staleRepoKeys } = await import('./github-sync.ts')
  const repos = [repo(1170811544, 'educacivil-HubIA'), repo(7, 'nuevo')]
  const existing = [
    project('hubia', { repository_url: 'https://github.com/DIA-SMT/educacivil' }),
    project('otro', { repository_url: 'https://github.com/DIA-SMT/ya-vinculado', github_repo_id: 99 }),
    project('ajeno', { repository_url: 'https://github.com/OtraCuenta/algo' }),
  ]

  // Solo las URLs de la cuenta que no estan en el listado y sin repo vinculado.
  assert.deepEqual(staleRepoKeys(repos, existing, 'DIA-SMT'), ['dia-smt/educacivil'])

  // Sin resolver el nombre viejo, el repo se duplicaria (el defecto que habia).
  assert.deepEqual(planGithubProjectSync(repos, existing).inserts.map((insert) => insert.name), ['educacivil-HubIA', 'nuevo'])

  const plan = planGithubProjectSync(repos, existing, new Set(), new Map([['dia-smt/educacivil', 1170811544]]))
  assert.deepEqual(plan.inserts.map((insert) => insert.name), ['nuevo'])
  assert.deepEqual(plan.links, [{ projectId: 'hubia', githubRepoId: 1170811544, repositoryUrl: 'https://github.com/DIA-SMT/educacivil-HubIA' }])
})
