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
      github_repo_id: repo.id,
      status: 'En desarrollo',
      priority: 'Media',
      progress: 0,
    })
    knownKeys.add(key)
  }

  return plan
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
