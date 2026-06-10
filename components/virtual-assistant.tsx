'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Bot, ExternalLink, MessageCircle, Search, Send, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

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

type AssistantMessage = {
  role: 'assistant' | 'user'
  text: string
  projects?: AssistantProject[]
}

type OpenRouterAssistantResponse = {
  answer?: string
  error?: string
}

const statusFilters = [
  { keywords: ['planificacion', 'planificación'], status: 'Planificación' },
  { keywords: ['desarrollo', 'dev'], status: 'En desarrollo' },
  { keywords: ['mvp', 'aprobado'], status: 'MVP aprobado' },
  { keywords: ['qa', 'testing', 'testeo'], status: 'QA' },
  { keywords: ['produccion', 'producción', 'finalizado', 'finalizados'], status: 'En Producción' },
  { keywords: ['pausado', 'pausados'], status: 'Pausado' },
]

const priorityFilters = ['Baja', 'Media', 'Alta', 'Critica']

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

function buildAnswer(question: string, projects: AssistantProject[]) {
  const normalizedQuestion = normalize(question)
  const statusFilter = statusFilters.find((item) => item.keywords.some((keyword) => normalizedQuestion.includes(normalize(keyword))))
  const priorityFilter = priorityFilters.find((priority) => normalizedQuestion.includes(normalize(priority)))

  let matches = projects

  if (statusFilter) matches = matches.filter((project) => project.status === statusFilter.status)
  if (priorityFilter) matches = matches.filter((project) => project.priority === priorityFilter)

  if (!statusFilter && !priorityFilter) {
    const stopWords = new Set(['proyecto', 'proyectos', 'estado', 'como', 'esta', 'estan', 'cual', 'cuales', 'hay', 'del', 'de', 'la', 'el', 'los', 'las', 'sobre'])
    const terms = normalizedQuestion
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2 && !stopWords.has(term))

    if (terms.length > 0) {
      matches = matches.filter((project) => {
        const text = normalize(projectText(project))
        return terms.some((term) => text.includes(term))
      })
    }
  }

  const limitedMatches = matches.slice(0, 6)

  if (matches.length === 0) {
    return {
      text: 'No encontre proyectos que coincidan con esa consulta. Proba preguntando por nombre, estado, prioridad o area.',
      projects: [],
    }
  }

  if (statusFilter) {
    return {
      text: `En estado ${statusFilter.status} encontre ${matches.length} proyecto${matches.length === 1 ? '' : 's'}.`,
      projects: limitedMatches,
    }
  }

  if (priorityFilter) {
    return {
      text: `Con prioridad ${priorityFilter} encontre ${matches.length} proyecto${matches.length === 1 ? '' : 's'}.`,
      projects: limitedMatches,
    }
  }

  return {
    text: `Encontre ${matches.length} proyecto${matches.length === 1 ? '' : 's'} relacionado${matches.length === 1 ? '' : 's'} con tu consulta.`,
    projects: limitedMatches,
  }
}

export function VirtualAssistant() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [projects, setProjects] = useState<AssistantProject[]>([])
  const [loading, setLoading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'assistant',
      text: 'Hola, soy el asistente DIA. Preguntame por proyectos, estados, prioridad o entregas.',
    },
  ])

  const projectCount = useMemo(() => projects.length, [projects])

  useEffect(() => {
    if (!open || projects.length > 0 || loading) return

    async function fetchProjects() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase no esta configurado.')
        return
      }

      setLoading(true)
      const { data, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, note, repository_url, repository_url_secondary')
        .eq('active', true)
        .order('name', { ascending: true })

      if (projectsError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('projects')
          .select('id, name, description, requester_area, stack, status, priority, progress, estimated_delivery, repository_url')
          .eq('active', true)
          .order('name', { ascending: true })

        if (fallbackError) {
          setError(fallbackError.message)
        } else {
          setProjects(((fallbackData ?? []) as Omit<AssistantProject, 'note' | 'repository_url_secondary'>[]).map((project) => ({ ...project, note: null, repository_url_secondary: null })))
        }
      } else {
        setProjects((data ?? []) as AssistantProject[])
      }

      setLoading(false)
    }

    fetchProjects()
  }, [loading, open, projects.length])

  async function getOpenRouterAnswer(questionText: string, matchedProjects: AssistantProject[]) {
    const response = await fetch('/api/assistant/openrouter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: questionText,
        projects: matchedProjects.length > 0 ? matchedProjects : projects,
      }),
    })

    const payload = (await response.json()) as OpenRouterAssistantResponse

    if (!response.ok || !payload.answer) {
      throw new Error(payload.error ?? 'OpenRouter no pudo responder.')
    }

    return payload.answer
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || thinking) return

    setQuestion('')
    const answer = buildAnswer(trimmedQuestion, projects)
    setMessages((current) => [
      ...current,
      { role: 'user', text: trimmedQuestion },
    ])

    setThinking(true)
    setError(null)

    try {
      const aiAnswer = await getOpenRouterAnswer(trimmedQuestion, answer.projects)
      setMessages((current) => [...current, { role: 'assistant', text: aiAnswer, projects: answer.projects }])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo conectar con OpenRouter.'
      setError(`${message} Respondo con el modo local.`)
      setMessages((current) => [...current, { role: 'assistant', text: answer.text, projects: answer.projects }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#10b981] text-white shadow-lg shadow-emerald-900/20 transition hover:-translate-y-0.5 hover:shadow-xl"
        onClick={() => setOpen(true)}
        title="Abrir asistente"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {open && (
        <section className="fixed bottom-20 right-5 z-50 flex h-[min(680px,calc(100vh-7rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#103b3a] text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950">Asistente DIA</p>
                <p className="text-xs text-slate-500">{thinking ? 'Consultando OpenRouter...' : loading ? 'Cargando proyectos...' : `${projectCount} proyectos conectados`}</p>
              </div>
            </div>
            <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} title="Cerrar asistente">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {error && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === 'user' ? 'ml-auto max-w-[86%]' : 'mr-auto max-w-[92%]'}>
                <div className={`rounded-lg px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-[#10b981] text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                  {message.text}
                </div>

                {message.projects && message.projects.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.projects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/projects?proyecto=${encodeURIComponent(project.id)}&buscar=${encodeURIComponent(project.name)}`}
                        className="block rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
                        onClick={() => setOpen(false)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-950">{project.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{project.requester_area ?? 'Sin area'} - {project.priority}</p>
                          </div>
                          <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-[#0d8f62]" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-md bg-[#e9f8f1] px-2 py-1 font-semibold text-[#08784f]">{project.status}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{project.progress ?? 0}%</span>
                          {project.estimated_delivery && <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{project.estimated_delivery}</span>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form className="border-t border-slate-200 bg-white p-3" onSubmit={handleSubmit}>
            <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ej: proyectos en QA, estado de LluvIA..."
              />
              <button type="submit" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#10b981] text-white disabled:opacity-50" disabled={loading || projects.length === 0}>
                {thinking ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </label>
          </form>
        </section>
      )}
    </>
  )
}
