import { fetchRepoDetails, summariesConfigured, summarizeReadme } from '@/lib/github-enrich'
import {
  githubRepoKey,
  listingPatch,
  parseIgnoredRepos,
  planGithubProjectSync,
  readmeCandidates,
  readmePatch,
  type ExistingProjectRepo,
  type GithubOrgRepo,
  type ProjectGithubFields,
} from '@/lib/github-sync'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'

export const runtime = 'nodejs'
// El analisis de READMEs corre despues de responder (after), dentro de este mismo limite.
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_PAGES = 10
// READMEs que se analizan por corrida; el resto queda para la siguiente (la proxima vez que
// alguien abre el tablero, o el cron diario).
const README_PER_RUN = 6
const README_CONCURRENCY = 3
// Margen para terminar antes de maxDuration, y tiempo minimo para arrancar otra tanda.
const RUN_BUDGET_MS = 52_000
const MIN_TIME_FOR_BATCH_MS = 20_000
const UPDATE_CONCURRENCY = 10
// Un GitHub colgado no puede llevarse la corrida entera (y el reintento del cron).
const GITHUB_TIMEOUT_MS = 10_000

// Evita dos analisis simultaneos en la misma instancia (cron y tablero a la vez).
let readmeAnalysisRunning = false

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
  const response = await fetch(`https://api.github.com${path}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) })
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

function githubHeaders(token: string | undefined) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Organizacion-DIA',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

async function fetchOrgRepos(org: string, token: string | undefined) {
  const headers = githubHeaders(token)
  const path = await reposPath(org, headers, token)
  const repos: GithubOrgRepo[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(`https://api.github.com${path}&per_page=100&sort=created&page=${page}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`GitHub respondio ${response.status} al listar los repos de ${org}.`)

    const batch = (await response.json()) as GithubOrgRepo[]
    repos.push(...batch)
    if (batch.length < 100) break
  }

  return repos
}

export async function POST(request: Request) {
  const deadline = Date.now() + RUN_BUDGET_MS
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

  let created: Array<{ id: string; name: string; repository_url: string }> = []
  if (plan.inserts.length > 0) {
    const { data: team, error: teamError } = await admin.from('teams').select('id').eq('slug', 'dia').maybeSingle()
    if (teamError || !team) return reply({ error: 'No existe el equipo DIA en la tabla teams.' }, 500)

    const { data, error: insertError } = await admin
      .from('projects')
      .upsert(
        plan.inserts.map((insert) => ({ ...insert, team_id: team.id })),
        { onConflict: 'github_repo_id', ignoreDuplicates: true },
      )
      .select('id, name, repository_url')
    if (insertError) return reply({ error: `No se pudieron crear los proyectos: ${insertError.message}` }, 500)
    created = data ?? []
  }

  const repoById = new Map(repos.map((repo) => [repo.id, repo]))
  const { data: linkedRows, error: linkedError } = await admin
    .from('projects')
    .select('id, description, stack, start_date, website_url, github_repo_id, github_filled_at, github_enriched_at, github_readme_failed_at, created_at')
    .eq('active', true)
    .not('github_repo_id', 'is', null)
  // Sin las columnas (falta supabase/add_project_github_enrichment.sql) se siguen dando de
  // alta los repos, pero no se completa nada.
  const linked = linkedError ? [] : ((linkedRows ?? []) as ProjectGithubFields[])

  const { filled, stale } = await fillFromListing(admin, linked, repoById)

  // El README se analiza despues de responder: el tablero recibe enseguida lo creado y lo
  // completado, y vuelve a cargar cuando termina el analisis. Se saltean los proyectos cuya
  // foto quedo vieja en este mismo paso.
  const candidates = readmeCandidates(linked, repoById).filter((project) => !stale.has(project.id))
  const willAnalyze = candidates.length > 0 && summariesConfigured() && !readmeAnalysisRunning
  if (willAnalyze) {
    readmeAnalysisRunning = true
    after(async () => {
      try {
        const result = await analyzeReadmes(admin, candidates.slice(0, README_PER_RUN), repoById, githubHeaders(token), deadline)
        console.info('[sync-projects] README', { ...result, pendientes: candidates.length - result.analyzed })
      } finally {
        readmeAnalysisRunning = false
      }
    })
  }

  return reply({
    created: created.length,
    projects: created,
    linked: plan.links.length,
    filled,
    readmePending: candidates.length,
    readmeAnalysis: willAnalyze ? Math.min(candidates.length, README_PER_RUN) : 0,
    ...(linkedError ? { enrichment: 'Falta ejecutar supabase/add_project_github_enrichment.sql' } : {}),
    configured: Boolean(token),
  })
}

