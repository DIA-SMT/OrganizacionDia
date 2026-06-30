import type { SupabaseClient } from '@supabase/supabase-js'

export type AssistantProject = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  stack: string | null
  status: string
  priority: string
  progress: number | null
  estimated_delivery: string | null
  note: string | null
  repository_url: string | null
  repository_url_secondary: string | null
  production_url: string | null
}

export type AssistantIntent =
  | 'project_detail'
  | 'project_members'
  | 'project_commits'
  | 'recent_commits'
  | 'work_summary'
  | 'completed_tasks'
  | 'expedientes'
  | 'team_overview'
  | 'project_documents'
  | 'priority_overview'
  | 'priority_projects'
  | 'status_projects'
  | 'pending_tasks'
  | 'upcoming_deliveries'
  | 'dashboard_summary'
  | 'project_search'

export type AssistantResult = {
  text: string
  intent: AssistantIntent
  projects: AssistantProject[]
  totalProjects: number
  sources?: string[]
  updatedAt?: string
}

export type AssistantCommit = {
  sha: string
  message: string
  author: string
  date: string | null
  url: string
  repo: string
  repoLabel: string
  projectId: string
  projectName: string
}

export type AssistantMember = {
  id: string
  full_name: string
  email: string | null
  role: string | null
  avatar_url: string | null
  github_username: string | null
}

export type AssistantContributor = {
  name: string
  login: string | null
  avatarUrl: string | null
}

export type AssistantParticipant = {
  key: string
  name: string
  role: string | null
  avatarUrl: string | null
  source: 'project' | 'task' | 'commit' | 'project_and_activity' | 'task_and_commit'
}

const projectSelect =
  'id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, note, repository_url, repository_url_secondary, production_url'

const statusFilters = [
  { keywords: ['planificacion', 'planeamiento'], status: 'Planificación' },
  { keywords: ['desarrollo', 'en curso'], status: 'En desarrollo' },
  { keywords: ['mvp', 'aprobado'], status: 'MVP aprobado' },
  { keywords: ['qa', 'testing', 'testeo', 'pruebas'], status: 'QA' },
  { keywords: ['produccion', 'finalizado', 'finalizados', 'online'], status: 'En Producción' },
  { keywords: ['pausado', 'pausados', 'detenido', 'detenidos'], status: 'Pausado' },
] as const

const priorities = ['Baja', 'Media', 'Alta', 'Critica'] as const

export function normalizeAssistantText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeIdentity(value: string | null | undefined) {
  return normalizeAssistantText(value ?? '').replace(/\s+/g, '')
}

export function isProjectMembersQuestion(question: string) {
  const normalized = normalizeAssistantText(question)
  return [
    'integrante',
    'integrantes',
    'miembro',
    'miembros',
    'equipo',
    'responsable',
    'responsables',
    'quien trabaja',
    'quienes trabajan',
    'personas trabajan',
  ].some((keyword) => normalized.includes(keyword))
}

export function isCommitQuestion(question: string) {
  const normalized = normalizeAssistantText(question)
  return ['commit', 'commits', 'cambio reciente', 'cambios recientes', 'modificacion', 'modificaciones', 'que hicimos', 'que se hizo', 'trabajado'].some((keyword) => normalized.includes(keyword))
}

export function isExpedienteQuestion(question: string) {
  const normalized = normalizeAssistantText(question)
  return normalized.includes('expediente') || normalized.includes('expedientes')
}

export function isTeamQuestion(question: string) {
  const normalized = normalizeAssistantText(question)
  return ['equipo', 'personas de la oficina', 'integrantes de la oficina', 'miembros de la oficina'].some((keyword) => normalized.includes(keyword))
}

export function isProjectDocumentsQuestion(question: string) {
  const normalized = normalizeAssistantText(question)
  return ['documento', 'documentos', 'pdf', 'pdfs', 'archivo', 'archivos'].some((keyword) => normalized.includes(keyword))
}

