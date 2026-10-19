// Conversion entre filas de Supabase (supabase/add_bandeja_ia.sql) y el modelo de la app.
// Funciones puras: no consultan la base, asi se pueden testear sin red.

import { DEFAULT_RULES, PRIORITY_LABELS } from './rules.ts'
import type {
  BandejaAsunto,
  BandejaCategory,
  BandejaEvent,
  BandejaEventType,
  BandejaMessage,
  BandejaNote,
  BandejaPerson,
  BandejaPriority,
  BandejaRole,
  BandejaStatus,
  ClassificationRule,
  DetectedDate,
} from './types.ts'

export type MemberRow = { id: string; full_name: string | null; email: string | null }

export type PermissionRow = { id: string; member_id: string; role: string; active: boolean; revoked_at: string | null }

export type SettingsRow = {
  mailbox_address: string | null
  gmail_enabled: boolean
  alerts_enabled: boolean
  telegram_enabled: boolean
  store_snippets: boolean
}

export type RuleRow = {
  id: string
  slug: string
  name: string
  description: string | null
  field: string
  keywords: string[]
  exclude_keywords: string[]
  // Columna de update_bandeja_ia_v3.sql: puede faltar si no se aplico.
  from_keywords?: string[] | null
  category: string | null
  priority: string | null
  requires_response: boolean
  sort_order: number
  active: boolean
}

export type MessageRow = {
  id: string
  gmail_message_id: string
  gmail_thread_id: string
  received_at: string | null
  from_name: string
  from_address: string
  subject: string
  snippet: string | null
  label_ids: string[] | null
  has_attachments: boolean
}

export type AsuntoRow = {
  id: string
  title: string
  summary: string | null
  category: string
  priority: string
  suggested_priority: string | null
  priority_reasons: string[] | null
  priority_confirmed_by: string | null
  priority_confirmed_at: string | null
  status: string
  requires_response: boolean
  detected_dates: unknown
  due_at: string | null
  resolved_at: string | null
  created_at: string
  bandeja_ia_asunto_messages?: { bandeja_ia_messages: MessageRow | null }[] | null
}

export type NoteRow = { id: string; asunto_id: string; author_member_id: string | null; body: string; created_at: string }

