// Clasificacion por reglas locales sobre METADATOS (remitente, asunto y extracto corto).
// No lee cuerpos ni adjuntos y no llama a ninguna IA externa: todo corre en el servidor o
// en el navegador con estas reglas, que se pueden auditar y ajustar desde Configuracion.

import { addDaysToKey, tucumanDateKey, weekdayOfKey } from './time.ts'
import type { BandejaCategory, BandejaMessage, BandejaPriority, ClassificationResult, ClassificationRule, DetectedDate } from './types.ts'

export const PRIORITY_ORDER: BandejaPriority[] = ['critica', 'alta', 'normal', 'informativa']

export const PRIORITY_LABELS: Record<BandejaPriority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  normal: 'Normal',
  informativa: 'Informativa',
}

export const CATEGORY_LABELS: Record<BandejaCategory, string> = {
  invitacion: 'Invitación',
  reunion: 'Reunión',
  fecha_limite: 'Fecha límite',
  solicitud_respuesta: 'Requiere respuesta',
  documentacion: 'Documentación',
  informativo: 'Informativo',
}

export function priorityWeight(priority: BandejaPriority): number {
  return PRIORITY_ORDER.length - PRIORITY_ORDER.indexOf(priority)
}

function maxPriority(a: BandejaPriority, b: BandejaPriority): BandejaPriority {
  return priorityWeight(a) >= priorityWeight(b) ? a : b
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Reglas por defecto. El orden importa solo para la categoria: gana la primera que aplica.
export const DEFAULT_RULES: ClassificationRule[] = [
  {
    id: 'urgente',
    name: 'Urgencia explícita',
    description: 'El asunto pide atención inmediata.',
    field: 'subject',
    keywords: ['urgente', 'urgencia', 'inmediato', 'hoy mismo', 'impostergable'],
    priority: 'critica',
    requiresResponse: true,
    active: true,
  },
  {
    id: 'autoridades',
    name: 'Autoridades',
    description: 'Lo envía o menciona a autoridades del municipio.',
    field: 'subject_snippet',
    keywords: ['intendencia', 'intendente', 'secretario', 'secretaría general', 'jefatura de gabinete', 'concejo deliberante'],
    priority: 'alta',
    active: true,
  },
  {
    id: 'plazo',
    name: 'Fecha límite',
    description: 'Menciona un plazo, vencimiento o fecha de entrega.',
    field: 'subject_snippet',
    keywords: ['plazo', 'vence', 'vencimiento', 'fecha límite', 'antes del', 'hasta el', 'entrega'],
    category: 'fecha_limite',
    priority: 'alta',
    requiresResponse: true,
    active: true,
  },
  {
    id: 'invitacion',
    name: 'Invitación',
    description: 'Invitaciones a eventos, jornadas o actos.',
    field: 'subject_snippet',
    keywords: ['invitación', 'invita', 'invitamos', 'invitarlos', 'invitarles', 'jornada', 'acto', 'congreso', 'evento', 'capacitación'],
    category: 'invitacion',
    priority: 'normal',
    requiresResponse: true,
    active: true,
  },
  {
    id: 'reunion',
    name: 'Reunión',
    description: 'Convocatorias a reuniones o mesas de trabajo.',
    field: 'subject_snippet',
    keywords: ['reunión', 'convocatoria', 'convocamos', 'mesa de trabajo', 'encuentro', 'videollamada', 'meet'],
    category: 'reunion',
    priority: 'alta',
    requiresResponse: true,
    active: true,
  },
  {
    id: 'respuesta',
    name: 'Solicitud de respuesta',
    description: 'Piden una respuesta, confirmación o informe.',
    field: 'subject_snippet',
    keywords: ['solicita', 'solicitamos', 'solicitud', 'confirmar', 'confirmación', 'responder', 'informe', 'pedido', 'requerimiento', 'requerimos'],
    excludeKeywords: ['no responder', 'no requiere respuesta'],
    category: 'solicitud_respuesta',
    priority: 'normal',
    requiresResponse: true,
    active: true,
  },
  {
    id: 'documentacion',
    name: 'Documentación',
    description: 'Envío de notas, expedientes o documentos.',
    field: 'subject_snippet',
    keywords: ['expediente', 'nota', 'documento', 'resolución', 'decreto', 'adjunto'],
    category: 'documentacion',
    priority: 'normal',
    active: true,
  },
  {
    id: 'informativo',
    name: 'Boletines y avisos',
    description: 'Newsletters, boletines y avisos automáticos.',
    field: 'subject_snippet',
    keywords: ['newsletter', 'boletín', 'novedades', 'no responder', 'no-reply', 'noreply', 'suscripción'],
    category: 'informativo',
    priority: 'informativa',
    active: true,
  },
]

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

const WEEKDAYS: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 }