export function resolveAssistantDays(question: string): number | null {
  const normalized = normalizeAssistantText(question)
  if (normalized.includes('todo el tiempo') || normalized.includes('todos los commit') || normalized.includes('historico')) return null
  if (normalized.includes('24 hora') || normalized.includes('hoy') || normalized.includes('ayer')) return 1
  if (normalized.includes('3 dia')) return 3
  if (normalized.includes('7 dia') || normalized.includes('semana')) return 7
  if (normalized.includes('15 dia')) return 15
  if (normalized.includes('1 mes') || normalized.includes('ultimo mes') || normalized.includes('30 dia')) return 30
  if (normalized.includes('1 ano') || normalized.includes('ultimo ano') || normalized.includes('365 dia')) return 365
  return null
}

export function resolveProjectParticipants(
  members: AssistantMember[],
  assignedMemberIds: string[],
  contributors: AssistantContributor[],
  projectMemberIds: string[] = [],
) {
  const memberById = new Map(members.map((member) => [member.id, member]))
  const memberByIdentity = new Map<string, AssistantMember>()
  const participants = new Map<string, AssistantParticipant>()

  for (const member of members) {
    for (const identity of [member.github_username, member.full_name, member.email?.split('@')[0]]) {
      const key = normalizeIdentity(identity)
      if (key && !memberByIdentity.has(key)) memberByIdentity.set(key, member)
    }
  }

  for (const memberId of projectMemberIds) {
    const member = memberById.get(memberId)
    if (!member || participants.has(member.id)) continue
    participants.set(member.id, {
      key: member.id,
      name: member.full_name,
      role: member.role,
      avatarUrl: member.avatar_url,
      source: 'project',
    })
  }

  for (const memberId of assignedMemberIds) {
    const member = memberById.get(memberId)
    if (!member) continue
    const existing = participants.get(member.id)
    if (existing) {
      if (existing.source === 'project') {
        participants.set(member.id, { ...existing, source: 'project_and_activity' })
      }
      continue
    }
    participants.set(member.id, {
      key: member.id,
      name: member.full_name,
      role: member.role,
      avatarUrl: member.avatar_url,
      source: 'task',
    })
  }

  for (const contributor of contributors) {
    const member = memberByIdentity.get(normalizeIdentity(contributor.login)) ?? memberByIdentity.get(normalizeIdentity(contributor.name))
    const key = member?.id ?? normalizeIdentity(contributor.login || contributor.name)
    if (!key) continue

    const existing = participants.get(key)
    if (existing) {
      participants.set(key, {
        ...existing,
        source: existing.source === 'project' || existing.source === 'project_and_activity'
          ? 'project_and_activity'
          : 'task_and_commit',
      })
      continue
    }

    participants.set(key, {
      key,
      name: member?.full_name || contributor.login || contributor.name,
      role: member?.role ?? null,
      avatarUrl: member?.avatar_url || contributor.avatarUrl,
      source: 'commit',
    })
  }

  return Array.from(participants.values()).slice(0, 12)
}

function projectAliases(project: AssistantProject) {
  const normalizedName = normalizeAssistantText(project.name)
  const aliases = project.name
    .split(/[-_/]+/)
    .map((part) => normalizeAssistantText(part))
    .filter((part) => part.length >= 4)

  return Array.from(new Set([normalizedName, normalizedName.replace(/\s+/g, ''), ...aliases]))
}

