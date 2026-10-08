import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ProjectCommitRequest = {
  projects?: Array<{
    id: string
    repositoryUrl?: string | null
    repositoryUrlSecondary?: string | null
  }>
  days?: number | null
  allTime?: boolean
  limitPerRepo?: number
}

type GithubCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: {
      name: string | null
      date: string | null
    } | null
    committer?: {
      name: string | null
      date: string | null
    } | null
  }
  author?: {
    login?: string
    avatar_url?: string
  } | null
}

// Lo unico que se usa de cada commit: GitHub ademas manda files, parents, verification, etc.
type CommitSummary = {
  sha: string
  url: string
  message: string
  authorName: string | null
  authorLogin: string | null
  authorAvatarUrl: string | null
  authorDate: string | null
  committerDate: string | null
}

// day: dia (UTC) en que se uso una URL con since, que al dia siguiente ya no se vuelve a pedir.
// expiresAt: solo en repos vacios (409) o inaccesibles (404), que se responden sin consultar.
type CommitPageCacheEntry = {
  etag: string | null
  commits: CommitSummary[]
  day: string | null
  expiresAt: number | null
}

type ProjectCommitActivity = {
  sha: string
  message: string
  author: string
  authorLogin: string | null
  authorAvatarUrl: string | null
  date: string | null
  url: string
  repo: string
  repoLabel: string
}

type CachedCommitRow = {
  project_id: string
  sha: string
  message: string
  author: string
  author_login: string | null
  author_avatar_url: string | null
  committed_at: string | null
  commit_url: string
  repository: string
  repository_label: string
}

function parseGithubRepo(url: string | null | undefined) {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('github.com')) return null

    const [owner, rawRepo] = parsed.pathname.replace(/^\/+/, '').split('/')
    if (!owner || !rawRepo) return null

    return {
      owner,
      repo: rawRepo.replace(/\.git$/, ''),
    }
  } catch {
    return null
  }
}

// GitHub no limita el largo del primer renglon: se recorta para que el cache no crezca con el.
const COMMIT_LINE_MAX = 200
// El tablero manda ~70 proyectos; el tope evita que un pedido arme cientos de consultas.
const MAX_PROJECTS = 200

function firstCommitLine(message: string) {
  const line = message.split('\n')[0]?.trim() || 'Commit sin descripcion'
  // Por caracteres completos: cortar por unidades UTF-16 puede partir un emoji y dejar un
  // texto invalido que hace fallar el guardado de todos los commits en la base.
  const chars = Array.from(line)
  return chars.length > COMMIT_LINE_MAX ? `${chars.slice(0, COMMIT_LINE_MAX - 1).join('')}…` : line
}

// En V8, split/trim/slice pueden devolver vistas (SlicedString) que mantienen vivo el texto
// original: el primer renglon guardado en el cache retendria el mensaje entero del commit.
// La ida y vuelta por JSON hace una copia propia sin perder caracteres, a diferencia de Buffer.
function ownString<T extends string | null>(value: T): T {
  return typeof value === 'string' ? (JSON.parse(JSON.stringify(value)) as T) : value
}

// Todo lo que sale de aca puede quedar en el cache, por eso cada string es una copia propia
function toCommitSummary(commit: GithubCommit): CommitSummary {
  return {
    sha: ownString(commit.sha),
    url: ownString(commit.html_url),
    message: ownString(firstCommitLine(commit.commit.message)),
    authorName: ownString(commit.commit.author?.name ?? null),
    authorLogin: ownString(commit.author?.login ?? null),
    authorAvatarUrl: ownString(commit.author?.avatar_url ?? null),
    authorDate: ownString(commit.commit.author?.date ?? null),
    committerDate: ownString(commit.commit.committer?.date ?? null),
  }
}

