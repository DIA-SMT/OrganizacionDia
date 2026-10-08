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

const README_MAX_CHARS = 12000
const README_MIN_CHARS = 120
// READMEs de plantilla que no dicen nada del proyecto.
const TEMPLATE_README = [
  /bootstrapped with \W*create[- ]next[- ]app/i,
  /bootstrapped with \W*create react app/i,
  /this template provides a minimal setup to get react working in vite/i,
  /welcome to your lovable project/i,
]

// Devuelve el README listo para mandar al modelo, o null si no aporta: vacio, demasiado
// corto o el texto por defecto de una plantilla.
export function usefulReadme(readme: string | null | undefined) {
  if (!readme) return null
  const text = readme
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (text.length < README_MIN_CHARS) return null
  // Una plantilla con contenido propio agregado sigue sirviendo; solo se descarta la pelada.
  if (TEMPLATE_README.some((pattern) => pattern.test(text)) && text.length < 2500) return null
  return text.slice(0, README_MAX_CHARS)
}

export const NO_SUMMARY = 'SIN_INFO'

// Limpia la respuesta del modelo: sin comillas, sin markdown y con un tope de largo.
export function cleanSummary(text: string | null | undefined) {
  // Se mira antes de limpiar: la limpieza borra el guion bajo de SIN_INFO.
  if (!text || text.toUpperCase().includes(NO_SUMMARY)) return null
  const cleaned = text
    .replace(/[*_#`>]/g, '')
    .replace(/^["'«“\s]+|["'»”\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  if (cleaned.length <= 700) return cleaned
  // Se corta en el ultimo punto; si no hay uno razonable, en la ultima palabra.
  const cut = cleaned.slice(0, 700)
  const lastStop = cut.lastIndexOf('. ')
  if (lastStop > 300) return cut.slice(0, lastStop + 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

export type EnrichableProject = {
  description: string | null
  stack: string | null
  start_date: string | null
  website_url: string | null
}

// Solo completa lo vacio. La descripcion tambien se reemplaza si es la misma que trae
// GitHub (la que se cargo sola al dar de alta el repo): el resumen del README la mejora.
export function enrichmentPatch(
  project: EnrichableProject,
  repo: Pick<GithubOrgRepo, 'description' | 'language' | 'homepage' | 'created_at'>,
  languages: Record<string, number> | null,
  summary: string | null,
) {
  const patch: Partial<EnrichableProject> = {}
  const githubDescription = repo.description?.trim() || null
  const currentDescription = project.description?.trim() || null

  if (!currentDescription || currentDescription === githubDescription) {
    const description = summary ?? githubDescription
    if (description && description !== currentDescription) patch.description = description
  }
  if (!project.stack?.trim()) {
    const stack = stackFromLanguages(languages, repo.language)
    if (stack) patch.stack = stack
  }
  if (!project.start_date) {
    const startDate = repoStartDate(repo.created_at)
    if (startDate) patch.start_date = startDate
  }
  if (!project.website_url?.trim()) {
    const website = cleanHomepage(repo.homepage)
    if (website) patch.website_url = website
  }

  return patch
}

const SYNC_THROTTLE_KEY = 'github-projects-sync-at'
const SYNC_THROTTLE_MS = 5 * 60 * 1000

// Pide al servidor que traiga los repos nuevos. Devuelve cuantos proyectos se crearon.
// Como mucho una vez cada 5 minutos por pestania; el resto lo cubre el cron.
export async function requestGithubProjectSync() {
  try {
    const last = Number(window.sessionStorage.getItem(SYNC_THROTTLE_KEY) ?? 0)
    if (Date.now() - last < SYNC_THROTTLE_MS) return 0
    window.sessionStorage.setItem(SYNC_THROTTLE_KEY, String(Date.now()))
  } catch {
    // Sin sessionStorage se sincroniza igual.
  }

  try {
    const response = await fetch('/api/github/sync-projects', { method: 'POST' })
    if (!response.ok) return 0
    const payload = (await response.json()) as { created?: unknown }
    return typeof payload.created === 'number' ? payload.created : 0
  } catch {
    return 0
  }
}
