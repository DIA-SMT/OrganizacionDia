'use client'

import { BandejaShell, useBandeja } from '@/components/bandeja-ia/bandeja-shell'
import {
  CategoryBadge,
  DueLabel,
  EmptyState,
  PriorityBadge,
  SectionCard,
  StatusBadge,
  cardClass,
  secondaryButtonClass,
  selectClass,
  textareaClass,
} from '@/components/bandeja-ia/bandeja-ui'
import { canOperate } from '@/lib/bandeja-ia/access'
import { STATUS_LABELS, isOpen, personName, receivedAt } from '@/lib/bandeja-ia/asuntos'
import {
  addNote,
  confirmPriority,
  reopenAsunto,
  resolveAsunto,
  setAsuntoStatus,
} from '@/lib/bandeja-ia/repository'
import { PRIORITY_LABELS, PRIORITY_ORDER } from '@/lib/bandeja-ia/rules'
import { runBandejaAction } from '@/lib/bandeja-ia/store'
import { formatBandejaDateTime, formatBandejaDay } from '@/lib/bandeja-ia/time'
import type { BandejaPriority, BandejaStatus, DetectedDateKind } from '@/lib/bandeja-ia/types'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Hand,
  History,
  Mail,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  ScrollText,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const DATE_KIND_LABELS: Record<DetectedDateKind, string> = {
  fecha_limite: 'Fecha límite',
  reunion: 'Reunión / evento',
  mencion: 'Mención',
}

const OPEN_STATUSES: BandejaStatus[] = ['nuevo', 'en_revision', 'esperando_respuesta']

