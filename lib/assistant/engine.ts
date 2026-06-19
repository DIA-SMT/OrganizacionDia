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

function projectDetailText(project: AssistantProject, pendingTasks: Array<{ title: string; priority: string }>) {
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
  if (mentionedProject) {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('title, priority')
      .eq('project_id', mentionedProject.id)
      .eq('active', true)
      .neq('status', 'Terminada')
      .order('updated_at', { ascending: false })
      .limit(5)

    if (error) throw error
    const pendingTasks = (tasks ?? []) as Array<{ title: string; priority: string }>

    return {
      text: projectDetailText(mentionedProject, pendingTasks),
      intent: 'project_detail',
      projects: [mentionedProject],
      totalProjects,
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