export function findAssistantProject(projects: AssistantProject[], requestedName: string) {
  const target = normalizeAssistantText(requestedName)
  if (!target) return null
  const compactTarget = target.replace(/\s+/g, '')

  const matches = projects
    .map((project) => {
      const normalizedName = normalizeAssistantText(project.name)
      const compactName = normalizedName.replace(/\s+/g, '')
      let score = 0

      if (normalizedName === target) score = 1000
      else if (compactName === compactTarget) score = 950
      else if (normalizedName.includes(target) || target.includes(normalizedName)) score = 700 + target.length
      else if (compactName.includes(compactTarget) || compactTarget.includes(compactName)) score = 650 + compactTarget.length

      for (const alias of projectAliases(project)) {
        const compactAlias = alias.replace(/\s+/g, '')
        if (compactAlias === compactTarget) score = Math.max(score, 900)
        else if (compactAlias.includes(compactTarget) || compactTarget.includes(compactAlias)) {
          score = Math.max(score, 500 + compactAlias.length)
        }
      }

      return { project, score }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)

  return matches[0]?.project ?? null
}

function findMentionedProject(projects: AssistantProject[], question: string) {
  const normalizedQuestion = normalizeAssistantText(question)
  const compactQuestion = normalizedQuestion.replace(/\s+/g, '')
  const ignoredTerms = new Set(['proyecto', 'proyectos', 'sistema', 'dashboard', 'pagina', 'aplicacion'])

  const matches = projects
    .map((project) => {
      const normalizedName = normalizeAssistantText(project.name)
      const compactName = normalizedName.replace(/\s+/g, '')
      let score = 0

      if (normalizedQuestion.includes(normalizedName)) score = normalizedName.length + 100
      if (compactQuestion.includes(compactName)) score = Math.max(score, compactName.length + 90)

      for (const alias of projectAliases(project)) {
        const compactAlias = alias.replace(/\s+/g, '')
        if (compactAlias.length >= 4 && compactQuestion.includes(compactAlias)) {
          score = Math.max(score, compactAlias.length + 50)
        }
      }

      const matchedTerms = normalizedName
        .split(/\s+/)
        .filter((term) => term.length >= 4 && !ignoredTerms.has(term) && normalizedQuestion.includes(term))

      if (matchedTerms.length > 0) {
        score = Math.max(score, matchedTerms.reduce((total, term) => total + term.length, 0))
      }

      return { project, score }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)

  return matches[0]?.project ?? null
}

function projectDetailText(
  project: AssistantProject,
  pendingTasks: Array<{ title: string; priority: string }>,
  context?: { participants: AssistantParticipant[]; commits: AssistantCommit[]; documentCount: number },
) {
  const details = [
    `${project.name} está en ${project.status}`,
    `tiene prioridad ${project.priority}`,
    `y un avance del ${project.progress ?? 0}%`,
  ]

  if (project.estimated_delivery) details.push(`La entrega estimada es ${project.estimated_delivery}`)
  if (project.note) details.push(`La nota actual dice: ${project.note}`)
  if (project.description) details.push(`Su descripción es: ${project.description}`)

  if (pendingTasks.length > 0) {
    details.push(
      `Tiene ${pendingTasks.length} tareas pendientes recientes: ${pendingTasks
        .slice(0, 3)
        .map((task) => `${task.title}, prioridad ${task.priority}`)
        .join('; ')}`,
    )
  } else {
    details.push('No tiene tareas pendientes cargadas')
  }

  if (context) {
    details.push(
      context.participants.length > 0
        ? `Responsables y colaboradores detectados: ${context.participants.map((participant) => participant.name).join(', ')}`
        : 'No hay responsables ni colaboradores detectados',
    )
    details.push(`Tiene ${context.documentCount} documento${context.documentCount === 1 ? '' : 's'} cargado${context.documentCount === 1 ? '' : 's'}`)
    details.push(
      context.commits.length > 0
        ? `Últimos cambios: ${context.commits.slice(0, 3).map((commit) => `${commit.message}, por ${commit.author}`).join('; ')}`
        : 'No se encontraron commits de los últimos 7 días',
    )
  }

  return `${details.join('. ')}.`
}

function limitedProjectNames(projects: AssistantProject[], limit = 8) {
  const names = projects.slice(0, limit).map((project) => project.name)
  return `${names.join(', ')}${projects.length > names.length ? ', entre otros' : ''}`
}

async function loadProjects(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('projects')
    .select(projectSelect)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as AssistantProject[]
}

type GithubCommit = {
  sha?: string
  html_url?: string
  commit?: {
    message?: string
    author?: { name?: string | null; date?: string | null } | null
    committer?: { name?: string | null; date?: string | null } | null
  }
  author?: { login?: string | null; avatar_url?: string | null } | null
}

function parseGithubRepository(value: string | null) {
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com')) return null
    const [owner, repository] = url.pathname.replace(/^\/+/, '').split('/')
    if (!owner || !repository) return null
    return { owner, repository: repository.replace(/\.git$/, '') }
  } catch {
    return null
  }
}

async function loadRepositoryContributors(repositoryUrl: string | null): Promise<AssistantContributor[]> {
  const commits = await loadRepositoryCommits(repositoryUrl, 'Repositorio', null, 100)
  return commits.map((commit) => ({
    name: commit.author,
    login: commit.authorLogin,
    avatarUrl: commit.authorAvatarUrl,
  }))
}

type RepositoryCommit = Omit<AssistantCommit, 'projectId' | 'projectName'> & {
  authorLogin: string | null
  authorAvatarUrl: string | null
}

async function loadRepositoryCommits(
  repositoryUrl: string | null,
  repoLabel: string,
  days: number | null,
  limit: number,
): Promise<RepositoryCommit[]> {
  const repository = parseGithubRepository(repositoryUrl)
  if (!repository) return []

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Organizacion-DIA',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  try {
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null
    const sinceParam = since ? `&since=${encodeURIComponent(since)}` : ''
    const response = await fetch(
      `https://api.github.com/repos/${repository.owner}/${repository.repository}/commits?per_page=${Math.min(100, Math.max(1, limit))}${sinceParam}`,
      { headers, cache: 'no-store' },
    )
    if (!response.ok) return []

    const commits = (await response.json()) as GithubCommit[]
    return commits.map((commit) => ({
      sha: commit.sha ?? '',
      message: commit.commit?.message?.split('\n')[0]?.trim() || 'Commit sin descripcion',
      author: commit.author?.login?.trim() || commit.commit?.author?.name?.trim() || 'Sin autor',
      authorLogin: commit.author?.login?.trim() || null,
      authorAvatarUrl: commit.author?.avatar_url || null,
      date: commit.commit?.author?.date ?? commit.commit?.committer?.date ?? null,
      url: commit.html_url ?? repositoryUrl ?? '',
      repo: `${repository.owner}/${repository.repository}`,
      repoLabel,
    }))
  } catch {
    return []
  }
}

