// Alta automatica de proyectos a partir de los repos de la organizacion de GitHub.
// La logica de decision es pura (sin Supabase ni fetch) para poder testearla; la usa
// app/api/github/sync-projects/route.ts. El helper del final lo llaman las pantallas.

export type GithubOrgRepo = {
  id: number
  name: string
  description: string | null
  html_url: string
  language: string | null
  archived: boolean
  homepage?: string | null
  created_at?: string | null
  pushed_at?: string | null
}

export type ExistingProjectRepo = {
  id: string
  active: boolean
  repository_url: string | null
  repository_url_secondary: string | null
  github_repo_id: number | null
}

export type GithubProjectInsert = {
  name: string
  description: string | null
  stack: string | null
  repository_url: string
  website_url: string | null
  start_date: string | null
  github_repo_id: number
  status: 'En desarrollo'
  priority: 'Media'
  progress: 0
}

export type GithubSyncPlan = {
  inserts: GithubProjectInsert[]
  // Proyectos cargados a mano que coinciden por URL: se les guarda el id del repo para
  // seguirlos aunque el repo cambie de nombre.
  links: Array<{ projectId: string; githubRepoId: number }>
}

// Normaliza a "owner/repo" en minusculas; GitHub no distingue mayusculas en los nombres.
export function githubRepoKey(url: string | null | undefined) {
  if (!url) return null

  try {
    const parsed = new URL(url.trim())
    if (!parsed.hostname.toLowerCase().endsWith('github.com')) return null

    const [owner, rawRepo] = parsed.pathname.replace(/^\/+/, '').split('/')
    if (!owner || !rawRepo) return null

    return `${owner}/${rawRepo.replace(/\.git$/i, '')}`.toLowerCase()
  } catch {
    return null
  }
}