export type AuditRow = {
  id: number
  actor_member_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ROLES: BandejaRole[] = ['admin', 'operador', 'lector']
const PRIORITIES: BandejaPriority[] = ['critica', 'alta', 'normal', 'informativa']
const CATEGORIES: BandejaCategory[] = ['base_pausa', 'invitacion', 'reunion', 'fecha_limite', 'solicitud_respuesta', 'documentacion', 'informativo']
const STATUSES: BandejaStatus[] = ['nuevo', 'en_revision', 'asignado', 'esperando_respuesta', 'resuelto', 'descartado']
const CLOSED: BandejaStatus[] = ['resuelto', 'descartado']

const STATUS_TEXT: Record<BandejaStatus, string> = {
  nuevo: 'Nuevo',
  en_revision: 'En revisión',
  asignado: 'Asignado',
  esperando_respuesta: 'Esperando respuesta',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
}

const ROLE_TEXT: Record<BandejaRole, string> = { admin: 'Administración', operador: 'Operador', lector: 'Lectura' }

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

export function isActivePermission(row: Pick<PermissionRow, 'active' | 'revoked_at'>): boolean {
  return row.active && !row.revoked_at
}

// Integrantes de DIA (RLS de members ya filtra el equipo) con su permiso vigente, si tienen.
export function buildPeople(members: MemberRow[], permissions: PermissionRow[]): BandejaPerson[] {
  const byMember = new Map(permissions.map((row) => [row.member_id, row]))
  return members
    .map((member) => {
      const permission = byMember.get(member.id)
      const active = permission && isActivePermission(permission)
      return {
        id: member.id,
        name: member.full_name?.trim() || member.email || 'Integrante',
        email: member.email,
        role: active ? oneOf<BandejaRole>(permission.role, ROLES, 'lector') : null,
        permissionId: permission?.id ?? null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

function mapMessage(row: MessageRow): BandejaMessage {
  return {
    id: row.id,
    threadId: row.gmail_thread_id,
    fromName: row.from_name || row.from_address,
    fromAddress: row.from_address,
    subject: row.subject,
    snippet: row.snippet,
    receivedAt: row.received_at,
    hasAttachments: row.has_attachments,
    labels: row.label_ids ?? [],
  }
}

function mapDetectedDates(value: unknown): DetectedDate[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .filter((item) => typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date as string))
    .map((item) => ({
      date: item.date as string,
      time: typeof item.time === 'string' ? item.time : null,
      kind: oneOf(item.kind, ['fecha_limite', 'reunion', 'mencion'] as const, 'mencion'),
      source: typeof item.source === 'string' ? item.source : '',
    }))
}

export function mapAsunto(row: AsuntoRow): BandejaAsunto {
  const messages = (row.bandeja_ia_asunto_messages ?? [])
    .map((link) => link.bandeja_ia_messages)
    .filter((message): message is MessageRow => Boolean(message))
    .sort((a, b) => (b.received_at ?? '').localeCompare(a.received_at ?? ''))
  const priority = oneOf<BandejaPriority>(row.priority, PRIORITIES, 'normal')

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    message: messages[0] ? mapMessage(messages[0]) : null,
    messageCount: messages.length,
    classification: {
      priority,
      category: oneOf<BandejaCategory>(row.category, CATEGORIES, 'informativo'),
      reasons: row.priority_reasons ?? [],
      detectedDates: mapDetectedDates(row.detected_dates),
      requiresResponse: row.requires_response,
    },
    suggestedPriority: row.suggested_priority ? oneOf<BandejaPriority>(row.suggested_priority, PRIORITIES, priority) : null,
    priorityConfirmedById: row.priority_confirmed_by,
    priorityConfirmedAt: row.priority_confirmed_at,
    status: oneOf<BandejaStatus>(row.status, STATUSES, 'nuevo'),
    dueAt: row.due_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}

export function mapNote(row: NoteRow): BandejaNote {
  return { id: row.id, asuntoId: row.asunto_id, authorId: row.author_member_id, body: row.body, createdAt: row.created_at }
}

function mapRule(row: RuleRow): ClassificationRule {
  return {
    id: row.slug,
    name: row.name,
    description: row.description ?? '',
    field: oneOf(row.field, ['subject', 'from', 'snippet', 'subject_snippet'] as const, 'subject_snippet'),
    keywords: row.keywords ?? [],
    excludeKeywords: row.exclude_keywords?.length ? row.exclude_keywords : undefined,
    fromKeywords: row.from_keywords?.length ? row.from_keywords : undefined,
    category: row.category ? oneOf<BandejaCategory>(row.category, CATEGORIES, 'informativo') : undefined,
    priority: row.priority ? oneOf<BandejaPriority>(row.priority, PRIORITIES, 'normal') : undefined,
    requiresResponse: row.requires_response || undefined,
    active: row.active,
  }
}

// Las reglas por defecto viven en el codigo; la base guarda las que alguien guardo o cambio.
export function mergeRules(rows: RuleRow[], defaults: ClassificationRule[] = DEFAULT_RULES): ClassificationRule[] {
  const stored = new Map(rows.map((row) => [row.slug, row]))
  const merged = defaults.map((rule) => (stored.has(rule.id) ? mapRule(stored.get(rule.id)!) : rule))
  const extra = rows
    .filter((row) => !defaults.some((rule) => rule.id === row.slug))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(mapRule)
  return [...merged, ...extra]
}

export function ruleToRow(rule: ClassificationRule, order: number): Omit<RuleRow, 'id'> {
  return {
    slug: rule.id,
    name: rule.name,
    description: rule.description,
    field: rule.field,
    keywords: rule.keywords,
    exclude_keywords: rule.excludeKeywords ?? [],
    from_keywords: rule.fromKeywords ?? [],
    category: rule.category ?? null,
    priority: rule.priority ?? null,
    requires_response: Boolean(rule.requiresResponse),
    sort_order: order,
    active: rule.active,
  }
}

type Change = { antes: unknown; despues: unknown }

function change(details: Record<string, unknown> | null, key: string): Change | null {
  const value = details?.[key]
  if (!value || typeof value !== 'object' || !('despues' in value)) return null
  return value as Change
}

export type AuditContext = {
  people: BandejaPerson[]
  // Para resolver a que se refiere un update, que en la auditoria solo trae las columnas cambiadas.
  permissionMembers: Map<string, string>
  ruleNames: Map<string, string>
}

function nameOf(context: AuditContext, id: unknown): string {
  if (typeof id !== 'string' || !id) return 'Integrante'
  return context.people.find((person) => person.id === id)?.name ?? 'Integrante'
}

// Traduce la auditoria (bandeja_ia_audit_log) a eventos legibles. Un update que cambia varias
// columnas genera un evento por cada cambio relevante; las columnas derivadas se ignoran.
export function auditToEvents(rows: AuditRow[], context: AuditContext): BandejaEvent[] {
  const events: BandejaEvent[] = []

  for (const row of rows) {
    const actorName = row.actor_member_id ? nameOf(context, row.actor_member_id) : 'Sistema'
    const push = (suffix: string, type: BandejaEventType, description: string, asuntoId: string | null = null) =>
      events.push({ id: `${row.id}-${suffix}`, asuntoId, type, actorName, description, createdAt: row.created_at })
    const details = row.details ?? {}

    if (row.entity_type === 'bandeja_ia_asuntos') {
      const asuntoId = row.entity_id
      if (row.action === 'insert') {
        push('creado', 'creado', 'Asunto creado', asuntoId)
        continue
      }
      if (row.action !== 'update') continue

      const status = change(details, 'status')
      if (status) {
        const before = oneOf<BandejaStatus>(status.antes, STATUSES, 'nuevo')
        const after = oneOf<BandejaStatus>(status.despues, STATUSES, 'nuevo')
        if (after === 'resuelto') push('estado', 'resuelto', 'Marcado como resuelto', asuntoId)
        else if (CLOSED.includes(before) && !CLOSED.includes(after)) push('estado', 'reabierto', 'Asunto reabierto', asuntoId)
        else if (after === 'descartado') push('estado', 'estado', 'Descartado (no requiere gestión)', asuntoId)
        else push('estado', 'estado', `Estado: ${STATUS_TEXT[before]} → ${STATUS_TEXT[after]}`, asuntoId)
      }

      const priority = change(details, 'priority')
      if (priority) {
        const before = oneOf<BandejaPriority>(priority.antes, PRIORITIES, 'normal')
        const after = oneOf<BandejaPriority>(priority.despues, PRIORITIES, 'normal')
        push('prioridad', 'prioridad_confirmada', `Prioridad corregida: ${PRIORITY_LABELS[before]} → ${PRIORITY_LABELS[after]}`, asuntoId)
      } else if (change(details, 'priority_confirmed_at') && row.actor_member_id) {
        push('prioridad', 'prioridad_confirmada', 'Prioridad confirmada', asuntoId)
      }
      continue
    }

    if (row.entity_type === 'bandeja_ia_notes' && row.action === 'insert') {
      push('nota', 'nota', 'Agregó una nota', typeof details.asunto_id === 'string' ? details.asunto_id : null)
      continue
    }

    if (row.entity_type === 'bandeja_ia_permissions') {
      const memberId = typeof details.member_id === 'string' ? details.member_id : context.permissionMembers.get(row.entity_id ?? '')
      const who = nameOf(context, memberId)
      if (row.action === 'insert') {
        push('permiso', 'permiso', `Permiso otorgado a ${who}: ${ROLE_TEXT[oneOf<BandejaRole>(details.role, ROLES, 'lector')]}`)
      } else if (row.action === 'update') {
        const active = change(details, 'active')
        const role = change(details, 'role')
        if (active && active.despues === false) push('permiso', 'permiso', `Permiso revocado a ${who}`)
        else if (active && active.despues === true) push('permiso', 'permiso', `Permiso reactivado a ${who}`)
        if (role) {
          push('rol', 'permiso', `Permiso de ${who}: ${ROLE_TEXT[oneOf<BandejaRole>(role.antes, ROLES, 'lector')]} → ${ROLE_TEXT[oneOf<BandejaRole>(role.despues, ROLES, 'lector')]}`)
        }
      } else {
        push('permiso', 'permiso', `Permiso eliminado de ${who}`)
      }
      continue
    }

    if (row.entity_type === 'bandeja_ia_rules') {
      const name = typeof details.name === 'string' ? details.name : context.ruleNames.get(row.entity_id ?? '') ?? 'de clasificación'
      const active = row.action === 'insert' ? details.active : change(details, 'active')?.despues
      if (typeof active === 'boolean') push('regla', 'configuracion', `Regla "${name}" ${active ? 'activada' : 'desactivada'}`)
      else push('regla', 'configuracion', `Regla "${name}" actualizada`)
      continue
    }

    if (row.entity_type === 'bandeja_ia_settings' && row.action === 'update') {
      push('config', 'configuracion', `Configuración actualizada (${Object.keys(details).join(', ')})`)
    }
  }

  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