async function loadProjectCommits(project: AssistantProject, days: number | null, limitPerRepo = 8) {
  const commits = (await Promise.all([
    loadRepositoryCommits(project.repository_url, 'Repo 1', days, limitPerRepo),
    loadRepositoryCommits(project.repository_url_secondary, 'Repo 2', days, limitPerRepo),
  ])).flat()

  return commits
    .map((commit) => ({ ...commit, projectId: project.id, projectName: project.name }))
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
}

async function loadCommitsForProjects(projects: AssistantProject[], days: number | null, limitPerRepo = 5) {
  return (await Promise.all(
    projects
      .filter((project) => project.repository_url || project.repository_url_secondary)
      .map((project) => loadProjectCommits(project, days, limitPerRepo)),
  ))
    .flat()
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
}

async function loadCachedProjectCommits(
  supabase: SupabaseClient,
  projects: AssistantProject[],
  days: number | null,
  limit = 100,
): Promise<AssistantCommit[]> {
  if (projects.length === 0) return []
  let query = supabase
    .from('project_commits')
    .select('project_id, sha, message, author, committed_at, commit_url, repository, repository_label')
    .in('project_id', projects.map((project) => project.id))
    .order('committed_at', { ascending: false })
    .limit(limit)

  if (days) query = query.gte('committed_at', new Date(Date.now() - days * 86400000).toISOString())
  const { data, error } = await query
  if (error?.message.includes('project_commits')) return []
  if (error) throw error

  const projectById = new Map(projects.map((project) => [project.id, project]))
  return (data ?? []).flatMap((row) => {
    const project = projectById.get(row.project_id)
    if (!project) return []
    return [{
      sha: row.sha,
      message: row.message,
      author: row.author,
      date: row.committed_at,
      url: row.commit_url,
      repo: row.repository,
      repoLabel: row.repository_label,
      projectId: project.id,
      projectName: project.name,
    }]
  })
}

function mergeAssistantCommits(...groups: AssistantCommit[][]) {
  const merged = new Map<string, AssistantCommit>()
  for (const commit of groups.flat()) merged.set(`${commit.projectId}:${commit.sha}`, commit)
  return Array.from(merged.values()).sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
}

