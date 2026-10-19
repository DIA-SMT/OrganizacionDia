'use client'

import { STATUS_LABELS } from '@/lib/bandeja-ia/asuntos'
import { CATEGORY_LABELS, PRIORITY_LABELS } from '@/lib/bandeja-ia/rules'
import { relativeDueLabel } from '@/lib/bandeja-ia/time'
import type { BandejaCategory, BandejaPriority, BandejaStatus } from '@/lib/bandeja-ia/types'
import type { LucideIcon } from 'lucide-react'

// Piezas visuales compartidas por las pantallas de Bandeja IA, con las mismas clases que
// el resto del Dashboard (tokens dia-*, variantes dark:).

export const cardClass = 'rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'
export const selectClass =
  'h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
export const secondaryButtonClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
export const primaryButtonClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md dia-primary-bg px-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'
export const textareaClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'

const PRIORITY_CLASSES: Record<BandejaPriority, string> = {
  critica: 'bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/30',
  alta: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  informativa: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
}

const STATUS_CLASSES: Record<BandejaStatus, string> = {
  nuevo: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  en_revision: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  asignado: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
  esperando_respuesta: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
  resuelto: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  descartado: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

export function PriorityBadge({ priority }: { priority: BandejaPriority }) {
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLASSES[priority]}`}>{PRIORITY_LABELS[priority]}</span>
}

export function StatusBadge({ status }: { status: BandejaStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status]}`}>{STATUS_LABELS[status]}</span>
}

export function CategoryBadge({ category }: { category: BandejaCategory }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700">
      {CATEGORY_LABELS[category]}
    </span>
  )
}

const DUE_TONES = {
  vencido: 'text-red-600 dark:text-red-300',
  hoy: 'text-amber-700 dark:text-amber-300',
  pronto: 'text-amber-600 dark:text-amber-200',
  lejos: 'text-slate-500 dark:text-slate-400',
}

export function DueLabel({ dueAt, now }: { dueAt: string | null; now: Date }) {
  if (!dueAt) return <span className="text-xs text-slate-400 dark:text-slate-500">Sin vencimiento</span>
  const due = relativeDueLabel(dueAt, now)
  return <span className={`text-xs font-semibold ${DUE_TONES[due.tone]}`}>{due.label}</span>
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'alert' | 'warn'
}) {
  const iconTone =
    tone === 'alert'
      ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300'
      : tone === 'warn'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
        : 'dia-surface-raised-bg dia-primary-text dark:bg-blue-500/15 dark:text-blue-300'
  return (
    <article className={`${cardClass} flex items-start gap-3 p-4`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <div className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      </div>
    </article>
  )
}

export function SectionCard({
  title,
  icon: Icon,
  description,
  actions,
  children,
  className = '',
}: {
  title: string
  icon?: LucideIcon
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`${cardClass} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 dia-primary-text dark:text-blue-300" />}
            <h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2>
          </div>
          {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">{children}</p>
}
