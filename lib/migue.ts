// Migue: los asistentes de IA de cada proyecto. Este modulo define el catalogo y los calculos de la
// pantalla. El formato con el que reporta cada bot esta en lib/migue-ingest.ts.
// Sin imports con alias: lo usan los tests de node.

export type MigueChannel = 'WhatsApp' | 'Web' | 'App' | 'Pantallas'
export type MigueStatus = 'En produccion' | 'Piloto' | 'En desarrollo'

export type MigueProfile = {
  slug: string
  name: string
  look: string
  project_name: string
  area: string
  description: string
  channels: MigueChannel[]
  llm_model: string
  status: MigueStatus
  // Tinte del escenario donde se para el muñequito.
  accent: string
  // Vistas en orden de giro: frente, mira a la derecha, espalda, mira a la izquierda.
  frames: string[]
  // Reporta desde este mismo repo (no necesita clave): el chat del dashboard.
  internal?: boolean
  // Modelo 3D (GLB optimizado). Si esta, la ficha lo usa en lugar de las vistas. Para sumar otro:
  // npx @gltf-transform/cli optimize <modelo>.glb public/migue/<slug>/model.glb --compress meshopt
  //   --texture-compress webp --texture-size 2048 --simplify-ratio <r> --simplify-error 0.0005
  // con <r> tal que queden ~150.000 triangulos (0.15 para un original de 1M, 0.3 para uno de 500k).
  model?: string
}

// Una fila de la vista public.migue_daily_stats (un Migue en un dia, hora de Tucuman).
// conversations = resolved + handed_off + unanswered.
export type MigueDailyStat = {
  migue_slug: string
  day: string
  conversations: number
  messages: number
  resolved: number
  handed_off: number
  unanswered: number
  positive_feedback: number
  negative_feedback: number
  // Conversaciones que informaron tiempo de respuesta y la suma de esos tiempos.
  timed_conversations: number
  response_ms_total: number
  cost_usd: number
}

// Filas de public.migue_top_topics / migue_top_unanswered. total: base de los porcentajes.
export type MigueTopic = { topic: string; count: number; total: number }
export type MigueUnanswered = { question: string; count: number; total: number }

export type MigueSummary = {
  conversations: number
  messages: number
  resolved: number
  handed_off: number
  unanswered: number
  positive_feedback: number
  negative_feedback: number
  // null si ninguna conversacion informo su tiempo de respuesta.
  avg_response_ms: number | null
  // Sin redondear: se redondea solo al mostrarlo.
  cost_usd: number
  active_days: number
  days: number
  // null cuando no hay base para calcularla (sin conversaciones o sin valoraciones).
  effectiveness: number | null
  satisfaction: number | null
}

// esperando: tiene clave pero todavia no reporto. sin_conectar: no tiene clave ni datos.
export type MigueHealth = 'activo' | 'demorado' | 'inactivo' | 'esperando' | 'sin_conectar'

export type MigueAchievement = {
  id: string
  label: string
  description: string
  earned: boolean
}

const frames = (slug: string) => [0, 1, 2, 3].map((view) => `/migue/${slug}/${view}.webp`)