const DEADLINE_HINT = /(plazo|vence|vencimiento|limite|antes del|hasta el|entrega)/
const MEETING_HINT = /(reunion|convocatoria|mesa de trabajo|encuentro|videollamada|jornada|acto)/

function pad(value: number) {
  return String(value).padStart(2, '0')
}

// Si el mes ya paso, la fecha sin anio se refiere al anio siguiente (ej: "10/01" leido en diciembre).
function resolveYear(month: number, day: number, todayKey: string, explicitYear?: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const [currentYear] = todayKey.split('-').map(Number)
  let year = explicitYear ?? currentYear
  if (year < 100) year += 2000
  let key = `${year}-${pad(month)}-${pad(day)}`
  if (!explicitYear && key < addDaysToKey(todayKey, -60)) key = `${year + 1}-${pad(month)}-${pad(day)}`
  // Descarta fechas imposibles como 31/02.
  const [y, m, d] = key.split('-').map(Number)
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCMonth() !== m - 1) return null
  return key
}

function findTime(text: string): string | null {
  const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(hs|h|horas)?\b/) ?? text.match(/\b([01]?\d|2[0-3])\s*(hs|horas)\b/)
  if (!match) return null
  const minutes = match[2] && /^\d{2}$/.test(match[2]) ? match[2] : '00'
  return `${pad(Number(match[1]))}:${minutes}`
}

function kindFor(context: string): DetectedDate['kind'] {
  if (DEADLINE_HINT.test(context)) return 'fecha_limite'
  if (MEETING_HINT.test(context)) return 'reunion'
  return 'mencion'
}

