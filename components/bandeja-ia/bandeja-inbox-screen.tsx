'use client'

import { AsuntoRow } from '@/components/bandeja-ia/asunto-row'
import { BandejaShell, useBandeja } from '@/components/bandeja-ia/bandeja-shell'
import { CategoryBadge, DueLabel, EmptyState, PriorityBadge, SectionCard, StatusBadge, selectClass } from '@/components/bandeja-ia/bandeja-ui'
import { DEFAULT_FILTERS, STATUS_LABELS, filterAsuntos, receivedAt, sortForAttention, type AsuntoFilters } from '@/lib/bandeja-ia/asuntos'
import { CATEGORY_LABELS, PRIORITY_LABELS, PRIORITY_ORDER } from '@/lib/bandeja-ia/rules'
import { formatBandejaDateTime } from '@/lib/bandeja-ia/time'
import type { BandejaCategory, BandejaPriority, BandejaStatus } from '@/lib/bandeja-ia/types'
import { FilterX, Inbox, Paperclip, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

function InboxContent({ search, onSearchChange }: { search: string; onSearchChange: (value: string) => void }) {
  const { data: state } = useBandeja()
  const router = useRouter()
  const [now] = useState(() => new Date())
  const [filters, setFilters] = useState<AsuntoFilters>(DEFAULT_FILTERS)

  const visible = useMemo(() => sortForAttention(filterAsuntos(state.asuntos, filters, search)), [state.asuntos, filters, search])
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) || search.trim() !== ''

  function update<K extends keyof AsuntoFilters>(key: K, value: AsuntoFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return (
    <SectionCard
      title="Bandeja inteligente"
      icon={Inbox}
      description={`${visible.length} de ${state.asuntos.length} asuntos`}
      actions={
        filtersActive && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-semibold dia-primary-text hover:underline dark:text-blue-300"
            onClick={() => {
              setFilters(DEFAULT_FILTERS)
              onSearchChange('')
            }}
          >
            <FilterX className="h-4 w-4" />
            Limpiar filtros
          </button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        {/* En pantallas chicas el buscador del encabezado no se muestra. */}
        <label className="flex h-9 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-500 md:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
          <Search className="h-4 w-4" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-inherit" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar asunto o remitente" />
        </label>
        <select className={`${selectClass} w-full sm:w-auto`} value={filters.priority} onChange={(event) => update('priority', event.target.value as BandejaPriority | 'todas')} aria-label="Prioridad">
          <option value="todas">Todas las prioridades</option>
          {PRIORITY_ORDER.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        <select className={`${selectClass} w-full sm:w-auto`} value={filters.category} onChange={(event) => update('category', event.target.value as BandejaCategory | 'todas')} aria-label="Categoría">
          <option value="todas">Todas las categorías</option>
          {(Object.keys(CATEGORY_LABELS) as BandejaCategory[]).map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <select className={`${selectClass} w-full sm:w-auto`} value={filters.status} onChange={(event) => update('status', event.target.value as AsuntoFilters['status'])} aria-label="Estado">
          <option value="abiertos">Abiertos</option>
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as BandejaStatus[])
            .filter((status) => status !== 'asignado')
            .map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState>
          {state.asuntos.length === 0
            ? 'Todavía no hay asuntos. Se van a crear a partir de los correos cuando se conecte Gmail.'
            : 'No hay asuntos para los filtros elegidos.'}
        </EmptyState>
      ) : (
        <>
          {/* Tabla en escritorio */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-2 font-semibold">Remitente</th>
                  <th className="px-3 py-2 font-semibold">Asunto</th>
                  <th className="px-3 py-2 font-semibold">Recibido</th>
                  <th className="px-3 py-2 font-semibold">Prioridad</th>
                  <th className="px-3 py-2 font-semibold">Categoría</th>
                  <th className="px-5 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((asunto) => (
                  <tr
                    key={asunto.id}
                    className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => router.push(`/bandeja-ia/asunto/${asunto.id}`)}
                  >
                    <td className="max-w-[14rem] px-5 py-3 align-top">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{asunto.message?.fromName ?? 'Sin remitente'}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{asunto.message?.fromAddress ?? ''}</p>
                    </td>
                    <td className="max-w-[24rem] px-3 py-3 align-top">
                      {/* Link para teclado y lectores de pantalla; la fila entera es clickeable con el mouse. */}
                      <Link
                        href={`/bandeja-ia/asunto/${asunto.id}`}
                        className="line-clamp-2 font-semibold text-slate-950 hover:underline dark:text-white"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {asunto.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {asunto.message?.hasAttachments && <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-label="Con adjunto" />}
                        <DueLabel dueAt={asunto.dueAt} now={now} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-top text-slate-600 dark:text-slate-300">{formatBandejaDateTime(receivedAt(asunto))}</td>
                    <td className="px-3 py-3 align-top">
                      <PriorityBadge priority={asunto.classification.priority} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <CategoryBadge category={asunto.classification.category} />
                    </td>
                    <td className="px-5 py-3 align-top">
                      <StatusBadge status={asunto.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tarjetas en tablet y celular */}
          <ul className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">
            {visible.map((asunto, index) => (
              <AsuntoRow key={asunto.id} asunto={asunto} now={now} index={index} />
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  )
}

export function BandejaInboxScreen() {
  const [search, setSearch] = useState('')
  return (
    <BandejaShell title="Bandeja inteligente" subtitle="Asuntos detectados en la casilla institucional" search={search} onSearchChange={setSearch}>
      <InboxContent search={search} onSearchChange={setSearch} />
    </BandejaShell>
  )
}
