'use client'

import { EmptyState, SectionCard, secondaryButtonClass } from '@/components/bandeja-ia/bandeja-ui'
import { buildEmailDocument } from '@/lib/bandeja-ia/gmail/message-body'
import { formatBandejaDateTime } from '@/lib/bandeja-ia/time'
import { ChevronDown, ChevronRight, ExternalLink, ImageOff, Image as ImageIcon, Mail, Paperclip, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type EmailMessage = {
  id: string
  from: string
  to: string
  cc: string
  date: string | null
  subject: string
  html: string | null
  text: string | null
  attachments: { filename: string; mimeType: string; size: number }[]
  sentByMailbox: boolean
}

type EmailResponse = { gmailUrl?: string; messages?: EmailMessage[]; error?: string }

const REMOTE_IMAGE = /<img[^>]+src=["']?https?:|url\(\s*["']?https?:/i

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

// Texto plano con los links clickeables (solo http/https, abren en otra pestana).
function PlainText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g)
  return (
    <div className="whitespace-pre-wrap break-words rounded-md bg-white p-4 font-sans text-sm leading-6 text-slate-800">
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </div>
  )
}

// El correo en un iframe aislado: sin scripts (sandbox sin allow-scripts), sin acceso al
// Dashboard, links en otra pestana y CSP que bloquea lo externo salvo que se pida.
function EmailFrame({ html, allowRemoteImages, title }: { html: string; allowRemoteImages: boolean; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(240)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    let observer: ResizeObserver | null = null
    const measure = () => {
      const doc = element.contentDocument
      if (!doc?.documentElement) return
      setHeight(Math.max(120, doc.documentElement.scrollHeight))
      if (!observer && doc.body) {
        observer = new ResizeObserver(() => setHeight(Math.max(120, doc.documentElement.scrollHeight)))
        observer.observe(doc.body)
      }
    }
    element.addEventListener('load', measure)
    measure()
    return () => {
      element.removeEventListener('load', measure)
      observer?.disconnect()
    }
  }, [html, allowRemoteImages])

  return (
    <iframe
      ref={frame}
      title={title}
      className="w-full rounded-md border-0 bg-white"
      style={{ height }}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={buildEmailDocument(html, { allowRemoteImages })}
    />
  )
}

function MessageCard({ message, expanded, onToggle, allowRemoteImages }: { message: EmailMessage; expanded: boolean; onToggle: () => void; allowRemoteImages: boolean }) {
  return (
    <article className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 px-5 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50" aria-expanded={expanded}>
        {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{message.from || 'Sin remitente'}</span>
            {message.sentByMailbox && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">Enviado desde la casilla</span>
            )}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{formatBandejaDateTime(message.date)}</span>
        </span>
        {message.attachments.length > 0 && <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="Con adjuntos" />}
      </button>

      {expanded && (
        <div className="space-y-3 px-5 pb-4">
          <dl className="grid gap-x-3 gap-y-0.5 text-xs text-slate-500 sm:grid-cols-[auto_1fr] dark:text-slate-400">
            <dt className="font-semibold">Para</dt>
            <dd className="break-words">{message.to || '—'}</dd>
            {message.cc && (
              <>
                <dt className="font-semibold">CC</dt>
                <dd className="break-words">{message.cc}</dd>
              </>
            )}
            <dt className="font-semibold">Asunto</dt>
            <dd className="break-words">{message.subject}</dd>
          </dl>

          <div className="overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
            {message.html ? (
              <EmailFrame html={message.html} allowRemoteImages={allowRemoteImages} title={`Correo de ${message.from}`} />
            ) : message.text ? (
              <PlainText text={message.text} />
            ) : (
              <p className="bg-white p-4 text-sm text-slate-500">El mensaje no tiene texto.</p>
            )}
          </div>

          {message.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {message.attachments.map((attachment, index) => (
                <li
                  key={`${attachment.filename}-${index}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                >
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{attachment.filename}</span>
                  <span className="shrink-0 text-slate-400">{formatSize(attachment.size)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

export function EmailView({ asuntoId, summary }: { asuntoId: string; summary: string | null }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data: EmailResponse | null }>({ status: 'loading', data: null })
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [allowRemoteImages, setAllowRemoteImages] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(`/api/bandeja-ia/asuntos/${encodeURIComponent(asuntoId)}/correo`, { cache: 'no-store' })
        const payload = (await response.json()) as EmailResponse
        if (cancelled) return
        setState({ status: response.ok ? 'ready' : 'error', data: payload })
        // Como en Gmail: el ultimo mensaje abierto, los anteriores plegados.
        const last = payload.messages?.at(-1)
        if (last) setExpanded(new Set([last.id]))
      } catch {
        if (!cancelled) setState({ status: 'error', data: { error: 'No se pudo contactar al servidor.' } })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [asuntoId, version])

  const messages = state.data?.messages ?? []
  const gmailUrl = state.data?.gmailUrl
  const hasRemoteImages = messages.some((message) => message.html && REMOTE_IMAGE.test(message.html))

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <SectionCard
      title="Correo"
      icon={Mail}
      description={messages.length > 1 ? `${messages.length} mensajes en la conversación` : 'Leído de Gmail en el momento; no se guarda en el Dashboard.'}
      actions={
        <>
          {hasRemoteImages && (
            <button type="button" className={secondaryButtonClass} onClick={() => setAllowRemoteImages((current) => !current)}>
              {allowRemoteImages ? <ImageOff className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              {allowRemoteImages ? 'Ocultar imágenes' : 'Mostrar imágenes'}
            </button>
          )}
          {gmailUrl && (
            <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>
              <ExternalLink className="h-4 w-4" />
              Abrir en Gmail
            </a>
          )}
        </>
      }
    >
      {summary && <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">{summary}</p>}

      {state.status === 'loading' && <EmptyState>Leyendo el correo desde Gmail...</EmptyState>}

      {state.status === 'error' && (
        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-red-600 dark:text-red-300">{state.data?.error ?? 'No se pudo leer el correo.'}</p>
          <button type="button" className={secondaryButtonClass} onClick={() => setVersion((current) => current + 1)}>
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      )}

      {state.status === 'ready' && messages.length === 0 && <EmptyState>La conversación no tiene mensajes.</EmptyState>}

      {state.status === 'ready' && hasRemoteImages && !allowRemoteImages && (
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Las imágenes externas están ocultas: suelen avisarle al remitente que el correo se abrió.
        </p>
      )}

      {state.status === 'ready' &&
        messages.map((message) => (
          <MessageCard key={message.id} message={message} expanded={expanded.has(message.id)} onToggle={() => toggle(message.id)} allowRemoteImages={allowRemoteImages} />
        ))}
    </SectionCard>
  )
}