async function loadProjectParticipants(supabase: SupabaseClient, project: AssistantProject) {
  const [membersResult, projectMembersResult, tasksResult, contributors] = await Promise.all([
    supabase
      .from('members')
      .select('id, full_name, email, role, avatar_url, github_username')
      .eq('active', true),
    supabase
      .from('project_members')
      .select('member_id')
      .eq('project_id', project.id),
    supabase
      .from('tasks')
      .select('task_assignees(member_id)')
      .eq('project_id', project.id)
      .eq('active', true),
    Promise.all([
      loadRepositoryContributors(project.repository_url),
      loadRepositoryContributors(project.repository_url_secondary),
    ]).then((results) => results.flat()),
  ])

  if (membersResult.error) throw membersResult.error
  const projectMembersTableMissing = projectMembersResult.error?.message.includes('project_members')
  if (projectMembersResult.error && !projectMembersTableMissing) throw projectMembersResult.error
  if (tasksResult.error) throw tasksResult.error

  const assignedMemberIds = (tasksResult.data ?? []).flatMap((task) => {
    const assignees = Array.isArray(task.task_assignees) ? task.task_assignees : []
    return assignees.flatMap((assignee) => (assignee?.member_id ? [assignee.member_id] : []))
  })

  return resolveProjectParticipants(
    (membersResult.data ?? []) as AssistantMember[],
    assignedMemberIds,
    contributors,
    (projectMembersResult.data ?? []).map((row) => row.member_id),
  )
}

function projectParticipantsText(project: AssistantProject, participants: AssistantParticipant[]) {
  if (participants.length === 0) {
    return `No encontré responsables asignados ni autores de commits vinculados a ${project.name}.`
  }

  const people = participants.map((participant) => {
    const source = participant.source === 'project_and_activity'
      ? 'responsable del proyecto y con actividad vinculada'
      : participant.source === 'task_and_commit'
        ? 'responsable de tareas y autor de commits'
      : participant.source === 'project'
        ? 'responsable del proyecto'
        : participant.source === 'task'
        ? 'responsable de tareas'
        : 'autor de commits'
    return `${participant.name}${participant.role ? `, ${participant.role}` : ''} (${source})`
  })

  return `Las personas vinculadas a ${project.name}, según responsables del proyecto, tareas y commits, son: ${people.join('; ')}.`
}

function formatAssistantDate(value: string | null | undefined) {
  if (!value) return 'sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(value))
}

function assistantResultMeta(sources: string[]) {
  return { sources, updatedAt: new Date().toISOString() }
}

function commitSummaryText(commits: AssistantCommit[], days: number | null) {
  if (commits.length === 0) {
    return `No encontré commits ${days === null ? 'en el historial consultado' : `en los últimos ${days} día${days === 1 ? '' : 's'}`}.`
  }

  const range = days === null ? 'más recientes disponibles' : `de los últimos ${days} día${days === 1 ? '' : 's'}`
  return `Encontré ${commits.length} commits ${range}. Los más recientes son: ${commits
    .slice(0, 12)
    .map((commit) => `${commit.projectName}: ${commit.message} — ${commit.author}, ${formatAssistantDate(commit.date)}`)
    .join('; ')}.`
}