// Respuestas de GitHub por URL con su ETag. Al repetir la consulta con If-None-Match, GitHub
// contesta 304 si no hubo cambios y esa respuesta no descuenta del cupo de 5000 por hora.
// Sin esto, el tablero (que consulta todos los repos cada minuto) agota el cupo de la cuenta.
// 403/429 (cupo agotado) y 5xx no se guardan, para reintentar apenas GitHub vuelva a responder.
const PAGE_CACHE_LIMIT = 1000
// Con 100 commits por pagina, el tope de paginas solo no alcanza para acotar la memoria
const CACHED_COMMIT_LIMIT = 50_000
const MISSING_REPO_TTL_MS = 15 * 60 * 1000
const pageCache = new Map<string, CommitPageCacheEntry>()
let cachedCommitCount = 0

function utcDay(time = Date.now()) {
  return new Date(time).toISOString().slice(0, 10)
}

// Toda baja pasa por aca para que el conteo de commits no se desfase
function deletePage(url: string) {
  const entry = pageCache.get(url)
  if (!entry) return
  pageCache.delete(url)
  cachedCommitCount -= entry.commits.length
}

// Map conserva el orden de insercion: re-insertar deja la entrada como la usada mas reciente
function touchPage(url: string, entry: CommitPageCacheEntry) {
  deletePage(url)
  pageCache.set(ownString(url), entry)
  cachedCommitCount += entry.commits.length
}

function storePage(url: string, entry: CommitPageCacheEntry) {
  const now = Date.now()
  const today = utcDay(now)
  // Saca lo que ya no sirve antes de desalojar entradas vigentes
  for (const [key, value] of pageCache) {
    if ((value.day !== null && value.day !== today) || (value.expiresAt !== null && value.expiresAt <= now)) deletePage(key)
  }

  deletePage(url)
  while (pageCache.size >= PAGE_CACHE_LIMIT || cachedCommitCount + entry.commits.length > CACHED_COMMIT_LIMIT) {
    const oldest = pageCache.keys().next().value
    if (oldest === undefined) break
    deletePage(oldest)
  }
  touchPage(url, entry)
}

// GitHub corta con 403 (limite secundario) por encima de ~100 consultas simultaneas y cada
// pestania del tablero pide ~70 repos a la vez
const GITHUB_CONCURRENCY = 8
const GITHUB_TIMEOUT_MS = 10_000
// Tope de toda la request: con GitHub colgado, ~140 consultas de a 8 tardarian minutos y se
// superpondrian con la proxima consulta del tablero (cada 60 s). Lo que no entra queda con
// lo guardado en la base.
const REQUEST_BUDGET_MS = 25_000

type Limiter = (<T>(task: () => Promise<T>) => Promise<T>) & { remaining: () => number }

// El turno pasa directo al siguiente de la cola: si se liberara antes, una consulta nueva
// podria colarse en el medio y superar el maximo
function createLimiter(max: number, budgetMs: number): Limiter {
  let active = 0
  const waiting: Array<() => void> = []
  const deadline = Date.now() + budgetMs

  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < max) active += 1
    else await new Promise<void>((resolve) => waiting.push(resolve))

    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
  return Object.assign(run, { remaining: () => deadline - Date.now() })
}

