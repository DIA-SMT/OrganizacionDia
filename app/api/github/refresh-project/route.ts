import { fetchRepoDetails, fetchRepoInfo, githubHeaders, summariesConfigured, summarizeReadme } from '@/lib/github-enrich'
import { githubRepoKey, refreshProposal, usefulReadme, type RefreshFields } from '@/lib/github-sync'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }
const RUN_BUDGET_MS = 45_000

const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: NO_STORE })

// Actualiza un proyecto desde GitHub a pedido, desde la ficha: lee el repo en ese momento y
// devuelve lo que propone (descripcion del README, tecnologias, sitio e inicio) junto con los
// valores actuales. No escribe nada: la persona elige en la ficha que aplicar. readme dice
// de donde salio la descripcion: summary, no-info (el README no describe el proyecto),
// no-readme o failed (el modelo no respondio; el resto de la propuesta igual sirve).
export async function POST(request: Request) {
  const deadline = Date.now() + RUN_BUDGET_MS
  const supabase = await createClient()
  if (!supabase) return reply({ error: 'Supabase no esta configurado.' }, 500)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return reply({ error: 'Sesion no autorizada.' }, 401)

  const { data: team } = await supabase.rpc('current_team_slug')
  if (team !== 'dia') return reply({ error: 'Solo el equipo DIA actualiza proyectos desde GitHub.' }, 403)

  let projectId = ''
  try {
    const body = (await request.json()) as { projectId?: unknown }
    projectId = typeof body.projectId === 'string' ? body.projectId : ''
  } catch {
    return reply({ error: 'El cuerpo no es JSON valido.' }, 400)
  }
  if (!projectId) return reply({ error: 'Falta el proyecto.' }, 400)

  // Con el cliente de la sesion: la RLS limita la lectura a los proyectos del propio equipo.
  const { data: project } = await supabase
    .from('projects')
    .select('id, repository_url, repository_url_secondary, description, stack, website_url, start_date')
    .eq('id', projectId)
    .eq('active', true)
    .maybeSingle()
  if (!project) return reply({ error: 'No se encontro el proyecto.' }, 404)

  const primaryKey = githubRepoKey(project.repository_url)
  const secondaryKey = githubRepoKey(project.repository_url_secondary)
  const repoKey = primaryKey ?? secondaryKey
  if (!repoKey) return reply({ error: 'El proyecto no tiene un repositorio de GitHub.' }, 404)

  const headers = githubHeaders(process.env.GITHUB_TOKEN)
  const rateLimited = () => reply({ error: 'Se agoto el cupo de consultas a GitHub. Proba de nuevo en un rato.' }, 429)
  const githubFailed = () => reply({ error: 'GitHub no respondio. Proba de nuevo en unos minutos.' }, 502)

  const info = await fetchRepoInfo(repoKey, headers)
  if (info.outcome !== 'ok') {
    if (info.outcome === 'rate-limited') return rateLimited()
    if (info.outcome === 'unauthorized') return reply({ error: 'El token de GitHub del servidor no es valido o vencio (GITHUB_TOKEN).' }, 500)
    if (info.outcome === 'not-found') return reply({ error: `No se pudo leer el repositorio ${repoKey} (no existe o el token no tiene acceso).` }, 404)
    return githubFailed()
  }
  const repo = info.repo

  const details = await fetchRepoDetails(repoKey, headers)
  if (details.outcome === 'rate-limited') return rateLimited()
  if (details.outcome === 'retry') return githubFailed()

  // El README del Repo 1 y, si no alcanza (no hay, o el modelo dice que no describe el
  // proyecto, por ejemplo una plantilla), el del Repo 2.
  const readmes = [details.readme]
  const otherKey = secondaryKey && secondaryKey !== repoKey ? secondaryKey : null

  let readmeStatus: 'summary' | 'no-info' | 'no-readme' | 'failed' = 'no-readme'
  let summaryText: string | null = null
  for (let index = 0; index < 2 && readmeStatus !== 'summary'; index += 1) {
    if (index === 1) {
      if (!otherKey) break
      const secondary = await fetchRepoDetails(otherKey, headers)
      if (secondary.outcome === 'rate-limited') return rateLimited()
      if (secondary.outcome !== 'ok') break
      readmes.push(secondary.readme)
    }
    const readme = readmes[index]
    if (!usefulReadme(readme)) continue
    // Sin modelo disponible igual se devuelve el resto de la propuesta (tecnologias, sitio, inicio).
    if (!summariesConfigured()) {
      readmeStatus = 'failed'
      break
    }
    const summary = await summarizeReadme(repo.name, repo.description, readme, deadline)
    if (summary.outcome === 'failed') {
      readmeStatus = 'failed'
      break
    }
    readmeStatus = summary.outcome === 'summary' ? 'summary' : 'no-info'
    if (summary.outcome === 'summary') summaryText = summary.text
  }

  const current: RefreshFields = {
    description: project.description,
    stack: project.stack,
    website_url: project.website_url,
    start_date: project.start_date,
  }
  const proposal = refreshProposal(repo, details.languages, summaryText)
  // Si fallo el modelo no se propone la descripcion corta de GitHub como si fuera el resumen.
  if (readmeStatus === 'failed') proposal.description = null
  return reply({ repository: repoKey, readme: readmeStatus, current, proposal })
}