export function parseIgnoredRepos(value: string | null | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function planGithubProjectSync(repos: GithubOrgRepo[], existing: ExistingProjectRepo[], ignored: Set<string> = new Set()): GithubSyncPlan {
  // Se cuentan tambien los proyectos dados de baja (active = false): borrar un proyecto
  // creado por la sincronizacion es la forma de decirle que ese repo no va.
  const knownRepoIds = new Set(existing.map((project) => project.github_repo_id).filter((id): id is number => id !== null))
  const projectByPrimaryKey = new Map<string, ExistingProjectRepo>()
  const knownKeys = new Set<string>()

  for (const project of existing) {
    const primary = githubRepoKey(project.repository_url)
    const secondary = githubRepoKey(project.repository_url_secondary)
    if (primary) {
      knownKeys.add(primary)
      if (!projectByPrimaryKey.has(primary)) projectByPrimaryKey.set(primary, project)
    }
    if (secondary) knownKeys.add(secondary)
  }

  const plan: GithubSyncPlan = { inserts: [], links: [] }
  const linkedProjectIds = new Set<string>()

  for (const repo of repos) {
    if (repo.archived || repo.name.startsWith('.') || ignored.has(repo.name.toLowerCase())) continue
    if (knownRepoIds.has(repo.id)) continue

    const key = githubRepoKey(repo.html_url)
    if (!key) continue

    if (knownKeys.has(key)) {
      const project = projectByPrimaryKey.get(key)
      if (project && project.github_repo_id === null && !linkedProjectIds.has(project.id)) {
        plan.links.push({ projectId: project.id, githubRepoId: repo.id })
        linkedProjectIds.add(project.id)
      }
      continue
    }

    plan.inserts.push({
      name: repo.name,
      description: repo.description?.trim() || null,
      stack: repo.language,
      repository_url: repo.html_url,
      website_url: cleanHomepage(repo.homepage),
      start_date: repoStartDate(repo.created_at),
      github_repo_id: repo.id,
      status: 'En desarrollo',
      priority: 'Media',
      progress: 0,
    })
    knownKeys.add(key)
  }

  return plan
}

// ── Datos que aporta GitHub ──────────────────────────────────────────────────────────
// Se completan en dos pasos. Lo que ya viene en el listado de repos (inicio, sitio, lenguaje
// y descripcion corta) se llena en cada sincronizacion sin consultas extra. El analisis del
// README (resumen con IA y los tres lenguajes principales) es aparte, de a pocos proyectos.

export type ProjectGithubFields = {
  id: string
  description: string | null
  stack: string | null
  start_date: string | null
  website_url: string | null
  github_repo_id: number
  github_enriched_at: string | null
  created_at: string | null
}

type RepoFields = Pick<GithubOrgRepo, 'description' | 'language' | 'homepage' | 'created_at' | 'pushed_at'>

export function cleanHomepage(homepage: string | null | undefined) {
  const trimmed = homepage?.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// La fecha de creacion del repo se toma como inicio del proyecto (YYYY-MM-DD).
export function repoStartDate(createdAt: string | null | undefined) {
  return createdAt && /^\d{4}-\d{2}-\d{2}/.test(createdAt) ? createdAt.slice(0, 10) : null
}

// Los tres lenguajes con mas codigo, en el orden que informa GitHub por bytes.
export function stackFromLanguages(languages: Record<string, number> | null, fallback: string | null) {
  const top = Object.entries(languages ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([language]) => language)
  return top.length > 0 ? top.join(', ') : fallback
}

// Lo que se completa con el listado. Solo campos en null: lo cargado a mano no se toca.
export function listingPatch(project: Pick<ProjectGithubFields, 'description' | 'stack' | 'start_date' | 'website_url'>, repo: RepoFields) {
  const patch: Partial<Pick<ProjectGithubFields, 'description' | 'stack' | 'start_date' | 'website_url'>> = {}
  const description = repo.description?.trim()
  const startDate = repoStartDate(repo.created_at)
  const website = cleanHomepage(repo.homepage)

  if (project.description === null && description) patch.description = description
  if (project.stack === null && repo.language) patch.stack = repo.language
  if (project.start_date === null && startDate) patch.start_date = startDate
  if (project.website_url === null && website) patch.website_url = website
  return patch
}

// La descripcion vacia o igual a la de GitHub (la que se carga sola) se puede mejorar con el
// resumen del README. Una escrita a mano no.
export function wantsReadmeSummary(project: Pick<ProjectGithubFields, 'description'>, repo: Pick<GithubOrgRepo, 'description'>) {
  const current = project.description?.trim() || null
  return !current || current === (repo.description?.trim() || null)
}

const REANALYSIS_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Proyectos a los que conviene analizarles el README: los que necesitan resumen y nunca se
// analizaron, o que recibieron cambios despues del ultimo analisis (un repo recien creado
// suele estar vacio). Como mucho un reanalisis por dia. Primero los nunca analizados y,
// entre ellos, los mas nuevos.
export function readmeCandidates<T extends ProjectGithubFields>(projects: T[], repoById: Map<number, RepoFields>) {
  return projects
    .filter((project) => {
      const repo = repoById.get(project.github_repo_id)
      if (!repo || !wantsReadmeSummary(project, repo)) return false
      if (!project.github_enriched_at) return true

      const analyzedAt = Date.parse(project.github_enriched_at)
      const pushedAt = Date.parse(repo.pushed_at ?? '')
      if (Number.isNaN(analyzedAt) || Number.isNaN(pushedAt)) return false
      return pushedAt > analyzedAt && Date.now() - analyzedAt >= REANALYSIS_COOLDOWN_MS
    })
    .sort(
      (a, b) =>
        Number(Boolean(a.github_enriched_at)) - Number(Boolean(b.github_enriched_at)) ||
        (b.created_at ?? '').localeCompare(a.created_at ?? ''),
    )
}

// Lo que deja el analisis del README: el resumen (si la descripcion se puede mejorar) y los
// tres lenguajes principales en lugar del lenguaje unico que vino del listado.
export function readmePatch(project: Pick<ProjectGithubFields, 'description' | 'stack'>, repo: RepoFields, languages: Record<string, number> | null, summary: string | null) {
  const patch: Partial<Pick<ProjectGithubFields, 'description' | 'stack'>> = {}
  if (summary && wantsReadmeSummary(project, repo) && summary !== project.description) patch.description = summary
  if (project.stack === null || project.stack === repo.language) {
    const stack = stackFromLanguages(languages, null)
    if (stack && stack !== project.stack) patch.stack = stack
  }
  return patch
}

// Cupo de GitHub agotado: 429, o 403 con el cupo en cero, pidiendo esperar o avisando en el
// cuerpo de un limite secundario. Un 403 sin nada de eso es falta de permiso y es definitivo.
export function isRateLimited(status: number, header: (name: string) => string | null, body = '') {
  if (status === 429) return true
  if (status !== 403) return false
  return header('x-ratelimit-remaining') === '0' || header('retry-after') !== null || /rate limit/i.test(body)
}

const README_MAX_CHARS = 12000
const README_MIN_CHARS = 60

// Huellas de los README que generan create-next-app, create-react-app, Vite y Lovable.
const TEMPLATE_FINGERPRINT = [
  /bootstrapped with \W*create[- ]next[- ]app/i,
  /bootstrapped with \W*create react app/i,
  /this template provides a minimal setup to get react working in vite/i,
  /welcome to your lovable project/i,
  /lovable\.dev\/projects/i,
]
// Frases de esas plantillas que se descartan aunque esten bajo un titulo propio.
const TEMPLATE_STOCK = [...TEMPLATE_FINGERPRINT, /two official plugins are available/i, /@vitejs\/plugin-react/i]
// Titulos de seccion de esas plantillas.
const TEMPLATE_HEADING =
  /^(getting started( with create react app)?|learn more|deploy on vercel|available scripts|expanding the eslint configuration|react compiler|react \+ (typescript \+ )?vite|welcome to your lovable project|project info|how can i edit this code\??|what technologies are used for this project\??|how can i deploy this project\??|(can i connect|i want to use) a custom domain.*|code splitting|analyzing the bundle size|making a progressive web app|advanced configuration|deployment|`?npm (start|test|run build|run eject)`?( fails to minify)?)$/i
// Dentro de una seccion de plantilla, un parrafo que habla de estas herramientas es de la
// plantilla (y las tecnologias tampoco van en el resumen).
const TEMPLATE_TOPIC =
  /next\.?js|vercel|create[- ]react[- ]app|create-next-app|\bvite\b|vitejs|lovable|\bnpm\b|\byarn\b|\bpnpm\b|\bbun\b|localhost|eslint|\blint\b|\bhmr\b|babel|\bswc\b|typescript|tailwind|shadcn|\beject\b|webpack|fast refresh|codespaces?\b|\bide\b|development server|you can run|\breact\b|\bdeploy|github|node\.js|\bnvm\b|git clone|\bdomains?\b|`[^`]+`/i
// En una seccion de plantilla solo sobrevive prosa propia de cierto largo: los "Follow
// these steps:" y las listas de pasos son de la plantilla.
const TEMPLATE_SECTION_MIN_OWN = 80

type ReadmeUnit = { heading: { level: number; text: string } | null; text: string; isList: boolean }

function readmeUnits(markdown: string) {
  const units: ReadmeUnit[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length === 0) return
    units.push({ heading: null, text: paragraph.join('\n'), isList: paragraph.every((line) => /^\s*([-*+]|\d+[.)])\s/.test(line)) })
    paragraph = []
  }

  for (const line of markdown.split('\n')) {
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      units.push({ heading: { level: heading[1].length, text: heading[2].replace(/[*_]/g, '').trim() }, text: line.trim(), isList: false })
    } else if (!line.trim()) {
      flush()
    } else {
      paragraph.push(line.trimEnd())
    }
  }
  flush()
  return units
}

// Devuelve el README listo para mandar al modelo, sin comentarios, imagenes ni bloques de
// codigo. Si viene de una plantilla, ademas sin lo que trae la plantilla, conservando lo
// propio. null si lo que queda no alcanza para entender el proyecto.
export function usefulReadme(readme: string | null | undefined) {
  if (!readme) return null
  const markdown = readme
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Solo vallas de codigo al inicio de linea, cerradas con la misma secuencia.
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[`~]*[^\S\n]*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')

  const fromTemplate = TEMPLATE_FINGERPRINT.some((pattern) => pattern.test(markdown))
  const kept: string[] = []
  // Nivel de la seccion de plantilla en curso; sus subtitulos siguen siendo de la plantilla.
  // Un titulo principal (#) de plantilla no se lleva los subtitulos propios que le siguen.
  let templateLevel: number | null = null

  for (const unit of readmeUnits(markdown)) {
    if (unit.heading) {
      if (fromTemplate && TEMPLATE_HEADING.test(unit.heading.text)) {
        templateLevel = unit.heading.level
        continue
      }
      if (templateLevel !== null && templateLevel > 1 && unit.heading.level > templateLevel) continue
      templateLevel = null
      kept.push(unit.text)
      continue
    }

    if (fromTemplate && TEMPLATE_STOCK.some((pattern) => pattern.test(unit.text))) continue
    if (templateLevel !== null && (unit.isList || unit.text.length < TEMPLATE_SECTION_MIN_OWN || TEMPLATE_TOPIC.test(unit.text))) continue
    kept.push(unit.text)
  }

  const text = kept.join('\n\n').replace(/[ \t]+/g, ' ').trim()
  // Lo que cuenta es la prosa: los titulos solos no describen nada.
  const prose = kept.filter((part) => !/^#{1,6}\s/.test(part)).join(' ').replace(/\s+/g, ' ').trim()
  if (prose.length < README_MIN_CHARS) return null
  return text.slice(0, README_MAX_CHARS)
}

