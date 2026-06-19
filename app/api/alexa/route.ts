import {
  findAssistantProject,
  normalizeAssistantText,
  runAssistantQuery,
  type AssistantProject,
} from '@/lib/assistant/engine'
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

const projectStatuses = ['Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado'] as const
const priorities = ['Baja', 'Media', 'Alta', 'Critica'] as const

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

function projectSummary(project: AssistantProject, pendingTasks: number) {
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
      .select(
        'id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, note, repository_url, repository_url_secondary, production_url',
      )
      .eq('active', true)
      .order('name')

    if (projectsError) throw projectsError
    const projects = (projectData ?? []) as AssistantProject[]
    let response: Record<string, unknown>

    if (action === 'dashboard_summary') {
      const result = await runAssistantQuery(supabase, 'dame un resumen del dashboard')
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
        .neq('status', 'Terminada')

      if (error) throw error
      response = {
        answer: result.text,
        totalProjects: result.totalProjects,
        pendingTasks: count ?? 0,
        projectsByStatus: Object.fromEntries(
          projectStatuses.map((status) => [status, projects.filter((project) => project.status === status).length]),
        ),
      }
    } else if (action === 'get_project') {
      const requestedName = textValue(payload, 'projectName')
      const project = findAssistantProject(projects, requestedName)
      if (!project) throw new Error(`No encontré el proyecto ${requestedName || 'solicitado'}.`)

      const result = await runAssistantQuery(supabase, `cómo está ${project.name}`)
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('active', true)
        .neq('status', 'Terminada')

      if (error) throw error
      response = { answer: result.text, project: projectSummary(project, count ?? 0) }
    } else if (action === 'list_projects') {
      const requestedStatus = textValue(payload, 'status')
      const requestedPriority = textValue(payload, 'priority')
      const filtered = projects.filter((project) => {
        const statusMatches =
          !requestedStatus ||
          normalizeAssistantText(project.status) === normalizeAssistantText(requestedStatus)
        const priorityMatches =
          !requestedPriority ||
          normalizeAssistantText(project.priority) === normalizeAssistantText(requestedPriority)
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
      const project = requestedProject ? findAssistantProject(projects, requestedProject) : null
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
      const result = await runAssistantQuery(supabase, question)
      response = { answer: result.text, intent: result.intent, projects: result.projects }
    } else if (action === 'create_project') {
      const name = textValue(payload, 'name')
      if (!name) throw new Error('Falta el nombre del proyecto.')

      const requestedStatus = textValue(payload, 'status') || 'Planificación'
      const status = projectStatuses.find(
        (value) => normalizeAssistantText(value) === normalizeAssistantText(requestedStatus),
      )
      if (!status) throw new Error('El estado indicado no es válido.')

      const requestedPriority = textValue(payload, 'priority') || 'Media'
      const priority = priorities.find(
        (value) => normalizeAssistantText(value) === normalizeAssistantText(requestedPriority),
      )
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

      const project = findAssistantProject(projects, requestedProject)
      if (!project) throw new Error(`No encontré el proyecto ${requestedProject}.`)

      const requestedPriority = textValue(payload, 'priority') || 'Media'
      const priority = priorities.find(
        (value) => normalizeAssistantText(value) === normalizeAssistantText(requestedPriority),
      )
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
