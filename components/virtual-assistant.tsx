'use client'

import { Bot, Database, ExternalLink, MessageCircle, Search, Send, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

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
  sources?: string[]
  updatedAt?: string
}

type AssistantResponse = {
  text?: string
  error?: string
  projects?: AssistantProject[]
  totalProjects?: number
  sources?: string[]
  updatedAt?: string
}

export function VirtualAssistant() {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'assistant',
      text: 'Hola, soy el asistente DIA. Puedo consultar proyectos, tareas, commits, responsables, expedientes, documentos, prioridades y entregas.',
    },
  ])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, open, thinking])

  async function getAssistantAnswer(questionText: string) {
    const response = await fetch('/api/assistant/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: questionText }),
    })

    const payload = (await response.json()) as AssistantResponse
    if (!response.ok || !payload.text) {
      throw new Error(payload.error ?? 'El asistente DIA no pudo responder.')
    }

    return payload
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || thinking) return

    setQuestion('')
    setMessages((current) => [...current, { role: 'user', text: trimmedQuestion }])
    setThinking(true)
    setError(null)

    try {
      const assistantResponse = await getAssistantAnswer(trimmedQuestion)
      if (typeof assistantResponse.totalProjects === 'number') {
        setProjectCount(assistantResponse.totalProjects)
      }
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: assistantResponse.text ?? 'No pude responder esa consulta.',
          projects: assistantResponse.projects,
          sources: assistantResponse.sources,
          updatedAt: assistantResponse.updatedAt,
        },
      ])
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'No se pudo consultar el motor DIA.'
      setError(message)
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: 'No pude completar la consulta. Intentá nuevamente.' },
      ])
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full dia-primary-bg text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:shadow-xl"
        onClick={() => setOpen(true)}
        title="Abrir asistente"
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {open && (
        <section data-lenis-prevent className="fixed bottom-20 right-5 z-50 flex h-[min(680px,calc(100vh-7rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md dia-primary-bg text-white shadow-lg shadow-blue-500/20">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-950">Asistente DIA</p>
                <p className="text-xs text-slate-500">
                  {thinking
                    ? 'Consultando motor DIA...'
                    : projectCount === null
                      ? 'Motor interno conectado'
                      : `${projectCount} proyectos conectados`}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setOpen(false)}
              title="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={messagesContainerRef} data-lenis-prevent className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-contain bg-slate-50 px-4 py-4">
            {error && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {error}
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === 'user' ? 'ml-auto max-w-[86%]' : 'mr-auto max-w-[92%]'}
              >
                <div
                  className={`rounded-lg px-3 py-2 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'dia-primary-bg text-white'
                      : 'border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {message.text}
                </div>

                {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[10px] font-medium text-slate-400">
                    <Database className="h-3 w-3" />
                    <span>{message.sources.join(' · ')}</span>
                    {message.updatedAt && <span>Actualizado {new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.updatedAt))}</span>}
                  </div>
                )}

                {message.projects && message.projects.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.projects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/projects?proyecto=${encodeURIComponent(project.id)}&buscar=${encodeURIComponent(project.name)}`}
                        className="block rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
                        onClick={() => setOpen(false)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-950">{project.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {project.requester_area ?? 'Sin área'} - {project.priority}
                            </p>
                          </div>
                          <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 dia-primary-text" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-md dia-surface-raised-bg px-2 py-1 font-semibold dia-primary-text">
                            {project.status}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                            {project.progress ?? 0}%
                          </span>
                          {project.estimated_delivery && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                              {project.estimated_delivery}
                            </span>
                          )}
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
                placeholder="Ej: qué proyectos requieren atención..."
              />
              <button
                type="submit"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md dia-primary-bg text-white disabled:opacity-50"
                disabled={thinking || !question.trim()}
              >
                {thinking ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </label>
          </form>
        </section>
      )}
    </>
  )
}
