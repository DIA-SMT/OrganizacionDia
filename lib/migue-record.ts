import type { AssistantIntent } from '@/lib/assistant/engine'
import { parseMigueConversation } from '@/lib/migue-ingest'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

// Migue DIA vive en este repo (el chat del dashboard): registra directo en la base,
// con el mismo formato y validacion que usan los Migues externos.
export const MIGUE_DIA_SLUG = 'dashboard-dia'

export const INTENT_TOPICS: Record<AssistantIntent, string> = {
  project_detail: 'Detalle de proyecto',
  project_members: 'Responsables de proyecto',
  project_commits: 'Commits de un proyecto',
  recent_commits: 'Commits recientes',
  work_summary: 'Resumen de trabajo',
  completed_tasks: 'Tareas terminadas',
  expedientes: 'Expedientes',
  team_overview: 'Equipo',
  project_documents: 'Documentos de proyecto',
  priority_overview: 'Prioridades',
  priority_projects: 'Proyectos por prioridad',
  status_projects: 'Proyectos por estado',
  pending_tasks: 'Tareas pendientes',
  upcoming_deliveries: 'Proximas entregas',
  dashboard_summary: 'Resumen general',
  project_search: 'Busqueda de proyectos',
}

let warnedMissingServiceRole = false

// Nunca rompe la respuesta al usuario: si falta la service role o la migracion, solo avisa en el log.
export async function recordMigueConversation(migueSlug: string, conversation: Record<string, unknown>) {
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    if (!warnedMissingServiceRole) {
      warnedMissingServiceRole = true
      console.warn('Migue: falta SUPABASE_SERVICE_ROLE_KEY en el servidor, no se registran conversaciones.')
    }
    return
  }

  const parsed = parseMigueConversation(conversation, migueSlug, Date.now())
  if (!parsed.ok) {
    console.warn(`Migue ${migueSlug}: conversacion descartada (${parsed.error})`)
    return
  }

  const { error } = await supabase.from('migue_conversations').upsert(parsed.row, { onConflict: 'migue_slug,external_id' })
  if (error) console.warn(`Migue ${migueSlug}: no se pudo registrar la conversacion (${error.message})`)
}
