type AssistantProject = {
  name: string
  description: string | null
  requester_area: string | null
  stack: string | null
  status: string
  priority: string
  progress: number | null
  estimated_delivery: string | null
  note: string | null
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

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY ?? process.env.OPEN_ROUTER_API_KEY
}

function summarizeProjects(projects: AssistantProject[]) {
  return projects
    .slice(0, 30)
    .map((project) =>
      [
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

export async function POST(request: Request) {
  const apiKey = getOpenRouterKey()
  const model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini'

  if (!apiKey) {
    return Response.json({ error: 'Falta OPENROUTER_API_KEY en .env.local.' }, { status: 500 })
  }

  const body = (await request.json()) as {
    question?: string
    projects?: AssistantProject[]
  }

  const question = body.question?.trim()
  const projects = body.projects ?? []

  if (!question) {
    return Response.json({ error: 'Falta la pregunta.' }, { status: 400 })
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
      'X-Title': 'Organizacion DIA',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 450,
      messages: [
        {
          role: 'system',
          content:
            'Sos el asistente interno del dashboard DIA. Respondé en español rioplatense, breve y útil. Usá únicamente el contexto de proyectos provisto. Si mencionás proyectos, mantené los nombres exactos. No inventes datos.',
        },
        {
          role: 'user',
          content: `Pregunta: ${question}\n\nProyectos disponibles:\n${summarizeProjects(projects)}`,
        },
      ],
    }),
  })

  const data = (await response.json()) as OpenRouterResponse

  if (!response.ok) {
    return Response.json({ error: data.error?.message ?? 'OpenRouter no pudo responder.' }, { status: response.status })
  }

  const answer = data.choices?.[0]?.message?.content?.trim()

  if (!answer) {
    return Response.json({ error: 'OpenRouter respondio sin contenido.' }, { status: 502 })
  }

  return Response.json({ answer, model })
}
