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
  // seguirlos aunque el repo cambie de nombre. repositoryUrl viene cuando el proyecto apuntaba
  // al nombre viejo de un repo renombrado: se actualiza al nombre actual.
  links: Array<{ projectId: string; githubRepoId: number; repositoryUrl?: string }>
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

// URLs de proyectos sin repo vinculado que no aparecen en el listado de la cuenta: suelen ser
// repos renombrados (el proyecto quedo con el nombre viejo). Hay que preguntarle a GitHub por
// ellas, que redirige al nombre nuevo, antes de dar de alta nada.
export function staleRepoKeys(repos: GithubOrgRepo[], existing: ExistingProjectRepo[], owner: string) {
  const listed = new Set(repos.map((repo) => githubRepoKey(repo.html_url)).filter(Boolean))
  const prefix = `${owner.toLowerCase()}/`
  const keys = new Set<string>()
  for (const project of existing) {
    if (project.github_repo_id !== null) continue
    for (const key of [githubRepoKey(project.repository_url), githubRepoKey(project.repository_url_secondary)]) {
      if (key && key.startsWith(prefix) && !listed.has(key)) keys.add(key)
    }
  }
  return [...keys]
}

// aliases: nombre viejo ("owner/repo" en minusculas) -> id del repo renombrado, resuelto con
// staleRepoKeys y GitHub. Un repo renombrado se reconoce como ya cargado en vez de duplicarse.
export function planGithubProjectSync(repos: GithubOrgRepo[], existing: ExistingProjectRepo[], ignored: Set<string> = new Set(), aliases: Map<string, number> = new Map()): GithubSyncPlan {
  // Se cuentan tambien los proyectos dados de baja (active = false): borrar un proyecto
  // creado por la sincronizacion es la forma de decirle que ese repo no va.
  const knownRepoIds = new Set(existing.map((project) => project.github_repo_id).filter((id): id is number => id !== null))
  const projectByPrimaryKey = new Map<string, ExistingProjectRepo>()
  const projectByRenamedRepo = new Map<number, ExistingProjectRepo>()
  const knownKeys = new Set<string>()

  for (const project of existing) {
    const primary = githubRepoKey(project.repository_url)
    const secondary = githubRepoKey(project.repository_url_secondary)
    if (primary) {
      knownKeys.add(primary)
      if (!projectByPrimaryKey.has(primary)) projectByPrimaryKey.set(primary, project)
      const renamed = aliases.get(primary)
      if (renamed !== undefined) {
        knownRepoIds.add(renamed)
        if (!projectByRenamedRepo.has(renamed)) projectByRenamedRepo.set(renamed, project)
      }
    }
    if (secondary) {
      knownKeys.add(secondary)
      const renamed = aliases.get(secondary)
      if (renamed !== undefined) knownRepoIds.add(renamed)
    }
  }

  const plan: GithubSyncPlan = { inserts: [], links: [] }
  const linkedProjectIds = new Set<string>()

  for (const repo of repos) {
    if (repo.archived || repo.name.startsWith('.') || ignored.has(repo.name.toLowerCase())) continue
    // Proyecto que apuntaba al nombre viejo: se vincula y se pasa al nombre actual.
    const renamedProject = projectByRenamedRepo.get(repo.id)
    if (renamedProject && renamedProject.github_repo_id === null && !linkedProjectIds.has(renamedProject.id)) {
      plan.links.push({ projectId: renamedProject.id, githubRepoId: repo.id, repositoryUrl: repo.html_url })
      linkedProjectIds.add(renamedProject.id)
    }
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
// y descripcion corta) se llena una sola vez por proyecto, sin consultas extra. El analisis
// del README (resumen con IA y los tres lenguajes principales) es aparte, de a pocos.

export type ProjectGithubFields = {
  id: string
  description: string | null
  stack: string | null
  start_date: string | null
  website_url: string | null
  github_repo_id: number
  github_filled_at: string | null
  github_enriched_at: string | null
  github_readme_failed_at: string | null
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
export const README_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000

function olderThan(iso: string | null, ms: number, now: number) {
  if (!iso) return true
  const time = Date.parse(iso)
  return Number.isNaN(time) || now - time >= ms
}

// Proyectos a los que conviene analizarles el README: los que necesitan resumen y nunca se
// analizaron, o que recibieron cambios despues del ultimo analisis (un repo recien creado
// suele estar vacio), como mucho una vez por dia. Si el ultimo intento fallo, se espera unas
// horas para no trabar la cola. Primero los nunca analizados, despues los que no fallaron y,
// a igualdad, los mas nuevos.
export function readmeCandidates<T extends ProjectGithubFields>(projects: T[], repoById: Map<number, RepoFields>, now = Date.now()) {
  return projects
    .filter((project) => {
      const repo = repoById.get(project.github_repo_id)
      if (!repo || !wantsReadmeSummary(project, repo)) return false
      if (!olderThan(project.github_readme_failed_at, README_FAILURE_COOLDOWN_MS, now)) return false
      if (!project.github_enriched_at) return true

      const analyzedAt = Date.parse(project.github_enriched_at)
      const pushedAt = Date.parse(repo.pushed_at ?? '')
      if (Number.isNaN(analyzedAt) || Number.isNaN(pushedAt)) return false
      return pushedAt > analyzedAt && now - analyzedAt >= REANALYSIS_COOLDOWN_MS
    })
    .sort(
      (a, b) =>
        Number(Boolean(a.github_enriched_at)) - Number(Boolean(b.github_enriched_at)) ||
        // Los que ya fallaron, despues: si fallan siempre no le ganan el lugar a los demas.
        Number(Boolean(a.github_readme_failed_at)) - Number(Boolean(b.github_readme_failed_at)) ||
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

export type RefreshFields = Pick<ProjectGithubFields, 'description' | 'stack' | 'website_url' | 'start_date'>

// Lo que propone GitHub para un proyecto cuando alguien pide actualizarlo a mano: a diferencia
// del completado automatico, propone aunque el campo ya tenga algo (la persona elige que
// aplicar). null en un campo es "nada para proponer".
export function refreshProposal(repo: RepoFields, languages: Record<string, number> | null, summary: string | null): RefreshFields {
  return {
    description: summary ?? (repo.description?.trim() || null),
    stack: stackFromLanguages(languages, repo.language ?? null),
    website_url: cleanHomepage(repo.homepage),
    start_date: repoStartDate(repo.created_at),
  }
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

// Devuelve el README listo para mandar al modelo: sin comentarios, imagenes ni bloques de
// codigo. Si es solo una plantilla (create-next-app, Vite, Lovable) lo decide el modelo, que
// distingue mejor que cualquier regla lo propio de lo generico. null si no queda texto.
export function usefulReadme(readme: string | null | undefined) {
  if (!readme) return null
  const text = readme
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Vallas de codigo al inicio de linea, cerradas con la misma secuencia. Las de comillas
    // invertidas no llevan comillas invertidas en la info: asi "```usa esto```" no es valla.
    // Un solo grupo: en JavaScript una referencia a un grupo que no participo coincide con
    // vacio, y la valla se cerraria en la primera linea en blanco.
    .replace(/^ {0,3}(`{3,}(?=[^`\n]*$)|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[`~]*[^\S\n]*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n(\s*\n)+/g, '\n\n')
    .trim()

  // Lo que cuenta es la prosa: los titulos solos no describen nada.
  // [ \t] y no \s: un "##" suelto no tiene que llevarse la linea siguiente.
  const prose = text.replace(/^ {0,3}#{1,6}(?:[ \t].*)?$/gm, '').replace(/\s+/g, ' ').trim()
  if (prose.length < README_MIN_CHARS) return null
  return text.slice(0, README_MAX_CHARS)
}

const SUMMARY_MAX_CHARS = 700
// El centinela del pedido en texto libre, con cualquier separador. Con guion bajo no aparece
// en un resumen real; tampoco "sin info" suelto.
const NO_SUMMARY_TOKEN = /\bsin[\s\\_-]*info\b/i
// Respuestas que, enteras, dicen que no hay resumen.
const NO_SUMMARY_ANSWER = /^\W*(sin informaci[oó]n( suficiente)?|informaci[oó]n insuficiente|n\/a|ninguno|ninguna|true|false)\W*$/i
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

// Limpia el resumen: sin markdown, prefijos ni comillas envolventes, con un tope de largo.
export function cleanSummary(text: string | null | undefined) {
  if (!text || NO_SUMMARY_TOKEN.test(text)) return null
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

  if (!cleaned || NO_SUMMARY_ANSWER.test(cleaned)) return null
  if (cleaned.length <= SUMMARY_MAX_CHARS) return cleaned
  // Se corta en el ultimo punto; si no hay uno razonable, en la ultima palabra.
  const cut = cleaned.slice(0, SUMMARY_MAX_CHARS)
  const lastStop = cut.lastIndexOf('. ')
  if (lastStop > 300) return cut.slice(0, lastStop + 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

// Explicaciones del modelo en lugar de un resumen. Solo frases inequivocas, para no descartar
// un resumen real; se aplican tanto al JSON (si el modelo se contradice) como al texto libre.
const META_ANSWER = [
  /^(el|este)\s+(archivo\s+)?readme\s+(no|s[oó]lo|solamente|[uú]nicamente)\b/i,
  /\bno (describe|explica|detalla|aclara) (de qu[eé] se trata|el prop[oó]sito|el objetivo|qu[eé] hace)/i,
  /^no hay (suficiente )?informaci[oó]n (suficiente )?(en el readme|para (describir|resumir|explicar))/i,
]
// Una respuesta con las claves del formato pedido, aunque venga con otras comillas o como
// YAML: si no se puede leer, es una falla y no un resumen.
const LOOKS_STRUCTURED = /^\s*(```(json)?\s*)?\{|["'“”]?\bdescribe\b["'“”]?\s*:|["'“”]\bresumen\b["'“”]\s*:/i

// Objeto JSON que empieza en start, cortado donde se cierra la llave que lo abre. Los saltos
// de linea crudos dentro de un texto se escapan: algunos modelos los mandan asi y JSON.parse
// los rechaza.
function jsonObjectAt(content: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false
  let json = ''
  for (const char of content.slice(start)) {
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      json += char === '\n' ? '\\n' : char === '\r' ? '' : char
      continue
    }
    json += char
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return json
    }
  }
  return null
}

// El primer objeto del texto que se puede leer y trae "describe" (un preambulo con llaves,
// como el razonamiento de algunos modelos, no lo tapa).
function findSummaryObject(content: string) {
  for (let start = content.indexOf('{'); start !== -1; start = content.indexOf('{', start + 1)) {
    const json = jsonObjectAt(content, start)
    if (!json) continue
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>
      if (parsed && typeof parsed === 'object' && 'describe' in parsed) return parsed
    } catch {
      // Se prueba con la llave siguiente.
    }
  }
  return null
}

export type ModelSummary = { outcome: 'summary'; text: string } | { outcome: 'no-info' } | { outcome: 'failed' }

function summaryOrNoInfo(text: string | null): ModelSummary {
  const summary = text ? cleanSummary(text) : null
  if (!summary || META_ANSWER.some((pattern) => pattern.test(summary))) return { outcome: 'no-info' }
  return { outcome: 'summary', text: summary }
}

// Interpreta la respuesta del modelo, que se pide como JSON {"describe": bool, "resumen":
// string}: asi "no hay informacion" es un campo y no una frase que haya que adivinar. Si
// parece estructurada pero no se puede leer, es una falla (se reintenta mas adelante): nunca
// se guarda el JSON crudo como descripcion. Si el modelo responde texto libre, se toma como
// resumen salvo que traiga el centinela o sea una explicacion de que no hay informacion.
export function parseModelSummary(content: string): ModelSummary {
  const parsed = findSummaryObject(content)
  if (parsed) {
    if (parsed.describe === false) return { outcome: 'no-info' }
    if (parsed.describe !== true) return { outcome: 'failed' }
    // Algunos modelos mandan las oraciones como lista.
    const resumen = Array.isArray(parsed.resumen) && parsed.resumen.every((part) => typeof part === 'string') ? parsed.resumen.join(' ') : parsed.resumen
    if (typeof resumen !== 'string') return { outcome: 'failed' }
    return summaryOrNoInfo(resumen)
  }
  if (LOOKS_STRUCTURED.test(content)) return { outcome: 'failed' }
  return summaryOrNoInfo(content)
}

// Marcas en sessionStorage, compartidas por las pantallas de la pestania: cuando empezo y
// cuando respondio la ultima sincronizacion, si trajo cambios y cuando conviene recargar
// para ver los resumenes del analisis de README.
const SYNC_AT_KEY = 'github-projects-sync-at'
const DONE_AT_KEY = 'github-projects-sync-done-at'
const CHANGED_AT_KEY = 'github-projects-changed-at'
const RELOAD_AT_KEY = 'github-projects-reload-at'
const SYNC_THROTTLE_MS = 5 * 60 * 1000
// El analisis de README corre en el servidor despues de responder, con un tope de ~52 s desde
// que llego el pedido; se le da este margen antes de volver a cargar.
const README_ANALYSIS_WAIT_MS = 55 * 1000
// Cada cuanto mira otra pantalla si ya respondio la sincronizacion en curso, y hasta cuando.
const IN_FLIGHT_POLL_MS = 2000
const IN_FLIGHT_MAX_MS = 60 * 1000

function readTime(key: string) {
  try {
    return Number(window.sessionStorage.getItem(key) ?? 0) || 0
  } catch {
    return 0
  }
}

function writeTime(key: string, value: number) {
  try {
    window.sessionStorage.setItem(key, String(value))
  } catch {
    // Sin sessionStorage se sigue igual.
  }
}

// Pide al servidor que traiga los repos nuevos y complete los datos que da GitHub, y llama a
// onChange cuando conviene recargar: enseguida si se crearon o completaron proyectos, y otra
// vez cuando termina el analisis de README en curso. Si al montar hay una sincronizacion de
// otra pantalla todavia sin responder, la espera y recarga igual. Devuelve una funcion para
// cancelar. Como mucho una sincronizacion cada 5 minutos por pestania.
export function watchGithubProjectSync(onChange: () => void) {
  let cancelled = false
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const later = (wait: number, task: () => void) => timers.push(setTimeout(() => !cancelled && task(), Math.max(0, wait)))
  const scheduleReload = () => {
    const reloadAt = readTime(RELOAD_AT_KEY)
    if (reloadAt > Date.now()) later(reloadAt - Date.now(), onChange)
  }

  const syncAt = readTime(SYNC_AT_KEY)
  scheduleReload()

  // Una sincronizacion de otra pantalla que todavia no respondio: esta pantalla ya cargo sus
  // datos, asi que cuando responda tiene que recargar si hubo cambios o si quedo un analisis.
  const inFlight = syncAt > readTime(DONE_AT_KEY) && Date.now() - syncAt < IN_FLIGHT_MAX_MS
  if (inFlight) {
    const waitForResponse = () => {
      if (readTime(DONE_AT_KEY) >= syncAt) {
        if (readTime(CHANGED_AT_KEY) >= syncAt) onChange()
        scheduleReload()
      } else if (Date.now() - syncAt < IN_FLIGHT_MAX_MS) {
        later(IN_FLIGHT_POLL_MS, waitForResponse)
      }
    }
    later(IN_FLIGHT_POLL_MS, waitForResponse)
  }

  if (Date.now() - syncAt >= SYNC_THROTTLE_MS) {
    const startedAt = Date.now()
    writeTime(SYNC_AT_KEY, startedAt)
    void fetch('/api/github/sync-projects', { method: 'POST' })
      .then((response) => (response.ok ? (response.json() as Promise<Record<string, unknown>>) : null))
      .catch(() => null)
      .then((payload) => {
        const count = (value: unknown) => (typeof value === 'number' ? value : 0)
        const changed = Boolean(payload) && count(payload?.created) + count(payload?.filled) > 0
        if (count(payload?.readmeAnalysis) > 0) writeTime(RELOAD_AT_KEY, Date.now() + README_ANALYSIS_WAIT_MS)
        if (changed) writeTime(CHANGED_AT_KEY, startedAt)
        writeTime(DONE_AT_KEY, Date.now())
        if (cancelled) return
        scheduleReload()
        if (changed) onChange()
      })
  }

  return () => {
    cancelled = true
    timers.forEach((timer) => clearTimeout(timer))
  }
}