// Detecta fechas en texto en espanol: "15/10", "15-10-2026", "15 de octubre", "hoy",
// "manana", "el viernes". Siempre relativo al dia actual en Tucuman.
export function detectDates(rawText: string, now: Date): DetectedDate[] {
  const text = normalizeText(rawText)
  const todayKey = tucumanDateKey(now)
  const found = new Map<string, DetectedDate>()
  const time = findTime(text)

  function add(date: string | null, source: string, index: number) {
    if (!date || found.has(date)) return
    // El tipo de fecha sale de la oracion donde aparece, no de las vecinas.
    const sentenceStart = Math.max(text.lastIndexOf('. ', index), text.lastIndexOf(';', index), text.lastIndexOf('\n', index)) + 1
    const nextBreak = text.slice(index + source.length).search(/\. |;|\n/)
    const context = text.slice(sentenceStart, nextBreak === -1 ? text.length : index + source.length + nextBreak)
    found.set(date, { date, time, kind: kindFor(context), source: source.trim() })
  }

  for (const match of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g)) {
    add(resolveYear(Number(match[2]), Number(match[1]), todayKey, match[3] ? Number(match[3]) : undefined), match[0], match.index ?? 0)
  }

  for (const match of text.matchAll(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/g)) {
    const month = MONTHS[match[2]]
    if (month) add(resolveYear(month, Number(match[1]), todayKey, match[3] ? Number(match[3]) : undefined), match[0], match.index ?? 0)
  }

  for (const match of text.matchAll(/\b(hoy|manana|pasado manana)\b/g)) {
    // "manana" como parte del dia ("por la manana") no es una fecha.
    const before = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index)
    if (match[1] === 'manana' && /(la|por la)\s*$/.test(before)) continue
    const offset = match[1] === 'hoy' ? 0 : match[1] === 'manana' ? 1 : 2
    add(addDaysToKey(todayKey, offset), match[0], match.index ?? 0)
  }

  for (const match of text.matchAll(/\b(?:el|este|proximo)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g)) {
    const target = WEEKDAYS[match[1]]
    const current = weekdayOfKey(todayKey)
    let delta = (target - current + 7) % 7
    if (delta === 0 || match[0].startsWith('proximo')) delta = delta === 0 ? 7 : delta
    add(addDaysToKey(todayKey, delta), match[0], match.index ?? 0)
  }

  return [...found.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function ruleText(rule: ClassificationRule, message: Pick<BandejaMessage, 'subject' | 'snippet' | 'fromName' | 'fromAddress'>) {
  if (rule.field === 'subject') return message.subject
  if (rule.field === 'snippet') return message.snippet ?? ''
  if (rule.field === 'from') return `${message.fromName} ${message.fromAddress}`
  return `${message.subject} ${message.snippet ?? ''}`
}

function matchedKeyword(text: string, keywords: string[]): string | null {
  const normalized = normalizeText(text)
  for (const keyword of keywords) {
    const needle = normalizeText(keyword)
    // Palabra completa (admite plural): "acto" no matchea "actores".
    const pattern = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?($|[^a-z0-9])`)
    if (pattern.test(normalized)) return keyword
  }
  return null
}

export function classifyMessage(
  message: Pick<BandejaMessage, 'subject' | 'snippet' | 'fromName' | 'fromAddress'>,
  now: Date,
  rules: ClassificationRule[] = DEFAULT_RULES,
): ClassificationResult {
  let priority: BandejaPriority = 'normal'
  let priorityFromRule = false
  let category: BandejaCategory | null = null
  let requiresResponse = false
  const reasons: string[] = []

  for (const rule of rules) {
    if (!rule.active) continue
    const text = ruleText(rule, message)
    const keyword = matchedKeyword(text, rule.keywords)
    if (!keyword || (rule.excludeKeywords && matchedKeyword(text, rule.excludeKeywords))) continue

    reasons.push(`${rule.name}: menciona "${keyword}"`)
    if (rule.priority) {
      // Lo informativo solo baja la prioridad si ninguna otra regla la subio.
      if (rule.priority === 'informativa') {
        if (!priorityFromRule) priority = 'informativa'
      } else {
        priority = priorityFromRule ? maxPriority(priority, rule.priority) : rule.priority
        priorityFromRule = true
      }
    }
    if (rule.category && !category) category = rule.category
    if (rule.requiresResponse) requiresResponse = true
  }

  const detectedDates = detectDates(`${message.subject} ${message.snippet ?? ''}`, now)
  const todayKey = tucumanDateKey(now)
  const urgentDate = detectedDates.find((date) => date.kind !== 'mencion' && date.date >= todayKey && date.date <= addDaysToKey(todayKey, 2))

  // Un plazo o reunion en las proximas 48 horas sube la prioridad un escalon.
  if (urgentDate && priority !== 'critica' && priority !== 'informativa') {
    priority = priority === 'alta' ? 'critica' : 'alta'
    reasons.push(`Fecha cercana: ${urgentDate.source} (${urgentDate.date})`)
  }

  if (reasons.length === 0) reasons.push('Sin reglas aplicables: prioridad normal por defecto')

  return {
    priority,
    category: category ?? (requiresResponse ? 'solicitud_respuesta' : 'informativo'),
    reasons,
    detectedDates,
    requiresResponse,
  }
}

// Fecha que se usa como vencimiento del asunto: el primer plazo, si no la primera reunion.
export function dueDateFromClassification(result: ClassificationResult): DetectedDate | null {
  return result.detectedDates.find((date) => date.kind === 'fecha_limite') ?? result.detectedDates.find((date) => date.kind === 'reunion') ?? null
}