async function fetchCommitPage(url: string, headers: HeadersInit, daily: boolean, limit: Limiter) {
  const day = daily ? utcDay() : null
  const cached = pageCache.get(url)

  if (cached && cached.expiresAt !== null) {
    if (cached.expiresAt > Date.now()) {
      touchPage(url, { ...cached, day })
      return cached.commits
    }
    deletePage(url)
  }

  // El turno se ocupa hasta terminar de leer el cuerpo y el timeout corre desde que sale la
  // consulta, no mientras espera en la cola. Un timeout o un error de red se trata como
  // cualquier otro error: null y sin cachear.
  const result = await limit(async () => {
    const remaining = limit.remaining()
    // Sin tiempo: si la pagina ya estaba en cache se usa esa (como un 304); si no, null.
    if (remaining < 1000) return cached?.etag ? { status: 304, etag: cached.etag, commits: null } : null
    try {
      const response = await fetch(url, {
        headers: cached?.etag ? { ...headers, 'If-None-Match': cached.etag } : headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(GITHUB_TIMEOUT_MS, remaining)),
      })
      const commits = response.ok ? ((await response.json()) as GithubCommit[]).map(toCommitSummary) : null
      return { status: response.status, etag: response.headers.get('etag'), commits }
    } catch {
      return null
    }
  })
  if (!result) return null

  if (result.status === 304 && cached?.etag) {
    touchPage(url, { ...cached, day })
    return cached.commits
  }
  // Repo vacio o inaccesible: sin guardarlo gastaria cupo en cada consulta del tablero
  if (result.status === 404 || result.status === 409) {
    storePage(url, { etag: null, commits: [], day, expiresAt: Date.now() + MISSING_REPO_TTL_MS })
    return []
  }
  if (!result.commits) return null

  if (result.etag) storePage(url, { etag: ownString(result.etag), commits: result.commits, day, expiresAt: null })
  return result.commits
}

async function fetchRepoCommits(repoUrl: string | null | undefined, repoLabel: string, headers: HeadersInit, days: number | null, limitPerRepo: number, limit: Limiter) {
  const repo = parseGithubRepo(repoUrl)
  if (!repo) return []

  const since = days
    ? (() => {
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date
      })()
    : null
  // La consulta pide desde el inicio de ese dia para que la URL sea la misma durante todo el
  // dia (y el ETag sirva); el corte exacto se aplica despues.
  const sinceDay = since ? new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())) : null
  const sinceParam = sinceDay ? `&since=${encodeURIComponent(sinceDay.toISOString())}` : ''

  const commits: CommitSummary[] = []
  let page = 1
  const perPage = Math.min(100, Math.max(20, limitPerRepo))

  while (commits.length < limitPerRepo) {
    const pageCommits = await fetchCommitPage(`https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=${perPage}&page=${page}${sinceParam}`, headers, Boolean(sinceDay), limit)
    if (!pageCommits) break

    commits.push(...pageCommits)

    if (pageCommits.length < perPage || days) break
    page += 1
  }

  const inWindow = since
    ? commits.filter((commit) => {
        // since de GitHub filtra por fecha de committer: con la de autor se perderian los
        // commits rebaseados o con cherry-pick que la consulta si devuelve
        const date = commit.committerDate ?? commit.authorDate
        return !date || new Date(date) >= since
      })
    : commits

  return inWindow.slice(0, limitPerRepo).map((commit) => ({
    sha: commit.sha,
    message: commit.message,
    author: commit.authorLogin ?? commit.authorName ?? 'Sin autor',
    authorLogin: commit.authorLogin,
    authorAvatarUrl: commit.authorAvatarUrl,
    date: commit.authorDate ?? commit.committerDate,
    url: commit.url,
    repo: `${repo.owner}/${repo.repo}`,
    repoLabel,
  }))
}

async function loadCachedCommits(projectIds: string[], days: number | null, limitPerProject: number) {
  const supabase = getSupabaseAdminClient()
  if (!supabase || projectIds.length === 0) return {} as Record<string, ProjectCommitActivity[]>

  let query = supabase
    .from('project_commits')
    .select('project_id, sha, message, author, author_login, author_avatar_url, committed_at, commit_url, repository, repository_label')
    .in('project_id', projectIds)
    .order('committed_at', { ascending: false })
    .limit(Math.max(50, projectIds.length * limitPerProject * 2))

  if (days) query = query.gte('committed_at', new Date(Date.now() - days * 86400000).toISOString())
  const { data, error } = await query
  if (error) return {}

  const grouped: Record<string, ProjectCommitActivity[]> = {}
  for (const row of (data ?? []) as CachedCommitRow[]) {
    const list = grouped[row.project_id] ?? []
    if (list.length >= limitPerProject * 2) continue
    list.push({
      sha: row.sha,
      message: row.message,
      author: row.author,
      authorLogin: row.author_login,
      authorAvatarUrl: row.author_avatar_url,
      date: row.committed_at,
      url: row.commit_url,
      repo: row.repository,
      repoLabel: row.repository_label,
    })
    grouped[row.project_id] = list
  }
  return grouped
}

