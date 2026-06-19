import { getSupabaseAdminClient } from '@/lib/supabase/admin'

type AlexaAction =
  | 'dashboard_summary'
  | 'get_project'
  | 'list_projects'
  | 'list_pending_tasks'
  | 'ask_assistant'
  | 'create_project'
  | 'create_task'

type AlexaRequest = {
  action?: AlexaAction
  payload?: Record<string, unknown>
}

type ProjectRow = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  stack: string | null
  status: string
  priority: string
  progress: number
  estimated_delivery: string | null
  note: string | null
  repository_url: string | null
  repository_url_secondary: string | null
  production_url: string | null
}

const projectStatuses = ['Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado'] as const
const priorities = ['Baja', 'Media', 'Alta', 'Critica'] as const

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function textValue(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return typeof value === 'string' ? value.trim() : ''
}

function allowedAlexaUsers() {
  return (process.env.ALEXA_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function authorize(request: Request) {
  const configuredSecret = process.env.ALEXA_API_SECRET
  const authorization = request.headers.get('authorization')
  const alexaUserId = request.headers.get('x-alexa-user-id')?.trim() ?? ''

  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return { ok: false as const, status: 401, error: 'Solicitud de Alexa no autorizada.' }
  }

  const allowedUsers = allowedAlexaUsers()
  if (allowedUsers.length > 0 && !allowedUsers.includes(alexaUserId)) {
    return { ok: false as const, status: 403, error: 'Usuario Alexa no autorizado.' }
  }

  return {
    ok: true as const,
    alexaUserId: alexaUserId || 'sin-identificar',
    requestId: request.headers.get('x-alexa-request-id')?.trim() || crypto.randomUUID(),
  }
}

async function findProject(projects: ProjectRow[], requestedName: string) {
  const target = normalize(requestedName)
  if (!target) return null

  const exact = projects.find((project) => normalize(project.name) === target)
  if (exact) return exact

  const compactTarget = target.replace(/\s+/g, '')
  return (
    projects.find((project) => normalize(project.name).includes(target)) ??
    projects.find((project) => target.includes(normalize(project.name))) ??
    projects.find((project) => normalize(project.name).replace(/\s+/g, '').includes(compactTarget)) ??
    projects.find((project) =>
      project.name
        .split(/[-_/]+/)
        .map((part) => normalize(part).replace(/\s+/g, ''))
        .some((alias) => alias.length >= 4 && (alias.includes(compactTarget) || compactTarget.includes(alias))),
    ) ??
    null
  )
}

function projectSummary(project: ProjectRow, pendingTasks: number) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    requesterArea: project.requester_area,
    stack: project.stack,
    status: project.status,
    priority: project.priority,
    progress: project.progress,
    estimatedDelivery: project.estimated_delivery,
    note: project.note,
    repositoryUrl: project.repository_url,
    repositoryUrlSecondary: project.repository_url_secondary,
    productionUrl: project.production_url,
    pendingTasks,
  }
}

