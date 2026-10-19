// Selectores y filtros sobre los asuntos ya cargados de la base. Funciones puras.
// Sin responsables: en la oficina todos entran con la cuenta de la DIA y se reparten los dias.

import { normalizeText, priorityWeight } from './rules.ts'
import { addDaysToKey, tucumanDateKey } from './time.ts'
import type { BandejaAsunto, BandejaCategory, BandejaPerson, BandejaPriority, BandejaStatus } from './types.ts'

export const STATUS_LABELS: Record<BandejaStatus, string> = {
  nuevo: 'Nuevo',
  en_revision: 'En revisión',
  asignado: 'Asignado',
  esperando_respuesta: 'Esperando respuesta',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
}

export const CLOSED_STATUSES: BandejaStatus[] = ['resuelto', 'descartado']

export function isOpen(asunto: Pick<BandejaAsunto, 'status'>): boolean {
  return !CLOSED_STATUSES.includes(asunto.status)
}

export function isImportant(asunto: Pick<BandejaAsunto, 'classification'>): boolean {
  return asunto.classification.priority === 'critica' || asunto.classification.priority === 'alta'
}

export function countImportantPending(asuntos: BandejaAsunto[]): number {
  return asuntos.filter((asunto) => isOpen(asunto) && isImportant(asunto)).length
}

// Fecha de llegada: la del mensaje mas reciente, o la de alta del asunto.
export function receivedAt(asunto: Pick<BandejaAsunto, 'message' | 'createdAt'>): string {
  return asunto.message?.receivedAt ?? asunto.createdAt
}

// Vencidos y los que vencen dentro de `days` dias (hora de Tucuman).
export function upcomingDue(asuntos: BandejaAsunto[], now: Date, days = 7): BandejaAsunto[] {
  const limit = addDaysToKey(tucumanDateKey(now), days)
  return asuntos
    .filter((asunto) => isOpen(asunto) && asunto.dueAt && tucumanDateKey(new Date(asunto.dueAt)) <= limit)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
}

export function sortForAttention(asuntos: BandejaAsunto[]): BandejaAsunto[] {
  return [...asuntos].sort((a, b) => {
    const priority = priorityWeight(b.classification.priority) - priorityWeight(a.classification.priority)
    if (priority !== 0) return priority
    if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt)
    if (a.dueAt !== b.dueAt) return a.dueAt ? -1 : 1
    return receivedAt(b).localeCompare(receivedAt(a))
  })
}

export type AsuntoFilters = {
  priority: BandejaPriority | 'todas'
  category: BandejaCategory | 'todas'
  status: BandejaStatus | 'abiertos' | 'todos'
}

export const DEFAULT_FILTERS: AsuntoFilters = { priority: 'todas', category: 'todas', status: 'abiertos' }

export function filterAsuntos(asuntos: BandejaAsunto[], filters: AsuntoFilters, search: string): BandejaAsunto[] {
  const query = normalizeText(search.trim())
  return asuntos.filter((asunto) => {
    if (filters.priority !== 'todas' && asunto.classification.priority !== filters.priority) return false
    if (filters.category !== 'todas' && asunto.classification.category !== filters.category) return false
    if (filters.status === 'abiertos' && !isOpen(asunto)) return false
    if (filters.status !== 'abiertos' && filters.status !== 'todos' && asunto.status !== filters.status) return false
    if (!query) return true
    const haystack = [
      asunto.title,
      asunto.message?.fromName ?? '',
      asunto.message?.fromAddress ?? '',
      asunto.summary ?? '',
    ].join(' ')
    return normalizeText(haystack).includes(query)
  })
}

// Nombre de quien escribio una nota o confirmo una prioridad (members.full_name).
export function personName(people: BandejaPerson[], id: string | null | undefined): string {
  if (!id) return 'Sistema'
  return people.find((person) => person.id === id)?.name ?? 'Integrante'
}