function AsuntoContent({ id }: { id: string }) {
  const { data, role, actor } = useBandeja()
  const [now] = useState(() => new Date())
  const [priorityChoice, setPriorityChoice] = useState<BandejaPriority | ''>('')
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const asunto = data.asuntos.find((item) => item.id === id)
  const notes = data.notes.filter((item) => item.asuntoId === id)
  const events = data.events.filter((event) => event.asuntoId === id)
  const editable = canOperate(role)

  if (!asunto) {
    return (
      <div className={`${cardClass} p-6 text-sm text-slate-500 dark:text-slate-400`}>
        <p>No se encontró el asunto, o no tenés acceso a él.</p>
        <Link href="/bandeja-ia/bandeja" className={`${secondaryButtonClass} mt-3`}>
          <ArrowLeft className="h-4 w-4" />
          Volver a la bandeja
        </Link>
      </div>
    )
  }

  const current = asunto
  const open = isOpen(current)
  const selectedPriority = priorityChoice || current.classification.priority
  const confirmedBy = current.priorityConfirmedById ? personName(data.people, current.priorityConfirmedById) : null

  async function run(action: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(true)
    const error = await runBandejaAction(action)
    setBusy(false)
    setFeedback(error ? { ok: false, text: error } : { ok: true, text: success })
    if (!error) after?.()
  }

  return (
    <div className="space-y-5">
      <Link href="/bandeja-ia/bandeja" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" />
        Bandeja
      </Link>

      <section className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={current.classification.priority} />
          <StatusBadge status={current.status} />
          <CategoryBadge category={current.classification.category} />
          {current.messageCount > 1 && <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{current.messageCount} mensajes</span>}
        </div>
        <h2 className="mt-3 text-lg font-bold text-slate-950 sm:text-xl dark:text-white">{current.title}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Remitente</dt>
            <dd className="truncate text-slate-700 dark:text-slate-200">{current.message?.fromName ?? 'Sin mensaje vinculado'}</dd>
            {current.message && <dd className="truncate text-xs text-slate-500 dark:text-slate-400">{current.message.fromAddress}</dd>}
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recibido</dt>
            <dd className="text-slate-700 dark:text-slate-200">{formatBandejaDateTime(receivedAt(current))}</dd>
            {current.message?.hasAttachments && (
              <dd className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Paperclip className="h-3 w-3" />
                Tiene adjuntos (no se procesan)
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vencimiento</dt>
            <dd className="text-slate-700 dark:text-slate-200">{current.dueAt ? formatBandejaDateTime(current.dueAt) : '—'}</dd>
            <dd>
              <DueLabel dueAt={current.dueAt} now={now} />
            </dd>
          </div>
        </dl>
      </section>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.ok
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
          }`}
          role="status"
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <SectionCard title="Resumen" icon={ScrollText} description="A partir de metadatos. El cuerpo y los adjuntos no se procesan con IA.">
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="leading-6 text-slate-700 dark:text-slate-200">{current.summary || 'Sin resumen.'}</p>
              {current.message?.snippet && (
                <blockquote className="rounded-md border-l-4 border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
                  <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
                    <Mail className="h-3 w-3" />
                    Extracto
                  </span>
                  {current.message.snippet}
                </blockquote>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Motivo de la prioridad"
            icon={Gauge}
            description={
              confirmedBy
                ? `Confirmada por ${confirmedBy}${current.priorityConfirmedAt ? ` el ${formatBandejaDateTime(current.priorityConfirmedAt)}` : ''}`
                : 'Sugerida por las reglas: falta confirmación humana'
            }
          >
            {current.classification.reasons.length === 0 ? (
              <EmptyState>Sin motivos registrados.</EmptyState>
            ) : (
              <ul className="list-disc space-y-1 py-4 pl-10 pr-5 text-sm text-slate-600 dark:text-slate-300">
                {current.classification.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {current.suggestedPriority && current.suggestedPriority !== current.classification.priority && (
              <p className="px-5 pb-3 text-xs text-slate-500 dark:text-slate-400">Las reglas sugerían {PRIORITY_LABELS[current.suggestedPriority].toLowerCase()}.</p>
            )}
            {editable && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                <select
                  className={selectClass}
                  value={selectedPriority}
                  onChange={(event) => setPriorityChoice(event.target.value as BandejaPriority)}
                  aria-label="Prioridad a confirmar"
                >
                  {PRIORITY_ORDER.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={busy}
                  onClick={() => void run(() => confirmPriority(current, selectedPriority), 'Prioridad confirmada.', () => setPriorityChoice(''))}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {selectedPriority === current.classification.priority ? 'Confirmar prioridad' : 'Corregir prioridad'}
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Fechas detectadas" icon={CalendarDays} description="Interpretadas en hora de Tucumán">
            {current.classification.detectedDates.length === 0 ? (
              <EmptyState>No se detectaron fechas en el asunto ni en el extracto.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {current.classification.detectedDates.map((date) => (
                  <li key={date.date} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className="font-semibold text-slate-900 first-letter:uppercase dark:text-slate-100">
                      {formatBandejaDay(date.date, { weekday: true })}
                      {date.time ? ` · ${date.time} hs` : ''}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold dark:bg-slate-800">{DATE_KIND_LABELS[date.kind]}</span>
                      {date.source && `“${date.source}”`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Notas" icon={MessageSquareText}>
            {notes.length === 0 ? (
              <EmptyState>Sin notas todavía.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {notes.map((item) => (
                  <li key={item.id} className="px-5 py-3 text-sm">
                    <p className="whitespace-pre-line text-slate-700 dark:text-slate-200">{item.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {personName(data.people, item.authorId)} · {formatBandejaDateTime(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {editable && (
              <form
                className="space-y-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(() => addNote(current.id, actor.id, note), 'Nota agregada.', () => setNote(''))
                }}
              >
                <textarea className={textareaClass} rows={2} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Agregar una nota interna" aria-label="Nueva nota" />
                <button type="submit" className={secondaryButtonClass} disabled={!note.trim() || busy}>
                  Agregar nota
                </button>
              </form>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Gestión" icon={Hand} description={editable ? undefined : 'Tu rol es de solo lectura.'}>
            <div className="space-y-4 px-5 py-4">
              {open ? (
                <>
                  {editable && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="estado">
                        Estado
                      </label>
                      <select
                        id="estado"
                        className={`${selectClass} w-full`}
                        value={current.status}
                        disabled={busy}
                        onChange={(event) => void run(() => setAsuntoStatus(current, event.target.value as BandejaStatus), 'Estado actualizado.')}
                      >
                        {OPEN_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                        <option value="descartado">{STATUS_LABELS.descartado}</option>
                      </select>
                    </div>
                  )}

                  {editable && (
                    <form
                      className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void run(() => resolveAsunto(current, actor.id, resolution), 'Asunto marcado como resuelto.', () => setResolution(''))
                      }}
                    >
                      <textarea
                        className={textareaClass}
                        rows={2}
                        maxLength={4000}
                        value={resolution}
                        onChange={(event) => setResolution(event.target.value)}
                        placeholder="Cómo se resolvió (opcional, queda como nota)"
                        aria-label="Detalle de la resolución"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar como resuelto
                      </button>
                    </form>
                  )}

                  {!editable && <p className="text-sm text-slate-500 dark:text-slate-400">Podés ver el asunto pero no tomarlo, asignarlo ni resolverlo.</p>}
                </>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-slate-600 dark:text-slate-300">
                    {STATUS_LABELS[current.status]} el {formatBandejaDateTime(current.resolvedAt)}.
                  </p>
                  {editable && (
                    <button type="button" className={`${secondaryButtonClass} w-full`} disabled={busy} onClick={() => void run(() => reopenAsunto(current), 'Asunto reabierto.')}>
                      <RotateCcw className="h-4 w-4" />
                      Reabrir
                    </button>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Historial de gestiones" icon={History}>
            {events.length === 0 ? (
              <EmptyState>Sin movimientos.</EmptyState>
            ) : (
              <ol className="space-y-3 px-5 py-4">
                {events.map((event) => (
                  <li key={event.id} className="relative border-l-2 border-slate-200 pl-3 text-sm dark:border-slate-700">
                    <p className="text-slate-700 dark:text-slate-200">{event.description}</p>
                    <p className="text-xs text-slate-400">
                      {event.actorName} · {formatBandejaDateTime(event.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export function BandejaAsuntoScreen({ id }: { id: string }) {
  return (
    <BandejaShell title="Detalle del asunto" subtitle="Resumen, prioridad, responsable y seguimiento">
      <AsuntoContent id={id} />
    </BandejaShell>
  )
}