// Inicio, sitio, lenguaje y descripcion corta salen del listado que ya se trajo: no gastan
// consultas a GitHub. Se completan una sola vez por proyecto (github_filled_at): si despues
// alguien vacia un campo a proposito, no vuelve a llenarse. El update exige que los campos
// sigan en null, para no pisar lo cargado a mano mientras tanto.
async function fillFromListing(admin: SupabaseClient, projects: ProjectGithubFields[], repoById: Map<number, GithubOrgRepo>) {
  const filledAt = new Date().toISOString()
  const updates = projects.flatMap((project) => {
    const repo = repoById.get(project.github_repo_id)
    return repo && !project.github_filled_at ? [{ project, patch: listingPatch(project, repo) }] : []
  })

  let filled = 0
  // Proyectos cuyo update no encontro la fila como se leyo (otra corrida o una edicion la
  // cambio): su foto quedo vieja y no se analizan en esta corrida.
  const stale = new Set<string>()
  for (let start = 0; start < updates.length; start += UPDATE_CONCURRENCY) {
    await Promise.all(
      updates.slice(start, start + UPDATE_CONCURRENCY).map(async ({ project, patch }) => {
        // Un proyecto ya marcado como analizado pero nunca completado lo marco la version
        // anterior, que podia marcar sin resumen: se limpia para analizarlo una vez mas.
        const legacy = project.github_enriched_at ? { github_enriched_at: null } : {}
        let query = admin
          .from('projects')
          .update({ ...patch, ...legacy, github_filled_at: filledAt })
          .eq('id', project.id)
          .is('github_filled_at', null)
        for (const field of Object.keys(patch)) query = query.is(field, null)
        const { data, error } = await query.select('id')
        if (error || (data?.length ?? 0) === 0) {
          stale.add(project.id)
          return
        }
        // El analisis del README parte de esta misma foto: tiene que ver lo recien escrito.
        Object.assign(project, patch, legacy, { github_filled_at: filledAt })
        if (Object.keys(patch).length > 0) filled += 1
      }),
    )
  }
  return { filled, stale }
}

type ReadmeOutcome = 'done' | 'retry' | 'rate-limited' | 'model-failed'

// Analiza de a pocos el README de los candidatos. Corta la corrida si se agota el cupo de
// GitHub, si el modelo falla con todos los de una tanda (proveedor caido) o si no queda
// tiempo. Un proyecto que falla queda con github_readme_failed_at y se reintenta en unas horas.
async function analyzeReadmes(admin: SupabaseClient, batch: ProjectGithubFields[], repoById: Map<number, GithubOrgRepo>, headers: Record<string, string>, deadline: number) {
  let analyzed = 0
  let stoppedBy: string | null = null

  for (let start = 0; start < batch.length; start += README_CONCURRENCY) {
    if (deadline - Date.now() < MIN_TIME_FOR_BATCH_MS) {
      stoppedBy = 'tiempo'
      break
    }
    const group = batch.slice(start, start + README_CONCURRENCY)
    const outcomes = await Promise.all(group.map((project) => analyzeReadme(admin, project, repoById.get(project.github_repo_id)!, headers, deadline)))

    analyzed += outcomes.filter((outcome) => outcome === 'done').length
    if (outcomes.includes('rate-limited')) stoppedBy = 'cupo de GitHub'
    else if (outcomes.every((outcome) => outcome === 'model-failed')) stoppedBy = 'modelo'
    if (stoppedBy) break
  }

  return { analyzed, stoppedBy }
}

async function analyzeReadme(admin: SupabaseClient, project: ProjectGithubFields, repo: GithubOrgRepo, headers: Record<string, string>, deadline: number): Promise<ReadmeOutcome> {
  const repoKey = githubRepoKey(repo.html_url)
  if (!repoKey) return 'retry'

  // Antes de leer: un push durante el analisis tiene que quedar despues de esta marca para
  // que el proyecto se vuelva a analizar.
  const analyzedAt = new Date().toISOString()
  const details = await fetchRepoDetails(repoKey, headers)
  // El cupo agotado es de toda la cuenta, no del proyecto: no se marca nada.
  if (details.outcome === 'rate-limited') return 'rate-limited'

  const summary = details.outcome === 'ok' ? await summarizeReadme(repo.name, repo.description, details.readme, deadline) : null
  const finished = summary !== null && summary.outcome !== 'failed'
  const patch = readmePatch(project, repo, details.languages, summary?.outcome === 'summary' ? summary.text : null)

  // Si fallo, igual se guardan las tecnologias (no dependen del modelo) y se anota el fallo
  // para esperar antes de reintentar. Solo si la descripcion y el stack siguen como se
  // leyeron: si alguien los edito durante el analisis, se respeta lo suyo.
  const update = finished
    ? { ...patch, github_enriched_at: analyzedAt, github_readme_failed_at: null }
    : { ...(patch.stack ? { stack: patch.stack } : {}), github_readme_failed_at: analyzedAt }
  let query = admin.from('projects').update(update).eq('id', project.id)
  query = project.description === null ? query.is('description', null) : query.eq('description', project.description)
  query = project.stack === null ? query.is('stack', null) : query.eq('stack', project.stack)
  const { data, error } = await query.select('id')
  if (error) return 'retry'
  if ((data?.length ?? 0) === 0) {
    // Cambiaron la descripcion o el stack mientras tanto: se anota igual el resultado.
    const mark = finished ? { github_enriched_at: analyzedAt, github_readme_failed_at: null } : { github_readme_failed_at: analyzedAt }
    const { error: markError } = await admin.from('projects').update(mark).eq('id', project.id)
    if (markError) return 'retry'
  }

  if (details.outcome === 'retry') return 'retry'
  return finished ? 'done' : 'model-failed'
}