function findMentionedProject(projects: ProjectRow[], question: string) {
  const normalizedQuestion = normalize(question)
  const compactQuestion = normalizedQuestion.replace(/\s+/g, '')
  const ignoredNameTerms = new Set(['proyecto', 'proyectos', 'sistema', 'dashboard', 'pagina', 'aplicacion'])

  const matches = projects
    .map((project) => {
      const normalizedName = normalize(project.name)
      const compactName = normalizedName.replace(/\s+/g, '')
      const aliases = project.name
        .split(/[-_/]+/)
        .map((part) => normalize(part).replace(/\s+/g, ''))
        .filter((part) => part.length >= 4)

      let score = 0
      if (normalizedQuestion.includes(normalizedName)) score = normalizedName.length + 100
      if (compactQuestion.includes(compactName)) score = Math.max(score, compactName.length + 90)

      for (const alias of aliases) {
        if (compactQuestion.includes(alias)) score = Math.max(score, alias.length + 50)
      }

      const nameTerms = normalizedName
        .split(/\s+/)
        .filter((term) => term.length >= 4 && !ignoredNameTerms.has(term))
      const matchedTerms = nameTerms.filter((term) => normalizedQuestion.includes(term))
      if (matchedTerms.length > 0) {
        score = Math.max(score, matchedTerms.reduce((total, term) => total + term.length, 0))
      }

      return { project, score }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)

  return matches[0]?.project ?? null
}

async function answerAssistantQuestion(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  projects: ProjectRow[],
  question: string,
) {
  const normalizedQuestion = normalize(question)

  if (normalizedQuestion.includes('priorizar') || normalizedQuestion.includes('prioridad') || normalizedQuestion.includes('atencion')) {
    const urgent = projects
      .filter((project) => ['Alta', 'Critica'].includes(project.priority) && normalize(project.status) !== 'en produccion')
      .sort((a, b) => (a.priority === 'Critica' ? -1 : b.priority === 'Critica' ? 1 : a.progress - b.progress))
      .slice(0, 6)

    if (urgent.length === 0) return 'No hay proyectos activos con prioridad alta o critica.'
    return `Los proyectos que requieren mas atencion son: ${urgent
      .map((project) => `${project.name}, prioridad ${project.priority}, estado ${project.status}, avance ${project.progress}%`)
      .join('; ')}.`
  }

  const mentionedProject = findMentionedProject(projects, question)

  if (mentionedProject) {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('title, status, priority, due_date')
      .eq('project_id', mentionedProject.id)
      .eq('active', true)
      .neq('status', 'Terminada')
      .order('updated_at', { ascending: false })
      .limit(5)

    if (error) throw error

    const details = [
      `${mentionedProject.name} esta en ${mentionedProject.status}`,
      `tiene prioridad ${mentionedProject.priority}`,
      `y un avance del ${mentionedProject.progress}%`,
    ]
    if (mentionedProject.estimated_delivery) details.push(`La entrega estimada es ${mentionedProject.estimated_delivery}`)
    if (mentionedProject.note) details.push(`La nota actual dice: ${mentionedProject.note}`)
    if (mentionedProject.description) details.push(`Su descripcion es: ${mentionedProject.description}`)

    const pendingTasks = tasks ?? []
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

    return details.join('. ') + '.'
  }

  if (normalizedQuestion.includes('paus')) {
    const paused = projects.filter((project) => project.status === 'Pausado')
    if (paused.length === 0) return 'No hay proyectos pausados.'
    return `Hay ${paused.length} proyectos pausados: ${paused.map((project) => project.name).join(', ')}.`
  }

  if (normalizedQuestion.includes('produccion') || normalizedQuestion.includes('terminad') || normalizedQuestion.includes('finaliz')) {
    const production = projects.filter((project) => project.status === 'En Producción')
    if (production.length === 0) return 'No hay proyectos en produccion.'
    return `Hay ${production.length} proyectos en produccion: ${production.map((project) => project.name).join(', ')}.`
  }

  if (normalizedQuestion.includes('tarea')) {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('title, status, priority, projects(name)')
      .eq('active', true)
      .neq('status', 'Terminada')
      .order('updated_at', { ascending: false })
      .limit(8)

    if (error) throw error
    if (!tasks?.length) return 'No hay tareas pendientes.'
    return `Hay ${tasks.length} tareas pendientes recientes: ${tasks
      .map((task) => `${task.title}, prioridad ${task.priority}`)
      .join('; ')}.`
  }

  const statusCounts = Object.fromEntries(
    projectStatuses.map((status) => [status, projects.filter((project) => project.status === status).length]),
  )
  return `Hay ${projects.length} proyectos. ${statusCounts['En desarrollo']} estan en desarrollo, ${statusCounts.QA} en QA, ${statusCounts['En Producción']} en produccion y ${statusCounts.Pausado} pausados. Podes preguntarme por un proyecto, por prioridades, tareas o estados.`
}

async function audit(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  values: {
    requestId: string
    alexaUserId: string
    action: AlexaAction
    payload: Record<string, unknown>
    success: boolean
    response?: Record<string, unknown>
    error?: string
  },
) {
  await supabase.from('alexa_activity_log').upsert(
    {
      request_id: values.requestId,
      alexa_user_id: values.alexaUserId,
      action: values.action,
      payload: values.payload,
      success: values.success,
      response: values.response ?? null,
      error: values.error ?? null,
    },
    { onConflict: 'request_id', ignoreDuplicates: true },
  )
}

export async function POST(request: Request) {
  const auth = authorize(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' }, { status: 500 })
  }

  let body: AlexaRequest
  try {
    body = (await request.json()) as AlexaRequest
  } catch {
    return Response.json({ error: 'El cuerpo de la solicitud no es válido.' }, { status: 400 })
  }

  const action = body.action
  const payload = body.payload ?? {}
  if (!action) return Response.json({ error: 'Falta action.' }, { status: 400 })

  const { data: previousLog } = await supabase
    .from('alexa_activity_log')
    .select('success, response, error')
    .eq('request_id', auth.requestId)
    .maybeSingle()

  if (previousLog) {
    return Response.json(
      previousLog.success ? previousLog.response : { error: previousLog.error ?? 'La operación anterior falló.' },
      { status: previousLog.success ? 200 : 409 },
    )
  }

  try {
    const { data: projectData, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, note, repository_url, repository_url_secondary, production_url')
      .eq('active', true)
      .order('name')

    if (projectsError) throw projectsError
    const projects = (projectData ?? []) as ProjectRow[]

    let response: Record<string, unknown>

    if (action === 'dashboard_summary') {
      const { data: taskData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('active', true)
        .neq('status', 'Terminada')

      if (tasksError) throw tasksError

      response = {
        totalProjects: projects.length,
        pendingTasks: taskData?.length ?? 0,
        projectsByStatus: Object.fromEntries(
          projectStatuses.map((status) => [status, projects.filter((project) => project.status === status).length]),
        ),
      }
    } else if (action === 'get_project') {
      const requestedName = textValue(payload, 'projectName')
      const project = await findProject(projects, requestedName)
      if (!project) throw new Error(`No encontré el proyecto ${requestedName || 'solicitado'}.`)

      const { count, error: countError } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('active', true)
        .neq('status', 'Terminada')

      if (countError) throw countError
      response = { project: projectSummary(project, count ?? 0) }
    } else if (action === 'list_projects') {
      const requestedStatus = textValue(payload, 'status')
      const requestedPriority = textValue(payload, 'priority')
      const filtered = projects.filter((project) => {
        const statusMatches = !requestedStatus || normalize(project.status) === normalize(requestedStatus)
        const priorityMatches = !requestedPriority || normalize(project.priority) === normalize(requestedPriority)
        return statusMatches && priorityMatches
      })

      response = {
        count: filtered.length,
        projects: filtered.slice(0, 20).map((project) => ({
          id: project.id,
          name: project.name,
          status: project.status,
          priority: project.priority,
          progress: project.progress,
        })),
      }
    } else if (action === 'list_pending_tasks') {
      const requestedProject = textValue(payload, 'projectName')
      const project = requestedProject ? await findProject(projects, requestedProject) : null
      if (requestedProject && !project) throw new Error(`No encontré el proyecto ${requestedProject}.`)

      let query = supabase
        .from('tasks')
        .select('id, title, description, status, priority, due_date, projects(name)')
        .eq('active', true)
        .neq('status', 'Terminada')
        .order('updated_at', { ascending: false })
        .limit(20)

      if (project) query = query.eq('project_id', project.id)
      const { data, error } = await query
      if (error) throw error

      response = { count: data?.length ?? 0, tasks: data ?? [] }
    } else if (action === 'ask_assistant') {
      const question = textValue(payload, 'question')
      if (!question) throw new Error('Falta la pregunta para el asistente.')
      response = { answer: await answerAssistantQuestion(supabase, projects, question) }
    } else if (action === 'create_project') {
      const name = textValue(payload, 'name')
      if (!name) throw new Error('Falta el nombre del proyecto.')

      const requestedStatus = textValue(payload, 'status') || 'Planificación'
      const status = projectStatuses.find((value) => normalize(value) === normalize(requestedStatus))
      if (!status) throw new Error('El estado indicado no es válido.')

      const requestedPriority = textValue(payload, 'priority') || 'Media'
      const priority = priorities.find((value) => normalize(value) === normalize(requestedPriority))
      if (!priority) throw new Error('La prioridad indicada no es válida.')

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name,
          description: textValue(payload, 'description') || null,
          requester_area: textValue(payload, 'requesterArea') || null,
          status,
          priority,
          progress: 0,
        })
        .select('id, name, status, priority')
        .single()

      if (error) throw error
      response = { created: true, project: data }
    } else if (action === 'create_task') {
      const title = textValue(payload, 'title')
      const requestedProject = textValue(payload, 'projectName')
      if (!title) throw new Error('Falta el título de la tarea.')
      if (!requestedProject) throw new Error('Falta el proyecto de la tarea.')

      const project = await findProject(projects, requestedProject)
      if (!project) throw new Error(`No encontré el proyecto ${requestedProject}.`)

      const requestedPriority = textValue(payload, 'priority') || 'Media'
      const priority = priorities.find((value) => normalize(value) === normalize(requestedPriority))
      if (!priority) throw new Error('La prioridad indicada no es válida.')

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title,
          description: textValue(payload, 'description') || null,
          type: textValue(payload, 'type') || 'Feature',
          status: 'Pendiente',
          priority,
          due_date: textValue(payload, 'dueDate') || null,
        })
        .select('id, title, status, priority')
        .single()

      if (error) throw error
      response = { created: true, projectName: project.name, task: data }
    } else {
      return Response.json({ error: 'Acción no soportada.' }, { status: 400 })
    }

    await audit(supabase, {
      requestId: auth.requestId,
      alexaUserId: auth.alexaUserId,
      action,
      payload,
      success: true,
      response,
    })

    return Response.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado al procesar Alexa.'

    await audit(supabase, {
      requestId: auth.requestId,
      alexaUserId: auth.alexaUserId,
      action,
      payload,
      success: false,
      error: message,
    })

    return Response.json({ error: message }, { status: 400 })
  }
}