export async function POST(request: Request) {
  const body = (await request.json()) as ProjectCommitRequest
  const projects = (body.projects ?? []).slice(0, MAX_PROJECTS)
  const days = body.allTime ? null : typeof body.days === 'number' ? body.days : 3
  const limitPerRepo = Math.min(300, Math.max(10, body.limitPerRepo ?? (body.allTime ? 300 : 30)))
  const token = process.env.GITHUB_TOKEN

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Organizacion-DIA',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (token) headers.Authorization = `Bearer ${token}`

  // Uno por request: los proyectos se siguen armando en paralelo, pero a GitHub solo salen
  // GITHUB_CONCURRENCY consultas a la vez
  const limit = createLimiter(GITHUB_CONCURRENCY, REQUEST_BUDGET_MS)
  const entries = await Promise.all(
    projects.map(async (project) => {
      const commits = (
        await Promise.all([
          fetchRepoCommits(project.repositoryUrl, 'Repo 1', headers, days, limitPerRepo, limit),
          fetchRepoCommits(project.repositoryUrlSecondary, 'Repo 2', headers, days, limitPerRepo, limit),
        ])
      )
        .flat()
        // Un fork como Repo 2 comparte commits con Repo 1: el mismo sha va una sola vez.
        .filter((commit, index, all) => all.findIndex((other) => other.sha === commit.sha) === index)
        .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
        .slice(0, limitPerRepo * 2)

      return [project.id, commits] as const
    }),
  )

  const liveByProject = Object.fromEntries(entries) as Record<string, ProjectCommitActivity[]>
  const supabase = getSupabaseAdminClient()
  // Un mismo proyecto repetido en el pedido tambien repetiria filas, y Postgres rechaza el
  // upsert entero si una clave aparece dos veces: se guarda cada (proyecto, sha) una vez.
  const uniqueEntries = entries.filter(([projectId], index) => entries.findIndex(([otherId]) => otherId === projectId) === index)
  const rowsToCache = uniqueEntries.flatMap(([projectId, commits]) => commits.map((commit) => ({
    project_id: projectId,
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    author_login: commit.authorLogin,
    author_avatar_url: commit.authorAvatarUrl,
    committed_at: commit.date,
    commit_url: commit.url,
    repository: commit.repo,
    repository_label: commit.repoLabel,
    synced_at: new Date().toISOString(),
  })))

  if (supabase && rowsToCache.length > 0) {
    // Si falla, la respuesta en vivo sigue sirviendo, pero queda registrado: si no, el
    // historial de la base deja de actualizarse sin que nadie se entere.
    const { error: cacheError } = await supabase.from('project_commits').upsert(rowsToCache, { onConflict: 'project_id,sha' })
    if (cacheError) console.warn('[project-commits] no se pudieron guardar los commits', cacheError.message)
  }

  const cachedByProject = await loadCachedCommits(projects.map((project) => project.id), days, limitPerRepo)
  const commitsByProject = Object.fromEntries(projects.map((project) => {
    const merged = new Map<string, ProjectCommitActivity>()
    for (const commit of [...(liveByProject[project.id] ?? []), ...(cachedByProject[project.id] ?? [])]) {
      merged.set(commit.sha, commit)
    }
    return [project.id, Array.from(merged.values())
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .slice(0, limitPerRepo * 2)]
  }))

  return Response.json({
    commitsByProject,
    configured: Boolean(token),
    cached: Object.values(cachedByProject).some((commits) => commits.length > 0),
  })
}