export async function runAssistantQuery(supabase: SupabaseClient, question: string): Promise<AssistantResult> {
  const normalizedQuestion = normalizeAssistantText(question)
  if (!normalizedQuestion) throw new Error('Falta la pregunta.')

  const projects = await loadProjects(supabase)
  const totalProjects = projects.length

  if (
    normalizedQuestion.includes('priorizar') ||
    normalizedQuestion.includes('requieren mas atencion') ||
    normalizedQuestion.includes('necesitan atencion') ||
    normalizedQuestion.includes('donde enfocarnos')
  ) {
    const matches = projects
      .filter((project) => ['Alta', 'Critica'].includes(project.priority) && normalizeAssistantText(project.status) !== 'en produccion')
      .sort((a, b) => (a.priority === 'Critica' ? -1 : b.priority === 'Critica' ? 1 : (a.progress ?? 0) - (b.progress ?? 0)))
      .slice(0, 8)

    return {
      text:
        matches.length > 0
          ? `Los proyectos que requieren más atención son: ${matches
              .map((project) => `${project.name}, prioridad ${project.priority}, estado ${project.status}, avance ${project.progress ?? 0}%`)
              .join('; ')}.`
          : 'No hay proyectos activos con prioridad alta o crítica.',
      intent: 'priority_overview',
      projects: matches,
      totalProjects,
    }
  }

  const mentionedProject = findMentionedProject(projects, question)

  if (isCommitQuestion(question)) {
    const days = resolveAssistantDays(question)
    const targetProjects = mentionedProject ? [mentionedProject] : projects
    const [liveCommits, cachedCommits] = await Promise.all([
      loadCommitsForProjects(targetProjects, days, mentionedProject ? 20 : 5),
      loadCachedProjectCommits(supabase, targetProjects, days),
    ])
    const commits = mergeAssistantCommits(liveCommits, cachedCommits).slice(0, 20)
    const relatedProjectIds = new Set(commits.map((commit) => commit.projectId))
    const isWorkSummary = normalizedQuestion.includes('que hicimos') || normalizedQuestion.includes('que se hizo') || normalizedQuestion.includes('trabajado')

    if (isWorkSummary) {
      let completedTasksQuery = supabase
        .from('tasks')
        .select('title, updated_at, projects(id, name)')
        .eq('active', true)
        .eq('status', 'Terminada')
        .order('updated_at', { ascending: false })
        .limit(12)

      if (days !== null) completedTasksQuery = completedTasksQuery.gte('updated_at', new Date(Date.now() - days * 86400000).toISOString())
      if (mentionedProject) completedTasksQuery = completedTasksQuery.eq('project_id', mentionedProject.id)

      const { data: completedTasks, error: completedTasksError } = await completedTasksQuery
      if (completedTasksError) throw completedTasksError
      const tasks = completedTasks ?? []
      const taskText = tasks.length > 0
        ? ` También se finalizaron ${tasks.length} tareas: ${tasks.map((task) => task.title).join('; ')}.`
        : ' No se registraron tareas finalizadas en ese período.'

      return {
        text: `${commitSummaryText(commits, days)}${taskText}`,
        intent: 'work_summary',
        projects: projects.filter((project) => relatedProjectIds.has(project.id)),
        totalProjects,
        ...assistantResultMeta(['GitHub · commits', 'Supabase · historial de commits y tareas']),
      }
    }

    return {
      text: commitSummaryText(commits, days),
      intent: mentionedProject ? 'project_commits' : 'recent_commits',
      projects: mentionedProject ? [mentionedProject] : projects.filter((project) => relatedProjectIds.has(project.id)),
      totalProjects,
      ...assistantResultMeta(['GitHub · commits', 'Supabase · historial de commits']),
    }
  }

  if (mentionedProject) {
    if (isProjectDocumentsQuestion(question)) {
      const { data: documents, error: documentsError } = await supabase
        .from('project_documents')
        .select('file_name, created_at, size_bytes')
        .eq('project_id', mentionedProject.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (documentsError) throw documentsError
      const rows = documents ?? []
      return {
        text: rows.length > 0
          ? `${mentionedProject.name} tiene ${rows.length} documentos cargados: ${rows.map((document) => `${document.file_name} (${formatAssistantDate(document.created_at)})`).join('; ')}.`
          : `${mentionedProject.name} no tiene documentos cargados.`,
        intent: 'project_documents',
        projects: [mentionedProject],
        totalProjects,
        ...assistantResultMeta(['Supabase · documentos de proyectos']),
      }
    }

    if (isProjectMembersQuestion(question)) {
      const participants = await loadProjectParticipants(supabase, mentionedProject)
      return {
        text: projectParticipantsText(mentionedProject, participants),
        intent: 'project_members',
        projects: [mentionedProject],
        totalProjects,
        ...assistantResultMeta(['Supabase · responsables y tareas', 'GitHub · commits']),
      }
    }

    const [tasksResult, documentsResult, participants, commits] = await Promise.all([
      supabase
        .from('tasks')
        .select('title, priority')
        .eq('project_id', mentionedProject.id)
        .eq('active', true)
        .neq('status', 'Terminada')
        .order('updated_at', { ascending: false })
        .limit(5),
      supabase
        .from('project_documents')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', mentionedProject.id),
      loadProjectParticipants(supabase, mentionedProject),
      loadProjectCommits(mentionedProject, 7, 5),
    ])

    if (tasksResult.error) throw tasksResult.error
    if (documentsResult.error && !documentsResult.error.message.includes('project_documents')) throw documentsResult.error
    const pendingTasks = (tasksResult.data ?? []) as Array<{ title: string; priority: string }>

    return {
      text: projectDetailText(mentionedProject, pendingTasks, {
        participants,
        commits,
        documentCount: documentsResult.count ?? 0,
      }),
      intent: 'project_detail',
      projects: [mentionedProject],
      totalProjects,
      ...assistantResultMeta(['Supabase · proyectos, tareas, responsables y documentos', 'GitHub · commits']),
    }
  }

  if (isExpedienteQuestion(question)) {
    let expedienteQuery = supabase
      .from('expedientes')
      .select('name, summary, status, priority, drive_created_at, brief_generated_at')
      .order('drive_created_at', { ascending: false })
      .limit(12)

    if (normalizedQuestion.includes('archivado')) expedienteQuery = expedienteQuery.eq('status', 'Archivado')
    else expedienteQuery = expedienteQuery.neq('status', 'Archivado')
    if (normalizedQuestion.includes('prioridad alta') || normalizedQuestion.includes('urgente')) expedienteQuery = expedienteQuery.eq('priority', 'Alta')

    const { data: expedientes, error: expedientesError } = await expedienteQuery
    if (expedientesError) throw expedientesError
    const rows = expedientes ?? []
    return {
      text: rows.length > 0
        ? `Encontré ${rows.length} expedientes. ${rows.map((expediente) => `${expediente.name}, prioridad ${expediente.priority}, estado ${expediente.status}, creado ${formatAssistantDate(expediente.drive_created_at)}${expediente.summary ? `, resumen: ${expediente.summary}` : ', sin brief generado'}`).join('; ')}.`
        : 'No encontré expedientes con esos criterios.',
      intent: 'expedientes',
      projects: [],
      totalProjects,
      ...assistantResultMeta(['Supabase · expedientes de Drive']),
    }
  }

  if (isTeamQuestion(question)) {
    const { data: team, error: teamError } = await supabase
      .from('members')
      .select('full_name, role, specialty')
      .eq('active', true)
      .order('full_name', { ascending: true })

    if (teamError) throw teamError
    const rows = team ?? []
    return {
      text: rows.length > 0
        ? `El equipo tiene ${rows.length} integrantes: ${rows.map((member) => `${member.full_name}${member.role ? `, ${member.role}` : ''}${member.specialty ? `, especialidad ${member.specialty}` : ''}`).join('; ')}.`
        : 'No hay integrantes activos cargados.',
      intent: 'team_overview',
      projects: [],
      totalProjects,
      ...assistantResultMeta(['Supabase · equipo']),
    }
  }

  const statusFilter = statusFilters.find((filter) =>
    filter.keywords.some((keyword) => normalizedQuestion.includes(keyword)),
  )
  if (statusFilter) {
    const matches = projects.filter(
      (project) => normalizeAssistantText(project.status) === normalizeAssistantText(statusFilter.status),
    )
    return {
      text:
        matches.length > 0
          ? `Hay ${matches.length} proyecto${matches.length === 1 ? '' : 's'} en ${statusFilter.status}: ${limitedProjectNames(matches)}.`
          : `No hay proyectos en ${statusFilter.status}.`,
      intent: 'status_projects',
      projects: matches.slice(0, 8),
      totalProjects,
    }
  }

  const priorityFilter = priorities.find((priority) =>
    normalizedQuestion.includes(normalizeAssistantText(priority)),
  )
  if (priorityFilter && normalizedQuestion.includes('prioridad')) {
    const matches = projects.filter((project) => project.priority === priorityFilter)
    return {
      text:
        matches.length > 0
          ? `Hay ${matches.length} proyecto${matches.length === 1 ? '' : 's'} con prioridad ${priorityFilter}: ${limitedProjectNames(matches)}.`
          : `No hay proyectos con prioridad ${priorityFilter}.`,
      intent: 'priority_projects',
      projects: matches.slice(0, 8),
      totalProjects,
    }
  }

  if (
    normalizedQuestion.includes('tarea') &&
    ['finalizada', 'finalizadas', 'terminada', 'terminadas', 'completada', 'completadas', 'historial'].some((keyword) => normalizedQuestion.includes(keyword))
  ) {
    const days = resolveAssistantDays(question)
    let completedQuery = supabase
      .from('tasks')
      .select('title, priority, updated_at, projects(id, name)')
      .eq('active', true)
      .eq('status', 'Terminada')
      .order('updated_at', { ascending: false })
      .limit(20)

    if (days !== null) completedQuery = completedQuery.gte('updated_at', new Date(Date.now() - days * 86400000).toISOString())
    const { data: completedTasks, error: completedError } = await completedQuery
    if (completedError) throw completedError
    const rows = completedTasks ?? []
    const relatedIds = new Set<string>()
    for (const task of rows) {
      const related = Array.isArray(task.projects) ? task.projects[0] : task.projects
      if (related?.id) relatedIds.add(related.id)
    }

    return {
      text: rows.length > 0
        ? `Hay ${rows.length} tareas finalizadas en el período consultado: ${rows.map((task) => `${task.title}, finalizada ${formatAssistantDate(task.updated_at)}`).join('; ')}.`
        : 'No hay tareas finalizadas en el período consultado.',
      intent: 'completed_tasks',
      projects: projects.filter((project) => relatedIds.has(project.id)),
      totalProjects,
      ...assistantResultMeta(['Supabase · historial de tareas']),
    }
  }

  if (normalizedQuestion.includes('tarea')) {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('title, status, priority, projects(id, name)')
      .eq('active', true)
      .neq('status', 'Terminada')
      .order('updated_at', { ascending: false })
      .limit(8)

    if (error) throw error
    const pendingTasks = tasks ?? []
    const projectIds = new Set<string>()
    for (const task of pendingTasks) {
      const related = Array.isArray(task.projects) ? task.projects[0] : task.projects
      if (related?.id) projectIds.add(related.id)
    }

    return {
      text:
        pendingTasks.length > 0
          ? `Hay ${pendingTasks.length} tareas pendientes recientes: ${pendingTasks
              .map((task) => `${task.title}, prioridad ${task.priority}, estado ${task.status}`)
              .join('; ')}.`
          : 'No hay tareas pendientes.',
      intent: 'pending_tasks',
      projects: projects.filter((project) => projectIds.has(project.id)),
      totalProjects,
      ...assistantResultMeta(['Supabase · tareas']),
    }
  }

  if (
    normalizedQuestion.includes('entrega') ||
    normalizedQuestion.includes('vencimiento') ||
    normalizedQuestion.includes('fecha')
  ) {
    const matches = projects
      .filter((project) => project.estimated_delivery && project.status !== 'En Producción')
      .sort((a, b) => String(a.estimated_delivery).localeCompare(String(b.estimated_delivery)))
      .slice(0, 8)

    return {
      text:
        matches.length > 0
          ? `Las próximas entregas son: ${matches
              .map((project) => `${project.name}, ${project.estimated_delivery}`)
              .join('; ')}.`
          : 'No hay fechas de entrega cargadas.',
      intent: 'upcoming_deliveries',
      projects: matches,
      totalProjects,
    }
  }

  const stopWords = new Set([
    'proyecto',
    'proyectos',
    'estado',
    'como',
    'esta',
    'estan',
    'cual',
    'cuales',
    'hay',
    'del',
    'desde',
    'para',
    'con',
    'sobre',
    'quiero',
    'saber',
    'decime',
    'pregunta',
    'consulta',
  ])
  const terms = normalizedQuestion
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stopWords.has(term))

  if (terms.length > 0) {
    const matches = projects.filter((project) => {
      const searchable = normalizeAssistantText(
        [
          project.name,
          project.description,
          project.requester_area,
          project.stack,
          project.status,
          project.priority,
          project.note,
        ]
          .filter(Boolean)
          .join(' '),
      )
      return terms.some((term) => searchable.includes(term))
    })

    if (matches.length > 0) {
      return {
        text: `Encontré ${matches.length} proyecto${matches.length === 1 ? '' : 's'} relacionado${matches.length === 1 ? '' : 's'}: ${limitedProjectNames(matches)}.`,
        intent: 'project_search',
        projects: matches.slice(0, 8),
        totalProjects,
      }
    }
  }

  const statusCounts = Object.fromEntries(
    statusFilters.map((filter) => [
      filter.status,
      projects.filter(
        (project) => normalizeAssistantText(project.status) === normalizeAssistantText(filter.status),
      ).length,
    ]),
  )

  return {
    text: `Hay ${totalProjects} proyectos. ${statusCounts['En desarrollo']} están en desarrollo, ${statusCounts.QA} en QA, ${statusCounts['En Producción']} en producción y ${statusCounts.Pausado} pausados. Podés preguntarme por un proyecto, tareas, prioridades, entregas o estados.`,
    intent: 'dashboard_summary',
    projects: [],
    totalProjects,
  }
}