export const NO_SUMMARY = 'SIN_INFO'
// La respuesta es solo el centinela, con cualquier separador o markdown alrededor.
const SENTINEL = [/^\W*sin[\s\\_-]*info\W*$/i, /^\W*sin informaci[oó]n\W*$/i, /^\W*(n\/a|ninguno|ninguna)\W*$/i]
// Explicaciones del modelo en lugar de un resumen. Van ancladas al principio (o son frases
// inequivocas) para no descartar un resumen que menciona "sin informacion" o "el README".
const META_ANSWER = [
  /^(el|este|del)?\s*(archivo\s+)?readme\b.*\b(no|s[oó]lo|solamente|[uú]nicamente)\b/i,
  /^(no hay|no se (encontr|dispone)\w*|falta)\s+(suficiente\s+)?informaci[oó]n/i,
  /^informaci[oó]n insuficiente/i,
  /^(el|este) (repositorio|proyecto) (no|s[oó]lo|solamente|[uú]nicamente) (incluye|contiene|trae|tiene|describe|explica)/i,
  /^la documentaci[oó]n (disponible )?no\b/i,
  /\bno (describe|explica|detalla|aclara) (de qu[eé] se trata|el prop[oó]sito|el objetivo|qu[eé] hace)/i,
]
const QUOTE_PAIRS: Array<[string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['«', '»'],
  ["'", "'"],
]

