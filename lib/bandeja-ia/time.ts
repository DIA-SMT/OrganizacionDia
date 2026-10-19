// Fechas de Bandeja IA: todo se calcula en la hora de Tucuman, sin importar la zona del
// navegador o del servidor (Vercel corre en UTC). Los dias se manejan como claves YYYY-MM-DD.

export const BANDEJA_TIME_ZONE = 'America/Argentina/Tucuman'

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function partsInTucuman(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BANDEJA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day'), weekday: get('weekday'), hour: get('hour'), minute: get('minute') }
}

export function tucumanDateKey(date: Date): string {
  const { year, month, day } = partsInTucuman(date)
  return `${year}-${month}-${day}`
}

// 1 = lunes ... 7 = domingo (ISO), en hora de Tucuman.
export function tucumanWeekday(date: Date): number {
  return WEEKDAY_INDEX[partsInTucuman(date).weekday] ?? 1
}

export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function weekdayOfKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return utcDay === 0 ? 7 : utcDay
}

export function startOfWeekKey(key: string): string {
  return addDaysToKey(key, 1 - weekdayOfKey(key))
}

export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const toUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000)
}

// Tucuman no tiene horario de verano: UTC-3 todo el anio.
export function tucumanDateTimeToIso(key: string, time: string | null): string {
  const [hours, minutes] = (time ?? '09:00').split(':').map(Number)
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hours + 3, minutes)).toISOString()
}

export function formatBandejaDateTime(value: string | null | undefined): string {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: BANDEJA_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

export function formatBandejaDay(key: string, options: { weekday?: boolean } = {}): string {
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    weekday: options.weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function relativeDueLabel(dueAt: string, now: Date): { label: string; tone: 'vencido' | 'hoy' | 'pronto' | 'lejos' } {
  const days = daysBetweenKeys(tucumanDateKey(now), tucumanDateKey(new Date(dueAt)))
  if (days < 0) return { label: days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`, tone: 'vencido' }
  if (days === 0) return { label: 'Vence hoy', tone: 'hoy' }
  if (days === 1) return { label: 'Vence mañana', tone: 'pronto' }
  if (days <= 7) return { label: `Vence en ${days} días`, tone: 'pronto' }
  return { label: `Vence en ${days} días`, tone: 'lejos' }
}