// Modelo de IA: "Por confirmar" donde todavia no sabemos cual usa cada bot.
export const MIGUES: MigueProfile[] = [
  {
    slug: 'migue-original',
    name: 'Migue',
    look: 'Buzo azul, el original',
    project_name: 'Migue',
    area: 'Direccion de IA',
    description: 'El primer Migue, el que empezo todo: el asistente base del que salieron los demas.',
    channels: ['Web'],
    llm_model: 'Por confirmar',
    status: 'En produccion',
    accent: '#bcd4fb',
    frames: frames('migue-original'),
    model: '/migue/migue-original/model.glb',
  },
  {
    slug: 'turismo',
    name: 'Migue Turismo',
    look: 'Viajero con mapa y camara',
    project_name: 'BotTurismo',
    area: 'Turismo',
    description: 'Recomienda paseos, agenda cultural y gastronomia de San Miguel de Tucuman.',
    channels: ['WhatsApp'],
    llm_model: 'OpenRouter (Gemini)',
    status: 'En produccion',
    accent: '#f3d9a4',
    frames: frames('turismo'),
    model: '/migue/turismo/model.glb',
  },
  {
    slug: 'institucional',
    name: 'Migue Institucional',
    look: 'Chomba municipal',
    project_name: 'Institucional',
    area: 'Municipalidad',
    description: 'Responde tramites, horarios y servicios generales de la Municipalidad.',
    channels: ['Web', 'WhatsApp'],
    llm_model: 'Por confirmar',
    status: 'En produccion',
    accent: '#c9d6f5',
    frames: frames('institucional'),
  },
  {
    slug: 'san-miguelino',
    name: 'Migue Periodista',
    look: 'Campera y grabador',
    project_name: 'El Sanmiguelino',
    area: 'Comunicacion',
    description: 'Acompaña al diario digital: busca notas, resume y responde sobre la actualidad local.',
    channels: ['Web'],
    llm_model: 'Por confirmar',
    status: 'En produccion',
    accent: '#d9d4cc',
    frames: frames('san-miguelino'),
    model: '/migue/san-miguelino/model.glb',
  },
  {
    slug: 'bot-ambiente',
    name: 'Migue Explorador',
    look: 'Explorador con dron',
    project_name: 'BotAmbiente',
    area: 'Ambiente',
    description: 'Chatbot de la Secretaria de Ambiente: reciclaje, arbolado y denuncias ambientales.',
    channels: ['WhatsApp', 'Web'],
    llm_model: 'OpenRouter (LangChain)',
    status: 'En produccion',
    accent: '#cfe3c1',
    frames: frames('bot-ambiente'),
  },
  {
    slug: 'migue-recolector',
    name: 'MigueRecolector',
    look: 'Chaleco de reciclaje',
    project_name: 'AppAmbiente',
    area: 'Ambiente',
    description: 'Guia la separacion de residuos y los horarios de recoleccion por barrio.',
    channels: ['App'],
    llm_model: 'Por confirmar',
    status: 'En produccion',
    accent: '#d6ecb5',
    frames: frames('migue-recolector'),
    model: '/migue/migue-recolector/model.glb',
  },
  {
    slug: 'presupuesto-participativo',
    name: 'Migue Presupuesto',
    look: 'Camisa y planilla',
    project_name: 'Presupuesto Participativo',
    area: 'Participacion ciudadana',
    description: 'El chat del sitio: explica como proponer y votar, y busca ideas y proyectos por distrito.',
    channels: ['Web'],
    llm_model: 'OpenRouter',
    status: 'Piloto',
    accent: '#cdd8ec',
    frames: frames('presupuesto-participativo'),
  },
  {
    slug: 'applaza',
    name: 'Migue Espacios Verdes',
    look: 'Campera verde y tablet',
    project_name: 'Applaza',
    area: 'Espacios verdes',
    description: 'Asistente del personal: controles, pendientes por cooperativa, evidencias e informes de auditoria en PDF.',
    channels: ['App'],
    llm_model: 'OpenRouter',
    status: 'Piloto',
    accent: '#c6dcc4',
    frames: frames('applaza'),
    model: '/migue/applaza/model.glb',
  },
  {
    slug: 'carteleria',
    name: 'Migue Innovacion',
    look: 'Buzo azul',
    project_name: 'Carteleria',
    area: 'Tecnologia e innovacion',
    description: 'Contenidos y respuestas breves en las pantallas de carteleria digital.',
    channels: ['Pantallas'],
    llm_model: 'Por confirmar',
    status: 'En desarrollo',
    accent: '#c3d9fb',
    frames: frames('carteleria'),
  },
  {
    slug: 'dashboard-dia',
    name: 'Migue DIA',
    look: 'Remera casual',
    project_name: 'Dashboard DIA',
    area: 'Direccion de IA',
    description: 'El asistente de este dashboard: proyectos, tareas y equipo.',
    channels: ['Web'],
    llm_model: 'Gemini 2.5 Flash-Lite (OpenRouter)',
    internal: true,
    status: 'En produccion',
    accent: '#d7dcef',
    frames: frames('dashboard-dia'),
    model: '/migue/dashboard-dia/model.glb',
  },
]

export const MIGUE_VIEW_LABELS = ['Frente', 'Perfil derecho', 'Espalda', 'Perfil izquierdo']

// ---------- Calculos ----------

export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

// Filas de los `days` dias que terminan en `endDay` (inclusive).
export function statsInPeriod(stats: MigueDailyStat[], endDay: string, days: number): MigueDailyStat[] {
  const startDay = addDays(endDay, -(days - 1))
  return stats.filter((row) => row.day >= startDay && row.day <= endDay)
}

