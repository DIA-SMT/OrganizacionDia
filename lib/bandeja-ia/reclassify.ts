// Reclasificacion de asuntos existentes con las reglas actuales (por ejemplo, despues de
// agregar la regla de Supabase). Funcion pura: la ruta /api/bandeja-ia/reclasificar la
// aplica con service role, asi un cambio automatico no queda como confirmacion humana.

import { classifyMessage, dueDateFromClassification } from './rules.ts'
import { tucumanDateTimeToIso } from './time.ts'
import type { BandejaCategory, BandejaPriority, ClassificationRule } from './types.ts'

export type ReclassifyAsunto = {
  category: BandejaCategory
  priority: BandejaPriority
  priority_confirmed_at: string | null
  due_at: string | null
}

export type ReclassifyMessage = {
  subject: string
  snippet: string | null
  from_name: string
  from_address: string
  received_at: string | null
}

export function reclassifyPatch(asunto: ReclassifyAsunto, message: ReclassifyMessage, rules: ClassificationRule[], now: Date): Record<string, unknown> | null {
  const receivedAt = message.received_at ? new Date(message.received_at) : now
  const result = classifyMessage(
    { subject: message.subject, snippet: message.snippet ?? '', fromName: message.from_name, fromAddress: message.from_address },
    receivedAt,
    rules,
  )
  const patch: Record<string, unknown> = {}

  // La categoria se actualiza siempre: ordena el panel y no pisa ninguna decision humana.
  if (result.category !== asunto.category) patch.category = result.category

  // La prioridad solo si nadie la confirmo o corrigio a mano.
  if (!asunto.priority_confirmed_at && result.priority !== asunto.priority) {
    patch.priority = result.priority
    patch.suggested_priority = result.priority
    patch.priority_reasons = result.reasons
    patch.requires_response = result.requiresResponse
  }

  if (!asunto.due_at) {
    const due = dueDateFromClassification(result)
    if (due) patch.due_at = tucumanDateTimeToIso(due.date, due.time)
  }

  return Object.keys(patch).length > 0 ? patch : null
}
