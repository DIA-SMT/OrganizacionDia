'use client'

import { BandejaShell, useBandeja } from '@/components/bandeja-ia/bandeja-shell'
import { EmptyState, PriorityBadge, SectionCard, StatusBadge } from '@/components/bandeja-ia/bandeja-ui'
import { CLOSED_STATUSES } from '@/lib/bandeja-ia/asuntos'
import { normalizeText } from '@/lib/bandeja-ia/rules'
import { formatBandejaDateTime } from '@/lib/bandeja-ia/time'
import type { BandejaEventType } from '@/lib/bandeja-ia/types'
import { Archive, CheckCircle2, History, KeyRound, MessageSquareText, Settings, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type HistoryFilter = 'todos' | 'resueltos' | 'acciones' | 'administracion'

const FILTERS: { value: HistoryFilter; label: string; types: BandejaEventType[] | null }[] = [
  { value: 'todos', label: 'Todo', types: null },
  { value: 'resueltos', label: 'Resueltos', types: ['resuelto', 'reabierto'] },
  { value: 'acciones', label: 'Acciones', types: ['estado', 'prioridad_confirmada', 'nota', 'creado'] },
  { value: 'administracion', label: 'Configuración', types: ['permiso', 'configuracion'] },
]

const EVENT_ICONS: Partial<Record<BandejaEventType, LucideIcon>> = {
  resuelto: CheckCircle2,
  nota: MessageSquareText,
  permiso: KeyRound,
  configuracion: Settings,
}

function HistorialContent({ search }: { search: string }) {
  const { data: state } = useBandeja()
  const [filter, setFilter] = useState<HistoryFilter>('todos')
  const types = FILTERS.find((item) => item.value === filter)?.types ?? null
  const query = normalizeText(search.trim())
  const subjects = new Map(state.asuntos.map((asunto) => [asunto.id, asunto.title]))

  const events = state.events.filter((event) => {
    if (types && !types.includes(event.type)) return false
    if (!query) return true
    return normalizeText(`${event.description} ${event.actorName} ${event.asuntoId ? subjects.get(event.asuntoId) ?? '' : ''}`).includes(query)
  })

  const closed = state.asuntos
    .filter((asunto) => CLOSED_STATUSES.includes(asunto.status))
    .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <SectionCard title="Registro de acciones" icon={History} description="Quién hizo qué y cuándo (hora de Tucumán)">
        <div className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3 [scrollbar-width:thin] dark:border-slate-800">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`h-8 shrink-0 rounded-md border px-3 text-xs font-semibold transition ${
                filter === item.value
                  ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {events.length === 0 ? (
          <EmptyState>No hay movimientos para este filtro.</EmptyState>
        ) : (
          <ol className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((event) => {
              const Icon = EVENT_ICONS[event.type] ?? History
              return (
                <li key={event.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="text-slate-700 dark:text-slate-200">{event.description}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {event.actorName} · {formatBandejaDateTime(event.createdAt)}
                      {event.asuntoId && (
                        <>
                          {' · '}
                          <Link href={`/bandeja-ia/asunto/${event.asuntoId}`} className="font-semibold dia-primary-text hover:underline dark:text-blue-300">
                            {subjects.get(event.asuntoId) ?? 'Ver asunto'}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </SectionCard>

      <SectionCard title="Asuntos cerrados" icon={Archive} description={`${closed.length} resueltos o descartados`}>
        {closed.length === 0 ? (
          <EmptyState>Todavía no se cerró ningún asunto.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {closed.map((asunto) => (
              <li key={asunto.id}>
                <Link href={`/bandeja-ia/asunto/${asunto.id}`} className="block px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={asunto.status} />
                    <PriorityBadge priority={asunto.classification.priority} />
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{asunto.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatBandejaDateTime(asunto.resolvedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}

export function BandejaHistorialScreen() {
  const [search, setSearch] = useState('')
  return (
    <BandejaShell title="Historial de Bandeja IA" subtitle="Asuntos resueltos, cambios de responsable y acciones realizadas" search={search} onSearchChange={setSearch}>
      <HistorialContent search={search} />
    </BandejaShell>
  )
}
