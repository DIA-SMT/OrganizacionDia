// Modelo de dominio de Bandeja IA. Los mismos valores (en minuscula, sin tildes) son los
// que valida supabase/add_bandeja_ia.sql, asi la UI y la base hablan el mismo idioma.

export type BandejaPriority = 'critica' | 'alta' | 'normal' | 'informativa'

export type BandejaCategory =
  | 'invitacion'
  | 'reunion'
  | 'fecha_limite'
  | 'solicitud_respuesta'
  | 'documentacion'
  | 'informativo'

export type BandejaStatus = 'nuevo' | 'en_revision' | 'asignado' | 'esperando_respuesta' | 'resuelto' | 'descartado'

// El estado 'asignado' queda por compatibilidad con la base; la interfaz ya no maneja responsables.
// admin: configura reglas. operador: gestiona asuntos (estado, prioridad, notas). lector: solo mira.
export type BandejaRole = 'admin' | 'operador' | 'lector'

export type DetectedDateKind = 'fecha_limite' | 'reunion' | 'mencion'

export type DetectedDate = {
  // Dia calendario en America/Argentina/Tucuman (YYYY-MM-DD).
  date: string
  time: string | null
  kind: DetectedDateKind
  // Fragmento del asunto o del extracto que origino la deteccion.
  source: string
}

export type ClassificationResult = {
  priority: BandejaPriority
  category: BandejaCategory
  reasons: string[]
  detectedDates: DetectedDate[]
  requiresResponse: boolean
}

// Integrante del equipo DIA (tabla members) con su permiso de Bandeja IA, si tiene.
export type BandejaPerson = {
  id: string
  name: string
  email: string | null
  // null = sin permiso (o revocado): no puede entrar al modulo.
  role: BandejaRole | null
  permissionId: string | null
}

// Solo metadatos: remitente, asunto, fecha y un extracto corto. Nunca el cuerpo ni adjuntos.
export type BandejaMessage = {
  id: string
  threadId: string
  fromName: string
  fromAddress: string
  subject: string
  snippet: string | null
  receivedAt: string | null
  hasAttachments: boolean
  labels: string[]
}

export type BandejaEventType =
  | 'creado'
  | 'estado'
  | 'prioridad_confirmada'
  | 'nota'
  | 'resuelto'
  | 'reabierto'
  | 'permiso'
  | 'configuracion'

export type BandejaEvent = {
  id: string
  asuntoId: string | null
  type: BandejaEventType
  actorName: string
  description: string
  createdAt: string
}

export type BandejaNote = {
  id: string
  asuntoId: string
  authorId: string | null
  body: string
  createdAt: string
}

export type BandejaAsunto = {
  id: string
  title: string
  summary: string | null
  // Mensaje mas reciente de la conversacion (null si el asunto no tiene mensajes vinculados).
  message: BandejaMessage | null
  messageCount: number
  classification: ClassificationResult
  // Prioridad que sugirieron las reglas, antes de cualquier correccion humana.
  suggestedPriority: BandejaPriority | null
  // null hasta que una persona confirma (o corrige) la prioridad.
  priorityConfirmedById: string | null
  priorityConfirmedAt: string | null
  status: BandejaStatus
  dueAt: string | null
  createdAt: string
  resolvedAt: string | null
}

export type ClassificationRule = {
  id: string
  name: string
  description: string
  field: 'subject' | 'from' | 'snippet' | 'subject_snippet'
  // Palabras o frases; la regla aplica si aparece cualquiera (sin distinguir tildes ni mayusculas).
  keywords: string[]
  // Si aparece alguna de estas frases la regla no aplica (ej: "no responder").
  excludeKeywords?: string[]
  category?: BandejaCategory
  priority?: BandejaPriority
  requiresResponse?: boolean
  active: boolean
}
