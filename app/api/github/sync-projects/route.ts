import { parseIgnoredRepos, planGithubProjectSync, type ExistingProjectRepo, type GithubOrgRepo } from '@/lib/github-sync'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_PAGES = 10

const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: NO_STORE })

// El cron (.github/workflows/github-projects-sync.yml) entra con PROJECTS_SYNC_SECRET; desde
// el dashboard, cualquier sesion del equipo DIA. Los repos de DIA-SMT son de ese equipo.
async function isAuthorized(request: Request) {
  const syncSecret = process.env.PROJECTS_SYNC_SECRET
  const providedSecret = request.headers.get('x-sync-secret')
  if (syncSecret && providedSecret === syncSecret) return true

  const supabase = await createClient()
  if (!supabase) return false

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data: team } = await supabase.rpc('current_team_slug')
  return team === 'dia'
}

async function githubJson<T>(path: string, headers: HeadersInit) {
  const response = await fetch(`https://api.github.com${path}`, { headers, cache: 'no-store' })
  if (!response.ok) return null
  return (await response.json()) as T
}

// GITHUB_ORG puede ser una organizacion o una cuenta de usuario (DIA-SMT es un usuario), y
// cada caso tiene su propio endpoint. Si el token es de esa misma cuenta se usa /user/repos,
// el unico que incluye los repos privados de un usuario.
async function reposPath(owner: string, headers: HeadersInit, token: string | undefined) {
  const account = await githubJson<{ type: string }>(`/users/${encodeURIComponent(owner)}`, headers)
  if (!account) throw new Error(`GitHub no encontro la cuenta ${owner}.`)
  if (account.type === 'Organization') return `/orgs/${encodeURIComponent(owner)}/repos?type=all`

  if (token) {
    const viewer = await githubJson<{ login: string }>('/user', headers)
    if (viewer?.login.toLowerCase() === owner.toLowerCase()) return '/user/repos?affiliation=owner&visibility=all'
  }

  return `/users/${encodeURIComponent(owner)}/repos?type=owner`
}

async function fetchOrgRepos(org: string, token: string | undefined) {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Organizacion-DIA',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const path = await reposPath(org, headers, token)
  const repos: GithubOrgRepo[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(`https://api.github.com${path}&per_page=100&sort=created&page=${page}`, {
      headers,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`GitHub respondio ${response.status} al listar los repos de ${org}.`)

    const batch = (await response.json()) as GithubOrgRepo[]
    repos.push(...batch)
    if (batch.length < 100) break
  }

  return repos
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) return reply({ error: 'No autorizado.' }, 401)

  const admin = getSupabaseAdminClient()
  if (!admin) return reply({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' }, 500)

  const org = process.env.GITHUB_ORG || 'DIA-SMT'
  const token = process.env.GITHUB_TOKEN

  let repos: GithubOrgRepo[]
  try {
    repos = await fetchOrgRepos(org, token)
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'No se pudieron leer los repos de GitHub.', configured: Boolean(token) }, 502)
  }

  // Todos los equipos e incluso los proyectos dados de baja: un repo ya cargado en
  // cualquier lado no se vuelve a crear.
  const { data: existing, error: existingError } = await admin
    .from('projects')
    .select('id, active, repository_url, repository_url_secondary, github_repo_id')
  if (existingError) {
    return reply({ error: 'No se pudieron leer los proyectos. Falta ejecutar supabase/add_project_github_sync.sql?' }, 500)
  }

  const plan = planGithubProjectSync(repos, (existing ?? []) as ExistingProjectRepo[], parseIgnoredRepos(process.env.GITHUB_SYNC_IGNORE))

  for (const link of plan.links) {
    // Si otro proyecto ya tiene ese id, la restriccion unica lo rechaza y se deja como esta.
    await admin.from('projects').update({ github_repo_id: link.githubRepoId }).eq('id', link.projectId).is('github_repo_id', null)
  }

  if (plan.inserts.length === 0) return reply({ created: 0, projects: [], configured: Boolean(token) })

  const { data: team, error: teamError } = await admin.from('teams').select('id').eq('slug', 'dia').maybeSingle()
  if (teamError || !team) return reply({ error: 'No existe el equipo DIA en la tabla teams.' }, 500)

  const { data: created, error: insertError } = await admin
    .from('projects')
    .upsert(
      plan.inserts.map((insert) => ({ ...insert, team_id: team.id })),
      { onConflict: 'github_repo_id', ignoreDuplicates: true },
    )
    .select('id, name, repository_url')
  if (insertError) return reply({ error: `No se pudieron crear los proyectos: ${insertError.message}` }, 500)

  return reply({ created: created?.length ?? 0, projects: created ?? [], configured: Boolean(token) })
}
