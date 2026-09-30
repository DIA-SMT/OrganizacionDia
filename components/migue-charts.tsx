'use client'

import type { MigueDailyStat, MigueSummary, MigueTopic } from '@/lib/migue'
import { CircleCheck, CircleHelp, UserRound } from 'lucide-react'
import { useState } from 'react'

// Paleta de estado (fija, nunca tematizada): siempre acompañada de icono y etiqueta.
const OUTCOME_COLORS = { resolved: '#0ca30c', handed_off: '#fab219', unanswered: '#d03b3b' }

const numberFormat = new Intl.NumberFormat('es-AR')
const percentFormat = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 })

export function formatDay(day: string) {
  const [, month, date] = day.split('-')
  return `${date}/${month}`
}

// Tope "redondo" para el eje: 0 / 50 / 100, 0 / 200 / 400...
function niceMax(value: number) {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= value) return step * magnitude
  return 10 * magnitude
}

// Tendencia de una sola serie para las tarjetas: linea de 2px con lavado del 10%.
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${30 - (value / max) * 26 - 2}`)
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-9 w-full" role="img" aria-label={label}>
      <polygon points={`0,30 ${points.join(' ')} 100,30`} className="fill-[var(--dia-primary)] opacity-10" />
      <polyline
        points={points.join(' ')}
        fill="none"
        className="stroke-[var(--dia-primary)]"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// Como terminan las conversaciones: una barra 100% con leyenda que lleva los valores.
export function OutcomeBar({ summary }: { summary: MigueSummary }) {
  const total = summary.conversations
  const parts = [
    { key: 'resolved' as const, label: 'Resueltas', value: summary.resolved, Icon: CircleCheck },
    { key: 'handed_off' as const, label: 'Derivadas a una persona', value: summary.handed_off, Icon: UserRound },
    { key: 'unanswered' as const, label: 'Sin respuesta', value: summary.unanswered, Icon: CircleHelp },
  ]

  if (total === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Sin conversaciones en el periodo.</p>

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px]" role="img" aria-label="Distribucion de como terminan las conversaciones">
        {parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <div
              key={part.key}
              className="h-full first:rounded-l last:rounded-r"
              style={{ width: `${(part.value / total) * 100}%`, backgroundColor: OUTCOME_COLORS[part.key] }}
              title={`${part.label}: ${numberFormat.format(part.value)}`}
            />
          ))}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {parts.map(({ key, label, value, Icon }) => (
          <li key={key} className="flex items-start gap-2 text-sm">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: OUTCOME_COLORS[key] }} />
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold text-slate-950 dark:text-white">
                {percentFormat.format(value / total)}
                <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden />
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {label} · {numberFormat.format(value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Conversaciones por dia: columnas de una serie, tooltip por columna y tabla equivalente.
export function DailyUsageChart({ stats }: { stats: MigueDailyStat[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = niceMax(Math.max(0, ...stats.map((row) => row.conversations)))
  const ticks = [max, max / 2, 0]
  const hoveredRow = hovered !== null ? stats[hovered] : null
  const labelIndexes = new Set([0, Math.floor((stats.length - 1) / 2), stats.length - 1])

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className="text-xs font-semibold dia-primary-text hover:underline"
          onClick={() => setAsTable((current) => !current)}
        >
          {asTable ? 'Ver grafico' : 'Ver como tabla'}
        </button>
      </div>

      {asTable ? (
        <div data-lenis-prevent className="max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Dia</th>
                <th className="px-3 py-2 text-right font-semibold">Conversaciones</th>
                <th className="px-3 py-2 text-right font-semibold">Resueltas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {[...stats].reverse().map((row) => (
                <tr key={row.day}>
                  <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{formatDay(row.day)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-950 dark:text-white">{numberFormat.format(row.conversations)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">{numberFormat.format(row.resolved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex h-40 flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400" aria-hidden>
            {ticks.map((tick) => (
              <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
                {numberFormat.format(tick)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-40" onPointerLeave={() => setHovered(null)}>
              {/* Grilla: lineas finas y solidas, un paso fuera de la superficie. */}
              {ticks.map((tick) => (
                <div
                  key={tick}
                  aria-hidden
                  className={`absolute inset-x-0 border-t ${tick === 0 ? 'border-slate-300 dark:border-slate-600' : 'border-slate-100 dark:border-slate-800'}`}
                  style={{ bottom: `${(tick / max) * 100}%` }}
                />
              ))}
              {/* Con muchas barras (90 dias) la separacion baja a 1px para que no queden hilos. */}
              <div className={`absolute inset-0 flex items-end ${stats.length > 45 ? 'gap-px' : 'gap-[2px]'}`} role="img" aria-label="Conversaciones por dia">
                {stats.map((row, index) => (
                  <div
                    key={row.day}
                    className="flex h-full min-w-0 flex-1 items-end justify-center"
                    onPointerEnter={() => setHovered(index)}
                  >
                    <div
                      className={`w-full max-w-6 rounded-t transition-[filter] ${hovered === index ? 'brightness-125' : ''}`}
                      style={{ height: `${(row.conversations / max) * 100}%`, backgroundColor: 'var(--dia-primary)' }}
                    />
                  </div>
                ))}
              </div>

              {hoveredRow && hovered !== null && (
                // En los extremos el tooltip se ancla al borde de la barra para no salirse del grafico.
                <div
                  className={`pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900 ${
                    hovered < stats.length * 0.3 ? '' : hovered > stats.length * 0.7 ? '-translate-x-full' : '-translate-x-1/2'
                  }`}
                  style={{ left: `${((hovered + 0.5) / stats.length) * 100}%` }}
                >
                  <p className="text-sm font-bold text-slate-950 dark:text-white">{numberFormat.format(hoveredRow.conversations)} conversaciones</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {formatDay(hoveredRow.day)} · {numberFormat.format(hoveredRow.resolved)} resueltas
                  </p>
                </div>
              )}
            </div>
            <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-slate-500 dark:text-slate-400" aria-hidden>
              {stats.map((row, index) =>
                labelIndexes.has(index) ? (
                  <span
                    key={row.day}
                    className={`absolute ${index === 0 ? 'left-0' : index === stats.length - 1 ? 'right-0' : '-translate-x-1/2'}`}
                    style={index !== 0 && index !== stats.length - 1 ? { left: `${((index + 0.5) / stats.length) * 100}%` } : undefined}
                  >
                    {formatDay(row.day)}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Temas mas consultados: barras horizontales de una serie, valor en la punta.
export function TopicBars({ topics }: { topics: MigueTopic[] }) {
  // Porcentaje sobre todas las conversaciones con tema del periodo, no solo sobre las 5 que se muestran.
  const total = Math.max(1, topics[0]?.total ?? 0, topics.reduce((sum, topic) => sum + topic.count, 0))
  const max = Math.max(1, ...topics.map((topic) => topic.count))
  if (topics.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Sin datos de temas.</p>
  return (
    <ul className="space-y-2.5">
      {topics.map((topic) => (
        <li key={topic.topic}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{topic.topic}</span>
            <span className="shrink-0 tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400">{percentFormat.format(topic.count / total)}</span>
          </div>
          <div className="mt-1 h-2 w-full">
            <div className="h-full rounded-r" style={{ width: `${(topic.count / max) * 100}%`, backgroundColor: 'var(--dia-primary)' }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