// Saca las comillas solo si envuelven todo el texto, no si abren una cita al principio.
function unwrapQuotes(text: string) {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length < 3 || !text.startsWith(open) || !text.endsWith(close)) continue
    if (open !== close) {
      let depth = 0
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === open) depth += 1
        else if (text[index] === close) {
          depth -= 1
          if (depth === 0 && index < text.length - 1) return text
        }
      }
      return text.slice(1, -1).trim()
    }
    // Comillas rectas: envuelven si son las unicas o si la segunda abre otra cita.
    const positions = Array.from(text).flatMap((char, index) => (char === open ? [index] : []))
    if (positions.length === 2 || /\s/.test(text[positions[1] - 1] ?? '')) return text.slice(1, -1).trim()
    return text
  }
  return text
}

// Limpia la respuesta del modelo: sin prefijos, sin markdown y con un tope de largo. null si
// no es un resumen (el centinela o una explicacion de que el README no alcanza).
export function cleanSummary(text: string | null | undefined) {
  if (!text) return null
  let cleaned = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(#{1,6}|>|[-*•])\s+/gm, '')
    .replace(/(^|[\s(¿¡"“«'])[*_]([^*_\n]+?)[*_](?=[\s.,;:!?)"”»']|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
  const withoutPrefix = cleaned.replace(/^(resumen|descripci[oó]n)\s*:\s*/i, '').replace(/^seg[uú]n (el|este) readme,?\s*/i, '').trim()
  // Si se saco un prefijo, la oracion que queda empieza en mayuscula.
  if (withoutPrefix !== cleaned) cleaned = withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1)
  cleaned = unwrapQuotes(cleaned)

  if (!cleaned || SENTINEL.some((pattern) => pattern.test(cleaned)) || META_ANSWER.some((pattern) => pattern.test(cleaned))) return null
  if (cleaned.length <= 700) return cleaned
  // Se corta en el ultimo punto; si no hay uno razonable, en la ultima palabra.
  const cut = cleaned.slice(0, 700)
  const lastStop = cut.lastIndexOf('. ')
  if (lastStop > 300) return cut.slice(0, lastStop + 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

const SYNC_THROTTLE_KEY = 'github-projects-sync-at'
const SYNC_THROTTLE_MS = 5 * 60 * 1000
// El analisis de README corre en el servidor despues de responder; se le da este margen
// antes de volver a cargar para mostrar los resumenes.
const README_ANALYSIS_WAIT_MS = 45 * 1000

// Pide al servidor que traiga los repos nuevos y complete los datos que da GitHub, y llama a
// onChange cuando conviene recargar: enseguida si se crearon o completaron proyectos, y otra
// vez al rato si quedo un analisis de README en curso. Devuelve una funcion para cancelar.
// Como mucho una vez cada 5 minutos por pestania; el cron diario cubre los dias sin visitas.
export function watchGithubProjectSync(onChange: () => void) {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null

  try {
    const last = Number(window.sessionStorage.getItem(SYNC_THROTTLE_KEY) ?? 0)
    if (Date.now() - last < SYNC_THROTTLE_MS) return () => {}
    window.sessionStorage.setItem(SYNC_THROTTLE_KEY, String(Date.now()))
  } catch {
    // Sin sessionStorage se sincroniza igual.
  }

  void fetch('/api/github/sync-projects', { method: 'POST' })
    .then((response) => (response.ok ? (response.json() as Promise<Record<string, unknown>>) : null))
    .then((payload) => {
      if (cancelled || !payload) return
      const count = (value: unknown) => (typeof value === 'number' ? value : 0)
      if (count(payload.created) + count(payload.filled) > 0) onChange()
      if (count(payload.readmeAnalysis) > 0) {
        timer = setTimeout(() => {
          if (!cancelled) onChange()
        }, README_ANALYSIS_WAIT_MS)
      }
    })
    .catch(() => {})

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