export function summarize(stats: MigueDailyStat[], days: number): MigueSummary {
  const total = {
    conversations: 0,
    messages: 0,
    resolved: 0,
    handed_off: 0,
    unanswered: 0,
    positive_feedback: 0,
    negative_feedback: 0,
    cost_usd: 0,
  }
  let timed = 0
  let responseTotal = 0
  let activeDays = 0

  for (const row of stats) {
    total.conversations += row.conversations
    total.messages += row.messages
    total.resolved += row.resolved
    total.handed_off += row.handed_off
    total.unanswered += row.unanswered
    total.positive_feedback += row.positive_feedback
    total.negative_feedback += row.negative_feedback
    total.cost_usd += row.cost_usd
    timed += row.timed_conversations
    responseTotal += row.response_ms_total
    if (row.conversations > 0) activeDays++
  }

  const ratings = total.positive_feedback + total.negative_feedback
  return {
    ...total,
    avg_response_ms: timed ? Math.round(responseTotal / timed) : null,
    active_days: activeDays,
    days,
    effectiveness: total.conversations ? total.resolved / total.conversations : null,
    satisfaction: ratings ? total.positive_feedback / ratings : null,
  }
}

// Variacion contra el periodo anterior; null si antes no habia base.
export function periodDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return (current - previous) / previous
}

// Mas usado primero; a igual uso gana el mas efectivo.
export function rankByUsage<T extends { summary: MigueSummary }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => b.summary.conversations - a.summary.conversations || (b.summary.effectiveness ?? 0) - (a.summary.effectiveness ?? 0),
  )
}

export function lastActiveDay(stats: MigueDailyStat[]): string | null {
  let last: string | null = null
  for (const row of stats) if (row.conversations > 0 && (!last || row.day > last)) last = row.day
  return last
}

// Activo: charlo hoy o ayer. Demorado: hace 2 o 3 dias. Inactivo: mas de 3 dias o nunca.
export function healthOf(lastDay: string | null, today: string): MigueHealth {
  if (!lastDay) return 'inactivo'
  const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDay}T00:00:00Z`)) / 86_400_000)
  if (gap <= 1) return 'activo'
  if (gap <= 3) return 'demorado'
  return 'inactivo'
}

export function achievementsFor(summary: MigueSummary): MigueAchievement[] {
  return [
    {
      id: 'mil-charlas',
      label: 'Mil charlas',
      description: '1.000 conversaciones o mas en el periodo',
      earned: summary.conversations >= 1000,
    },
    {
      id: 'certero',
      label: 'Certero',
      description: 'Resuelve el 85% o mas sin derivar',
      earned: (summary.effectiveness ?? 0) >= 0.85,
    },
    {
      id: 'querido',
      label: 'Querido por los vecinos',
      description: 'Satisfaccion del 90% o mas',
      earned: (summary.satisfaction ?? 0) >= 0.9,
    },
    {
      id: 'rayo',
      label: 'Rayo',
      description: 'Responde en menos de 2 segundos en promedio',
      earned: summary.avg_response_ms !== null && summary.avg_response_ms < 2000,
    },
    {
      id: 'constante',
      label: 'Constante',
      description: 'Activo todos los dias del periodo',
      earned: summary.days > 0 && summary.active_days === summary.days,
    },
  ]
}

// Estado de conexion: con datos manda la ultima actividad. Sin datos en el periodo cargado
// (desde windowStart), un bot cuya clave se uso por ultima vez antes de ese periodo quedo inactivo.
export function connectionOf(
  lastDay: string | null,
  hasKey: boolean,
  today: string,
  lastKeyUseDay: string | null = null,
  windowStart: string | null = null,
): MigueHealth {
  if (lastDay) return healthOf(lastDay, today)
  if (lastKeyUseDay && windowStart && lastKeyUseDay < windowStart) return 'inactivo'
  return hasKey ? 'esperando' : 'sin_conectar'
}

// Serie diaria completa (los dias sin conversaciones valen cero) para los graficos.
export function denseDailyStats(stats: MigueDailyStat[], slug: string, endDay: string, days: number): MigueDailyStat[] {
  const byDay = new Map(stats.filter((row) => row.migue_slug === slug).map((row) => [row.day, row]))
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(endDay, index - (days - 1))
    return (
      byDay.get(day) ?? {
        migue_slug: slug,
        day,
        conversations: 0,
        messages: 0,
        resolved: 0,
        handed_off: 0,
        unanswered: 0,
        positive_feedback: 0,
        negative_feedback: 0,
        timed_conversations: 0,
        response_ms_total: 0,
        cost_usd: 0,
      }
    )
  })
}
