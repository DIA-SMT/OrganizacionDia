'use client'

// Lecturas y escrituras de Bandeja IA con la sesion de la persona: todo pasa por RLS
// (supabase/add_bandeja_ia.sql). Los triggers de la base firman quien toma, asigna,
// confirma o resuelve, y registran la auditoria; aca no se envia quien hizo que.

import { getSupabaseBrowserClient } from '@/lib/supabase'
import {
  auditToEvents,
  buildPeople,
  mapAsunto,
  mapNote,
  mergeRules,
  ruleToRow,
  type AsuntoRow,
  type AuditRow,
  type MemberRow,
  type NoteRow,
  type PermissionRow,
  type RuleRow,
  type SettingsRow,
} from './db'
import type { BandejaAsunto, BandejaEvent, BandejaNote, BandejaPerson, BandejaPriority, BandejaStatus, ClassificationRule } from './types'

export type BandejaSettings = {
  mailboxAddress: string | null
  gmailEnabled: boolean
  alertsEnabled: boolean
  telegramEnabled: boolean
  storeSnippets: boolean
}

export type BandejaData = {
  people: BandejaPerson[]
  asuntos: BandejaAsunto[]
  notes: BandejaNote[]
  events: BandejaEvent[]
  rules: ClassificationRule[]
  settings: BandejaSettings
}

const ASUNTO_SELECT =
  '*, bandeja_ia_asunto_messages(bandeja_ia_messages(id, gmail_message_id, gmail_thread_id, received_at, from_name, from_address, subject, snippet, label_ids, has_attachments))'
const ASUNTOS_LIMIT = 500
const AUDIT_LIMIT = 400

function client() {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

type QueryResult<T> = { data: T | null; error: { message: string } | null }

function rows<T>(result: QueryResult<T>, label: string): T {
  if (result.error) throw new Error(`No se pudo leer ${label}: ${result.error.message}`)
  return result.data as T
}

// RLS no da error cuando no deja escribir: devuelve cero filas. Se avisa igual.
function changed(result: QueryResult<{ id: string }[]>, action: string) {
  if (result.error) throw new Error(`No se pudo ${action}: ${result.error.message}`)
  if (!result.data || result.data.length === 0) throw new Error(`No se pudo ${action}: no tenés permiso o el registro ya no existe.`)
}

export async function fetchBandejaData(): Promise<BandejaData> {
  const supabase = client()
  const [members, permissions, settings, ruleRows, asuntos, notes, audit] = await Promise.all([
    supabase.from('members').select('id, full_name, email').eq('active', true),
    supabase.from('bandeja_ia_permissions').select('id, member_id, role, active, revoked_at'),
    supabase.from('bandeja_ia_settings').select('*').maybeSingle(),
    supabase.from('bandeja_ia_rules').select('*'),
    supabase.from('bandeja_ia_asuntos').select(ASUNTO_SELECT).order('created_at', { ascending: false }).limit(ASUNTOS_LIMIT),
    supabase.from('bandeja_ia_notes').select('id, asunto_id, author_member_id, body, created_at').order('created_at', { ascending: true }),
    supabase.from('bandeja_ia_audit_log').select('*').order('created_at', { ascending: false }).limit(AUDIT_LIMIT),
  ])

  const permissionRows = rows<PermissionRow[]>(permissions, 'los permisos')
  const people = buildPeople(rows<MemberRow[]>(members, 'los integrantes'), permissionRows)
  const settingsRow = rows<SettingsRow | null>(settings, 'la configuración')
  const storedRules = rows<RuleRow[]>(ruleRows, 'las reglas')

  return {
    people,
    asuntos: rows<AsuntoRow[]>(asuntos as QueryResult<AsuntoRow[]>, 'los asuntos').map(mapAsunto),
    notes: rows<NoteRow[]>(notes, 'las notas').map(mapNote),
    events: auditToEvents(rows<AuditRow[]>(audit, 'el historial'), {
      people,
      permissionMembers: new Map(permissionRows.map((row) => [row.id, row.member_id])),
      ruleNames: new Map(storedRules.map((row) => [row.id, row.name])),
    }),
    rules: mergeRules(storedRules),
    settings: {
      mailboxAddress: settingsRow?.mailbox_address ?? null,
      gmailEnabled: Boolean(settingsRow?.gmail_enabled),
      alertsEnabled: Boolean(settingsRow?.alerts_enabled),
      telegramEnabled: Boolean(settingsRow?.telegram_enabled),
      storeSnippets: Boolean(settingsRow?.store_snippets),
    },
  }
}

// Contador del sidebar: asuntos abiertos de prioridad critica o alta.
export async function countImportantPendingInDb(): Promise<number> {
  const { count, error } = await client()
    .from('bandeja_ia_asuntos')
    .select('id', { count: 'exact', head: true })
    .in('priority', ['critica', 'alta'])
    .not('status', 'in', '(resuelto,descartado)')
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function updateAsunto(id: string, patch: Record<string, unknown>, action: string) {
  changed(await client().from('bandeja_ia_asuntos').update(patch).eq('id', id).select('id'), action)
}

export function setAsuntoStatus(asunto: BandejaAsunto, status: BandejaStatus) {
  return updateAsunto(asunto.id, { status }, 'cambiar el estado')
}

export function reopenAsunto(asunto: BandejaAsunto) {
  return updateAsunto(asunto.id, { status: 'en_revision' }, 'reabrir el asunto')
}

// priority_confirmed_at fuerza al trigger a firmar la confirmacion aunque la prioridad no cambie.
export function confirmPriority(asunto: BandejaAsunto, priority: BandejaPriority) {
  return updateAsunto(
    asunto.id,
    { priority, priority_confirmed_at: new Date().toISOString(), status: asunto.status === 'nuevo' ? 'en_revision' : asunto.status },
    'confirmar la prioridad',
  )
}

export async function addNote(asuntoId: string, authorId: string, body: string) {
  const text = body.trim()
  if (!text) return
  changed(await client().from('bandeja_ia_notes').insert({ asunto_id: asuntoId, author_member_id: authorId, body: text }).select('id'), 'agregar la nota')
}

export async function resolveAsunto(asunto: BandejaAsunto, authorId: string, note: string) {
  if (note.trim()) await addNote(asunto.id, authorId, note)
  await updateAsunto(asunto.id, { status: 'resuelto' }, 'marcar como resuelto')
}

export async function saveRule(rule: ClassificationRule, order: number) {
  changed(await client().from('bandeja_ia_rules').upsert(ruleToRow(rule, order), { onConflict: 'slug' }).select('id'), 'guardar la regla')
}
