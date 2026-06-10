import { createClient as createSupabaseServerClient } from '@/lib/supabase/server'

type AssistantProject = {
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
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

const statusFilters = [
  { keywords: ['planificacion', 'planificación'], normalizedStatus: 'planificacion' },
  { keywords: ['desarrollo', 'dev'], normalizedStatus: 'en desarrollo' },
  { keywords: ['mvp', 'aprobado'], normalizedStatus: 'mvp aprobado' },
  { keywords: ['qa', 'testing', 'testeo'], normalizedStatus: 'qa' },
  { keywords: ['produccion', 'producción', 'finalizado', 'finalizados'], normalizedStatus: 'en produccion' },
  { keywords: ['pausado', 'pausados'], normalizedStatus: 'pausado' },
]

const priorityFilters = ['Baja', 'Media', 'Alta', 'Critica']

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY ?? process.env.OPEN_ROUTER_API_KEY
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function projectText(project: AssistantProject) {
  return [
    project.name,
    project.description,
    project.requester_area,
    project.stack,
    project.status,
    project.priority,
    project.note,
    project.repository_url,
    project.repository_url_secondary,
  ]
    .filter(Boolean)
    .join(' ')
}

function selectRelevantProjects(question: string, projects: AssistantProject[]) {
  const normalizedQuestion = normalize(question)
  const statusFilter = statusFilters.find((item) => item.keywords.some((keyword) => normalizedQuestion.includes(normalize(keyword))))
  const priorityFilter = priorityFilters.find((priority) => normalizedQuestion.includes(normalize(priority)))

  let matches = projects
  let narrowed = false

  if (statusFilter) {
    narrowed = true
    matches = matches.filter((project) => normalize(project.status) === statusFilter.normalizedStatus)
  }

  if (priorityFilter) {
    narrowed = true
    matches = matches.filter((project) => project.priority === priorityFilter)
  }

  if (!statusFilter && !priorityFilter) {
    const stopWords = new Set(['proyecto', 'proyectos', 'estado', 'como', 'esta', 'estan', 'cual', 'cuales', 'hay', 'del', 'desde', 'para', 'con', 'de', 'la', 'el', 'los', 'las', 'sobre'])
    const terms = normalizedQuestion
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2 && !stopWords.has(term))

    if (terms.length > 0) {
      narrowed = true
      matches = matches.filter((project) => {
        const text = normalize(projectText(project))
        return terms.some((term) => text.includes(term))
      })
    }
  }

  return narrowed ? matches : projects
}

function summarizeProjects(projects: AssistantProject[]) {
  return projects
    .slice(0, 30)
    .map((project) =>
      [
        `ID: ${project.id}`,
        `Nombre: ${project.name}`,
        `Estado: ${project.status}`,
        `Prioridad: ${project.priority}`,
        `Avance: ${project.progress ?? 0}%`,
        `Area: ${project.requester_area ?? 'Sin area'}`,
        `Stack: ${project.stack ?? 'Sin stack'}`,
        `Entrega: ${project.estimated_delivery ?? 'Sin fecha'}`,
        `Descripcion: ${project.description ?? 'Sin descripcion'}`,
        `Nota: ${project.note ?? 'Sin nota'}`,
      ].join(' | '),
    )
    .join('\n')
}

async function fetchProjectsFromSupabase() {
  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    throw new Error('Faltan variables de Supabase en el servidor.')
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, note, repository_url, repository_url_secondary')
    .eq('active', true)
    .order('name', { ascending: true })

  if (!error) return (data ?? []) as AssistantProject[]

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('projects')
    .select('id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, repository_url')
    .eq('active', true)
    .order('name', { ascending: true })

  if (fallbackError) throw fallbackError

  return ((fallbackData ?? []) as Omit<AssistantProject, 'note' | 'repository_url_secondary'>[]).map((project) => ({
    ...project,
    note: null,
    repository_url_secondary: null,
  }))
}

async function fetchWithRetries(url: string, init: RequestInit, maxRetries: number) {
  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    lastResponse = await fetch(url, init)
    if (lastResponse.ok || lastResponse.status < 500) return lastResponse
  }

  if (!lastResponse) throw new Error('No se pudo conectar con OpenRouter.')
  return lastResponse
}

export async function POST(request: Request) {
  try {
    const apiKey = getOpenRouterKey()
    const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'
    const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
    const referer = process.env.OPENROUTER_HTTP_REFERER ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    const title = process.env.OPENROUTER_X_TITLE ?? 'Organizacion DIA'
    const maxRetries = Number(process.env.OPENROUTER_MAX_RETRIES ?? '1')

    if (!apiKey) {
      return Response.json({ error: 'Falta OPENROUTER_API_KEY en .env.local.' }, { status: 500 })
    }

    const body = (await request.json()) as {
      question?: string
      projects?: AssistantProject[]
    }

    const question = body.question?.trim()
    const fallbackProjects = body.projects ?? []

    if (!question) {
      return Response.json({ error: 'Falta la pregunta.' }, { status: 400 })
    }

    let serverProjects: AssistantProject[] = []
    try {
      serverProjects = await fetchProjectsFromSupabase()
    } catch (error) {
      if (fallbackProjects.length === 0) throw error
    }

    const allProjects = fallbackProjects.length > 0 ? fallbackProjects : serverProjects
    const relevantProjects = selectRelevantProjects(question, allProjects).slice(0, 8)

    if (allProjects.length === 0) {
      return Response.json({
        answer: 'No encontre proyectos cargados para responder esa consulta.',
        model,
        projects: [],
      })
    }

    if (relevantProjects.length === 0) {
      return Response.json({
        answer: 'No encontre proyectos que coincidan con esa consulta.',
        model,
        projects: [],
      })
    }

    const response = await fetchWithRetries(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer,
        'X-Title': title,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          {
            role: 'system',
            content:
              'Sos el asistente interno del dashboard DIA. Respondé en español rioplatense, breve y útil. Usá únicamente el contexto de proyectos provisto. Si mencionás proyectos, mantené los nombres exactos. No inventes datos. Si no alcanza el contexto, decilo claramente.',
          },
          {
            role: 'user',
            content: `Pregunta: ${question}\n\nProyectos relevantes:\n${summarizeProjects(relevantProjects)}`,
          },
        ],
      }),
    }, Number.isFinite(maxRetries) ? Math.max(0, maxRetries) : 1)

    const rawData = await response.text()
    const data = rawData ? (JSON.parse(rawData) as OpenRouterResponse) : {}

    if (!response.ok) {
      return Response.json({ error: data.error?.message ?? 'OpenRouter no pudo responder.' }, { status: response.status })
    }

    const answer = data.choices?.[0]?.message?.content?.trim()

    if (!answer) {
      return Response.json({ error: 'OpenRouter respondio sin contenido.' }, { status: 502 })
    }

    return Response.json({ answer, model, projects: relevantProjects })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado del asistente.'
    return Response.json({ error: message }, { status: 500 })
  }
}
