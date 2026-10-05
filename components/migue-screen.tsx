'use client'

import { AppShell } from '@/components/app-shell'
import { DailyUsageChart, OutcomeBar, Sparkline, TopicBars } from '@/components/migue-charts'
import { MigueKeyPanel } from '@/components/migue-key-panel'
import { MigueModelViewer } from '@/components/migue-model-viewer'
import { MigueProfileForm } from '@/components/migue-profile-form'
import { MigueTurntable } from '@/components/migue-turntable'
import { useAuth } from '@/context/AuthContext'
import {
  MIGUES,
  achievementsFor,
  addDays,
  connectionOf,
  denseDailyStats,
  lastActiveDay,
  periodDelta,
  rankByUsage,
  statsInPeriod,
  summarize,
  type MigueDailyStat,
  type MigueHealth,
  type MigueProfile,
  type MigueStatus,
  type MigueSummary,
  type MigueTopic,
  type MigueUnanswered,
} from '@/lib/migue'
import { assetsPrefixFor, mergeMigueCatalog, type MigueProfileRow } from '@/lib/migue-profiles'
import { lockPageScroll } from '@/lib/scroll-lock'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  Bot,
  Box,
  CircleCheck,
  CircleOff,
  Clock,
  Cpu,
  Heart,
  Hourglass,
  Info,
  Lock,
  MessageCircleQuestion,
  Minus,
  Pencil,
  Plug,
  Plus,
  Radio,
  Timer,
  TriangleAlert,
  Trophy,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'

type Period = 7 | 30 | 90
type SortKey = 'conversations' | 'effectiveness' | 'satisfaction' | 'cost_usd'
type LoadState = 'loading' | 'ready' | 'sin_migrar' | 'error'
// Ademas de la conexion: cargando, o no se pudo saber (error o base sin migrar).
type DisplayHealth = MigueHealth | 'cargando' | 'desconocido'

type MigueEntry = {
  migue: MigueProfile
  stats: MigueDailyStat[]
  current: MigueDailyStat[]
  summary: MigueSummary
  previous: MigueSummary
  lastDay: string | null
  health: DisplayHealth
  rank: number
}

const PERIODS: Period[] = [7, 30, 90]
// Dos periodos del mas largo: el actual y el anterior para comparar.
const HISTORY_DAYS = Math.max(...PERIODS) * 2
const PAGE_SIZE = 1000

// Supabase devuelve como mucho 1000 filas por consulta: se pide por paginas.
async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>) {
  const rows: T[] = []
  for (let start = 0; start < 50 * PAGE_SIZE; start += PAGE_SIZE) {
    const { data, error } = await page(start, start + PAGE_SIZE - 1)
    if (error) return { rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return { rows, error: null }
  }
  return { rows, error: { message: 'Demasiados datos para mostrar en esta pantalla.' } }
}

// Base sin migrar: la vista o la tabla todavia no existen.
function isMissingRelation(error: { message: string; code?: string }) {
  // 42P01: relacion inexistente. PGRST205 / PGRST202: tabla o funcion que PostgREST no encuentra.
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202'
}

const numberFormat = new Intl.NumberFormat('es-AR')
const compactFormat = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })
const percentFormat = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 })
const usdFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const secondsFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

// Podio: 1ro al centro y mas alto. Los escalones son decorativos; el texto va arriba, en flujo.
const MEDALS = [
  { label: '1er puesto', color: '#d4a017', step: 'h-10 sm:h-14', stage: 'h-36 sm:h-64' },
  { label: '2do puesto', color: '#9aa4b2', step: 'h-6 sm:h-9', stage: 'h-28 sm:h-52' },
  { label: '3er puesto', color: '#b8733b', step: 'h-3 sm:h-5', stage: 'h-28 sm:h-52' },
]

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  'mil-charlas': Trophy,
  certero: CircleCheck,
  querido: Heart,
  rayo: Zap,
  constante: Clock,
}

const MUTED = 'text-slate-500 dark:text-slate-400'

// Hoy en hora de Tucuman, igual que los dias de la base (no depende del reloj del navegador).
function localToday() {
  return tucumanDay(new Date().toISOString())
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function formatPercent(value: number | null) {
  return value === null ? '—' : percentFormat.format(value)
}

function formatSeconds(ms: number | null) {
  return ms === null ? '—' : `${secondsFormat.format(ms / 1000)} s`
}

// Los costos por conversacion son de milesimas de dolar: con 2 decimales se verian en cero.
const smallUsdFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
function formatUsd(value: number) {
  return value > 0 && value < 1 ? smallUsdFormat.format(value) : usdFormat.format(value)
}

function formatQuestion(question: string) {
  const text = question.charAt(0).toUpperCase() + question.slice(1)
  return `${text.startsWith('¿') ? '' : '¿'}${text}${text.endsWith('?') ? '' : '?'}`
}

// Fecha (hora de Tucuman) de un timestamp, en el formato de las filas diarias.
function tucumanDay(timestamp: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Tucuman' }).format(new Date(timestamp))
}

function daysSince(day: string | null, today: string) {
  if (!day) return null
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)
}

function statusTone(status: MigueStatus) {
  if (status === 'En produccion') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'Piloto') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300'
  return 'border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-800/70 dark:bg-yellow-400/15 dark:text-yellow-200'
}

// Escenario del muñequito: un tinte del color de cada Migue, con su propia version oscura.
function StageBackdrop({ accent }: { accent: string }) {
  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-10 dark:hidden" style={{ background: `radial-gradient(120% 90% at 50% 30%, #ffffff 0%, ${accent} 78%)` }} />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 hidden dark:block"
        style={{ background: `radial-gradient(120% 90% at 50% 32%, color-mix(in srgb, ${accent} 30%, #1c2a55) 0%, #0b1330 82%)` }}
      />
    </>
  )
}

function HealthBadge({ health, lastDay, today }: { health: DisplayHealth; lastDay: string | null; today: string }) {
  if (health === 'cargando' || health === 'desconocido') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {health === 'cargando' ? 'Cargando...' : 'Sin datos'}
      </span>
    )
  }
  if (health === 'activo') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        Activo
      </span>
    )
  }
  if (health === 'demorado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Sin actividad hace {daysSince(lastDay, today)} dias
      </span>
    )
  }
  if (health === 'esperando') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300">
        <Hourglass className="h-3.5 w-3.5" aria-hidden />
        Esperando datos
      </span>
    )
  }
  if (health === 'sin_conectar') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <Plug className="h-3.5 w-3.5" aria-hidden />
        Sin conectar
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      <CircleOff className="h-3.5 w-3.5" aria-hidden />
      Inactivo
    </span>
  )
}

function ConnectionNotice({ state, error, reporting, total }: { state: LoadState; error: string | null; reporting: number; total: number }) {
  const warning = 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100'
  const neutral = `border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${MUTED}`
  const [tone, Icon, message] =
    state === 'loading'
      ? [neutral, Info, 'Cargando datos de los Migues...']
      : state === 'sin_migrar'
        ? [warning, TriangleAlert, 'Falta ejecutar supabase/add_migue.sql en Supabase para guardar y ver los datos reales.']
        : state === 'error'
          ? [warning, TriangleAlert, `No se pudieron cargar los datos: ${error ?? 'error desconocido'}`]
          : [neutral, Info, `${reporting} de ${total} Migues reportan datos · la guia para conectar un bot esta en docs/migue-conexion.md`]
  return (
    <p className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${tone}`} role={state === 'ready' || state === 'loading' ? undefined : 'alert'}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

function Delta({ value, unit = 'percent', periodLabel }: { value: number | null; unit?: 'percent' | 'points'; periodLabel: string }) {
  if (value === null) return <p className={`mt-1 text-xs ${MUTED}`}>Sin periodo anterior para comparar</p>
  const flat = Math.abs(value) < 0.005
  const up = value > 0
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown
  const text = unit === 'points' ? `${up ? '+' : ''}${Math.round(value * 100)} pts` : `${up ? '+' : ''}${percentFormat.format(value)}`
  const tone = flat ? MUTED : up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
  return (
    <p className={`mt-1 flex flex-wrap items-center gap-x-1 text-xs font-semibold ${tone}`}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {flat ? 'Sin cambios' : text}
      </span>
      <span className={`font-normal ${MUTED}`}>vs {periodLabel}</span>
    </p>
  )
}

function StatTile({ label, value, children, icon: Icon }: { label: string; value: string; children?: React.ReactNode; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-slate-200 dia-surface-bg p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex items-center gap-2 text-sm ${MUTED}`}>
        <Icon className="h-4 w-4 dia-primary-text" aria-hidden />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 dia-primary-text" aria-hidden />
        <h2 className="font-semibold text-slate-950 dark:text-white">{title}</h2>
      </div>
      <p className={`mt-1 text-sm ${MUTED}`}>{subtitle}</p>
    </div>
  )
}

// El boton va en el nombre y su ::after cubre toda la tarjeta: se puede hacer click en cualquier
// lado, y el resto del contenido (estado, metricas) sigue siendo legible para lectores de pantalla.
const COVER_BUTTON =
  'text-left after:absolute after:inset-0 after:z-10 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--dia-primary)]'

export function MigueScreen() {
  const reduceMotion = useReducedMotion()
  const [today] = useState(localToday)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>(30)
  const [sortKey, setSortKey] = useState<SortKey>('conversations')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [dailyRows, setDailyRows] = useState<MigueDailyStat[]>([])
  // Migues con clave activa y el dia (hora de Tucuman) en que la usaron por ultima vez.
  const [keys, setKeys] = useState<Map<string, string | null>>(() => new Map())
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  // Migues agregados o editados desde el dashboard (supabase/add_migue_profiles.sql).
  const [profileRows, setProfileRows] = useState<MigueProfileRow[]>([])
  const [profilesReady, setProfilesReady] = useState(false)
  // Si las claves se pudieron leer: sin saberlo, reemplazar una pide confirmacion igual.
  const [keysKnown, setKeysKnown] = useState(false)
  // Despues de la primera carga, una recarga que falla deja los datos que ya habia.
  const loadedOnce = useRef(false)
  // Sube despues de guardar un Migue o generar una clave: vuelve a leer todo.
  const [reloadKey, setReloadKey] = useState(0)
  const [form, setForm] = useState<{ slug: string | null } | null>(null)
  const { teamSlug } = useAuth()
  const isDia = teamSlug === 'dia'

  // Datos reales: las vistas diarias que arma supabase/add_migue.sql y las claves de cada bot.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoadError('Supabase no esta configurado.')
        setLoadState('error')
        return
      }
      const from = addDays(today, -(HISTORY_DAYS - 1))
      const [stats, keyRows, profiles] = await Promise.all([
        fetchAllRows<MigueDailyStat>((start, end) =>
          supabase.from('migue_daily_stats').select('*').gte('day', from).lte('day', today).order('day').order('migue_slug').range(start, end),
        ),
        supabase.from('migue_ingest_keys').select('migue_slug, active, last_used_at'),
        // Todas las columnas: si falta una nueva (SQL a medio actualizar) la consulta no falla.
        supabase.from('migue_profiles').select('*'),
      ])
      if (cancelled) return
      // Sin la tabla de fichas (migracion pendiente) se ve el catalogo del codigo, como antes.
      // Otro error (la red, un corte) no borra lo que ya estaba cargado.
      if (!profiles.error) {
        setProfileRows((profiles.data ?? []) as MigueProfileRow[])
        setProfilesReady(true)
      } else if (isMissingRelation(profiles.error)) {
        setProfileRows([])
        setProfilesReady(false)
      }
      if (!keyRows.error) {
        const activeKeys = ((keyRows.data ?? []) as { migue_slug: string; active: boolean; last_used_at: string | null }[]).filter((key) => key.active)
        setKeys(new Map(activeKeys.map((key) => [key.migue_slug, key.last_used_at ? tucumanDay(key.last_used_at) : null])))
        setKeysKnown(true)
      }
      const error = stats.error ?? keyRows.error
      if (error) {
        if (loadedOnce.current) return
        setLoadError(error.message)
        setLoadState(isMissingRelation(error) ? 'sin_migrar' : 'error')
        return
      }
      setDailyRows(stats.rows)
      loadedOnce.current = true
      setLoadState('ready')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [today, reloadKey])

  const catalog = useMemo(() => mergeMigueCatalog(MIGUES, profileRows, assetsPrefixFor(process.env.NEXT_PUBLIC_SUPABASE_URL)), [profileRows])
  const reload = () => setReloadKey((current) => current + 1)

  const history = useMemo(
    () => catalog.map((migue) => ({ migue, stats: dailyRows.filter((row) => row.migue_slug === migue.slug) })),
    [catalog, dailyRows],
  )

  // El puesto se calcula sobre todos los Migues; la busqueda solo filtra lo que se muestra.
  const ranked = useMemo<MigueEntry[]>(() => {
    const withSummaries = history.map(({ migue, stats }) => {
      // Serie completa (con ceros) para graficos; el periodo anterior solo se resume.
      const current = denseDailyStats(stats, migue.slug, today, period)
      const lastDay = lastActiveDay(stats)
      return {
        migue,
        stats,
        current,
        summary: summarize(current, period),
        previous: summarize(statsInPeriod(stats, addDays(today, -period), period), period),
        lastDay,
        health:
          loadState === 'loading'
            ? ('cargando' as const)
            : loadState !== 'ready'
              ? ('desconocido' as const)
              : connectionOf(lastDay, Boolean(migue.internal) || keys.has(migue.slug), today, keys.get(migue.slug) ?? null, addDays(today, -(HISTORY_DAYS - 1))),
        rank: 0,
      }
    })
    return rankByUsage(withSummaries).map((entry, index) => ({ ...entry, rank: index + 1 }))
  }, [history, keys, loadState, period, today])

  const query = normalize(search.trim())
  const entries = useMemo(
    () =>
      query
        ? ranked.filter(({ migue }) => normalize(`${migue.name} ${migue.project_name} ${migue.area} ${migue.look}`).includes(query))
        : ranked,
    [ranked, query],
  )

  const totals = useMemo(() => {
    const sum = (key: keyof MigueSummary, source: 'summary' | 'previous') =>
      entries.reduce((total, entry) => total + (entry[source][key] as number), 0)
    const ratio = (a: number, b: number) => (b > 0 ? a / b : null)
    const conversations = sum('conversations', 'summary')
    const previousConversations = sum('conversations', 'previous')
    const effectiveness = ratio(sum('resolved', 'summary'), conversations)
    const previousEffectiveness = ratio(sum('resolved', 'previous'), previousConversations)
    const satisfaction = ratio(sum('positive_feedback', 'summary'), sum('positive_feedback', 'summary') + sum('negative_feedback', 'summary'))
    const previousSatisfaction = ratio(sum('positive_feedback', 'previous'), sum('positive_feedback', 'previous') + sum('negative_feedback', 'previous'))
    const cost = sum('cost_usd', 'summary')
    return {
      conversations,
      conversationsDelta: periodDelta(conversations, previousConversations),
      effectiveness,
      effectivenessDelta: effectiveness !== null && previousEffectiveness !== null ? effectiveness - previousEffectiveness : null,
      satisfaction,
      satisfactionDelta: satisfaction !== null && previousSatisfaction !== null ? satisfaction - previousSatisfaction : null,
      cost,
      costPerConversation: conversations ? cost / conversations : null,
      active: entries.filter((entry) => entry.health === 'activo').length,
    }
  }, [entries])

  // Con una busqueda activa el podio se oculta: el ranking general no coincide con lo filtrado.
  const podium = query ? [] : ranked.filter((entry) => entry.summary.conversations > 0).slice(0, 3)

  const sortedTable = useMemo(() => {
    const value = (entry: MigueEntry) => (entry.summary[sortKey] as number | null) ?? -1
    return [...entries].sort((a, b) => value(b) - value(a))
  }, [entries, sortKey])
  const maxConversations = Math.max(1, ...entries.map((entry) => entry.summary.conversations))

  const selected = selectedSlug ? (ranked.find((entry) => entry.migue.slug === selectedSlug) ?? null) : null
  const periodLabel = `los ${period} dias anteriores`

  return (
    <AppShell title="Migue" subtitle="Los asistentes de IA de cada proyecto" search={search} onSearchChange={setSearch}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo">
          {PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              className={`h-9 shrink-0 whitespace-nowrap rounded-md border px-3 text-sm font-semibold transition ${
                period === option
                  ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              onClick={() => setPeriod(option)}
            >
              <span className="hidden sm:inline">Ultimos </span>
              {option} dias
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionNotice state={loadState} error={loadError} reporting={ranked.filter((entry) => entry.lastDay !== null).length} total={ranked.length} />
          {isDia && (
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md dia-primary-bg px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              disabled={!profilesReady}
              title={profilesReady ? undefined : 'Falta ejecutar supabase/add_migue_profiles.sql en Supabase'}
              onClick={() => setForm({ slug: null })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Agregar Migue
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Bot} label="Conversaciones" value={numberFormat.format(totals.conversations)}>
          <Delta value={totals.conversationsDelta} periodLabel={periodLabel} />
        </StatTile>
        <StatTile icon={CircleCheck} label="Efectividad" value={formatPercent(totals.effectiveness)}>
          <Delta value={totals.effectivenessDelta} unit="points" periodLabel={periodLabel} />
        </StatTile>
        <StatTile icon={Heart} label="Satisfaccion" value={formatPercent(totals.satisfaction)}>
          <Delta value={totals.satisfactionDelta} unit="points" periodLabel={periodLabel} />
        </StatTile>
        <StatTile icon={Cpu} label="Costo estimado" value={formatUsd(totals.cost)}>
          <p className={`mt-1 text-xs ${MUTED}`}>
            {totals.costPerConversation !== null ? `${formatUsd(totals.costPerConversation * 1000)} cada mil conversaciones` : 'Sin conversaciones'}
          </p>
        </StatTile>
      </div>

      {podium.length > 0 && (
        <section className="mb-5 rounded-lg border border-slate-200 dia-surface-bg shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <SectionHeader icon={Trophy} title="Vitrina de trofeos" subtitle={`Los Migues mas usados de los ultimos ${period} dias`} />
          <div className="flex items-end justify-center gap-2 px-3 pt-6 sm:gap-6 sm:px-4">
            {[1, 0, 2]
              .filter((place) => podium[place])
              .map((place) => (
                <PodiumSpot key={podium[place].migue.slug} entry={podium[place]} place={place} onOpen={() => setSelectedSlug(podium[place].migue.slug)} />
              ))}
          </div>
        </section>
      )}

      <section className="mb-5 rounded-lg border border-slate-200 dia-surface-bg shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SectionHeader
          icon={Bot}
          title="Todos los Migues"
          subtitle={`${entries.length} asistentes · ${totals.active} activos${reduceMotion ? '' : ' · pasa el mouse para verlos girar'}`}
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <MigueCard key={entry.migue.slug} entry={entry} today={today} onOpen={() => setSelectedSlug(entry.migue.slug)} />
          ))}
          {entries.length === 0 && <p className={`col-span-full text-sm ${MUTED}`}>Ningun Migue coincide con la busqueda.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dia-surface-bg shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SectionHeader icon={Radio} title="Comparativa" subtitle="Ordena por conversaciones, efectividad, satisfaccion o costo; una fila abre la ficha" />
        <div data-lenis-prevent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className={`text-left text-xs ${MUTED}`}>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-5 py-3 font-semibold">#</th>
                <th className="px-3 py-3 font-semibold">Migue</th>
                <SortHeader label="Conversaciones" active={sortKey === 'conversations'} onClick={() => setSortKey('conversations')} />
                <SortHeader label="Efectividad" active={sortKey === 'effectiveness'} onClick={() => setSortKey('effectiveness')} align="right" />
                <SortHeader label="Satisfaccion" active={sortKey === 'satisfaction'} onClick={() => setSortKey('satisfaction')} align="right" />
                <th className="px-3 py-3 text-right font-semibold">Derivadas</th>
                <th className="px-3 py-3 text-right font-semibold">Sin respuesta</th>
                <th className="px-3 py-3 text-right font-semibold">Resp. promedio</th>
                <SortHeader label="Costo" active={sortKey === 'cost_usd'} onClick={() => setSortKey('cost_usd')} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
              {sortedTable.map((entry) => (
                <tr
                  key={entry.migue.slug}
                  className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => setSelectedSlug(entry.migue.slug)}
                >
                  <td className={`px-5 py-2.5 ${MUTED}`}>{entry.summary.conversations > 0 ? entry.rank : '—'}</td>
                  <td className="px-3 py-2.5">
                    {/* El boton es la via de teclado; el click en la fila es un atajo para el mouse. */}
                    <button
                      type="button"
                      className="flex items-center gap-3 text-left"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedSlug(entry.migue.slug)
                      }}
                    >
                      <span className="relative isolate h-10 w-8 shrink-0 overflow-hidden rounded-md">
                        <StageBackdrop accent={entry.migue.accent} />
                        <Image src={entry.migue.frames[0]} alt="" fill sizes="32px" className="object-contain object-bottom" />
                      </span>
                      <span>
                        <span className="block font-semibold text-slate-950 dark:text-white">{entry.migue.name}</span>
                        <span className={`block text-xs ${MUTED}`}>{entry.migue.project_name}</span>
                      </span>
                    </button>
                  </td>
                  {entry.lastDay === null ? (
                    // Nunca reporto: sin numeros (un 0 haria creer que se midio y no hubo uso).
                    <td colSpan={7} className="px-3 py-2.5">
                      <HealthBadge health={entry.health} lastDay={entry.lastDay} today={today} />
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 shrink-0">
                            <div
                              className="h-full rounded-r"
                              style={{ width: `${(entry.summary.conversations / maxConversations) * 100}%`, backgroundColor: 'var(--dia-primary)' }}
                            />
                          </div>
                          <span className="text-slate-950 dark:text-white">{numberFormat.format(entry.summary.conversations)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-950 dark:text-white">{formatPercent(entry.summary.effectiveness)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-950 dark:text-white">{formatPercent(entry.summary.satisfaction)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{numberFormat.format(entry.summary.handed_off)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{numberFormat.format(entry.summary.unanswered)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatSeconds(entry.summary.avg_response_ms)}</td>
                      <td className="px-5 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatUsd(entry.summary.cost_usd)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <MigueDetail
          entry={selected}
          period={period}
          today={today}
          canEdit={isDia && profilesReady}
          canManageKey={isDia}
          hasKey={!keysKnown || keys.has(selected.migue.slug)}
          onEdit={() => setForm({ slug: selected.migue.slug })}
          onKeyCreated={reload}
          onClose={() => setSelectedSlug(null)}
        />
      )}
      {form && (
        <MigueProfileForm
          editing={form.slug ? (catalog.find((migue) => migue.slug === form.slug) ?? null) : null}
          row={form.slug ? (profileRows.find((row) => row.slug === form.slug) ?? null) : null}
          catalog={catalog}
          takenSlugs={[...MIGUES.map((migue) => migue.slug), ...profileRows.map((row) => row.slug)]}
          hasKeyFor={(slug) => !keysKnown || keys.has(slug)}
          onClose={() => setForm(null)}
          onSaved={(slug, visible) => {
            reload()
            // Ficha y formulario se cierran juntos: el bloqueo de scroll compartido lo soporta.
            if (!visible && selectedSlug === slug) setSelectedSlug(null)
          }}
        />
      )}
    </AppShell>
  )
}

function PodiumSpot({ entry, place, onOpen }: { entry: MigueEntry; place: number; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const medal = MEDALS[place]
  return (
    <div
      className="group relative flex min-w-0 max-w-44 flex-1 basis-0 flex-col items-center"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <MigueTurntable
        frames={entry.migue.frames}
        name={entry.migue.name}
        autoRotate="hover"
        active={hover}
        sizes="176px"
        stageClassName={`w-full transition-transform duration-300 motion-safe:group-hover:-translate-y-1 ${medal.stage}`}
      />
      <div className="mt-1 flex w-full flex-col items-center px-1 pb-2 text-center">
        <span className="flex items-center gap-1 text-sm font-bold text-slate-950 dark:text-white">
          <Award className="h-4 w-4" style={{ color: medal.color }} aria-hidden />
          {place + 1}°
        </span>
        <button type="button" className={`${COVER_BUTTON} break-words text-center text-xs font-semibold text-slate-700 dark:text-slate-200`} onClick={onOpen}>
          {entry.migue.name}
          <span className="sr-only">, {medal.label}. Ver ficha</span>
        </button>
        <span className={`text-[11px] tabular-nums ${MUTED}`}>{compactFormat.format(entry.summary.conversations)} charlas</span>
      </div>
      <div
        aria-hidden
        className={`w-full rounded-t-lg border border-b-0 border-slate-200 dark:border-slate-700 ${medal.step}`}
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${medal.color} 28%, transparent), transparent)` }}
      />
    </div>
  )
}

function MigueCard({ entry, today, onOpen }: { entry: MigueEntry; today: string; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  const earned = achievementsFor(entry.summary).filter((achievement) => achievement.earned)
  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md motion-safe:hover:-translate-y-0.5 dark:border-slate-800 dark:bg-slate-950/60"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="relative isolate h-60 w-full">
        <StageBackdrop accent={entry.migue.accent} />
        {entry.summary.conversations > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-white/85 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">
            <span className="sr-only">Puesto </span>#{entry.rank}
          </span>
        )}
        {entry.migue.model && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-white/85 px-2 py-0.5 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-950/70 dark:text-slate-200">
            <Box className="h-3.5 w-3.5" aria-hidden />
            3D
          </span>
        )}
        <MigueTurntable
          frames={entry.migue.frames}
          name={entry.migue.name}
          autoRotate="hover"
          active={hover}
          sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw"
          stageClassName="h-full w-full pt-3"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <HealthBadge health={entry.health} lastDay={entry.lastDay} today={today} />
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${statusTone(entry.migue.status)}`}>{entry.migue.status}</span>
        </div>
        <div>
          <h3 className="font-semibold text-slate-950 dark:text-white">
            <button type="button" className={COVER_BUTTON} onClick={onOpen}>
              {entry.migue.name}
              <span className="sr-only">. Ver ficha</span>
            </button>
          </h3>
          <p className={`text-sm ${MUTED}`}>
            {entry.migue.project_name} · {entry.migue.channels.join(' + ')}
          </p>
        </div>
        {entry.lastDay === null ? (
          <p className={`mt-auto rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs dark:border-slate-700 ${MUTED}`}>
            {entry.health === 'cargando'
              ? 'Cargando datos...'
              : entry.health === 'desconocido'
                ? 'No se pudieron cargar sus datos.'
                : entry.health === 'esperando'
                  ? 'Tiene clave: falta que el bot envie su primera conversacion.'
                  : entry.health === 'inactivo'
                    ? `Hace mas de ${HISTORY_DAYS} dias que no reporta.`
                    : 'Todavia no reporta datos. En su ficha estan los pasos para conectarlo.'}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className={`text-xs ${MUTED}`}>Charlas</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">{compactFormat.format(entry.summary.conversations)}</dd>
              </div>
              <div>
                <dt className={`text-xs ${MUTED}`}>Efectividad</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">{formatPercent(entry.summary.effectiveness)}</dd>
              </div>
              <div>
                <dt className={`text-xs ${MUTED}`}>Logros</dt>
                <dd className="flex items-center gap-0.5 font-semibold text-slate-950 dark:text-white">
                  {earned.length}/5
                  {earned.slice(0, 3).map((achievement) => {
                    const Icon = ACHIEVEMENT_ICONS[achievement.id] ?? Award
                    return <Icon key={achievement.id} className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                  })}
                  {earned.length > 0 && <span className="sr-only">: {earned.map((achievement) => achievement.label).join(', ')}</span>}
                </dd>
              </div>
            </dl>
            <div className="mt-auto">
              <Sparkline values={entry.current.map((row) => row.conversations)} label={`Conversaciones por dia de ${entry.migue.name}`} />
            </div>
          </>
        )}
      </div>
    </article>
  )
}

function SortHeader({ label, active, onClick, align = 'left' }: { label: string; active: boolean; onClick: () => void; align?: 'left' | 'right' }) {
  const Icon = active ? ArrowDown : ArrowUpDown
  return (
    <th className={`px-3 py-3 font-semibold ${align === 'right' ? 'text-right' : ''}`} aria-sort={active ? 'descending' : 'none'}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 transition hover:text-slate-900 dark:hover:text-white ${active ? 'dia-primary-text' : ''}`}
        onClick={onClick}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? '' : 'opacity-50'}`} aria-hidden />
      </button>
    </th>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function MigueDetail({
  entry,
  period,
  today,
  canEdit,
  canManageKey,
  hasKey,
  onEdit,
  onKeyCreated,
  onClose,
}: {
  entry: MigueEntry
  period: Period
  today: string
  canEdit: boolean
  canManageKey: boolean
  hasKey: boolean
  onEdit: () => void
  onKeyCreated: () => void
  onClose: () => void
}) {
  const { migue, summary } = entry
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  const achievements = achievementsFor(summary)
  const periodLabel = `los ${period} dias anteriores`
  const hasData = entry.lastDay !== null
  // Se consultan al abrir la ficha, para el periodo elegido.
  const detailKey = `${migue.slug}:${period}:${today}`
  const [detail, setDetail] = useState<{ key: string; topics: MigueTopic[]; unanswered: MigueUnanswered[]; error: string | null } | null>(null)
  const detailReady = detail?.key === detailKey ? detail : null

  useEffect(() => {
    if (!hasData) return
    let cancelled = false
    async function load() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return
      const range = { p_slug: migue.slug, p_from: addDays(today, -(period - 1)), p_to: today, p_limit: 5 }
      const [topicRes, questionRes] = await Promise.all([supabase.rpc('migue_top_topics', range), supabase.rpc('migue_top_unanswered', range)])
      if (cancelled) return
      const error = topicRes.error ?? questionRes.error
      setDetail({
        key: detailKey,
        topics: ((topicRes.data ?? []) as MigueTopic[]).map((row) => ({ ...row, count: Number(row.count), total: Number(row.total) })),
        unanswered: ((questionRes.data ?? []) as MigueUnanswered[]).map((row) => ({ ...row, count: Number(row.count), total: Number(row.total) })),
        error: error ? error.message : null,
      })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [detailKey, hasData, migue.slug, period, today])
  const topics = detailReady?.topics ?? null
  const unanswered = detailReady?.unanswered ?? null

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // Solo al abrir y cerrar: bloquea el scroll de atras, lleva el foco al dialogo y lo devuelve.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const release = lockPageScroll()
    dialogRef.current?.focus()
    return () => {
      release()
      previousFocus?.focus()
    }
  }, [])

  // Escape cierra y Tab no sale del dialogo. Escuchado en el propio dialogo: teclear en otro
  // lado (por ejemplo el asistente) no lo cierra.
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      closeRef.current()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null)
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const current = document.activeElement
    if (event.shiftKey && (current === first || current === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="prezi-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4" onClick={() => closeRef.current()}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="migue-detail-title"
        tabIndex={-1}
        data-lenis-prevent
        className="prezi-bubble-in flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl touch-pan-y flex-col overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] lg:overflow-hidden dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4 dark:border-slate-800 dark:bg-slate-950/95">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <HealthBadge health={entry.health} lastDay={entry.lastDay} today={today} />
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${statusTone(migue.status)}`}>{migue.status}</span>
              {summary.conversations > 0 && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  #{entry.rank} en uso
                </span>
              )}
            </div>
            <h2 id="migue-detail-title" className="text-xl font-bold text-slate-950 sm:text-2xl dark:text-white">
              {migue.name}
            </h2>
            <p className={`mt-1 text-sm ${MUTED}`}>
              {migue.project_name} · {migue.area}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canEdit && (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Editar
              </button>
            )}
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Cerrar ficha"
              onClick={() => closeRef.current()}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-4 sm:p-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6">
          <div data-lenis-prevent className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            <div className="relative isolate overflow-hidden rounded-xl border border-slate-200 px-4 pb-4 pt-6 dark:border-slate-800">
              <StageBackdrop accent={migue.accent} />
              {migue.model ? (
                <MigueModelViewer src={migue.model} poster={migue.frames[0]} name={migue.name} stageClassName="h-[clamp(240px,calc(100dvh-19rem),400px)] w-full" />
              ) : (
                <MigueTurntable
                  frames={migue.frames}
                  name={migue.name}
                  autoRotate="always"
                  interactive
                  priority
                  sizes="(min-width: 1024px) 380px, 80vw"
                  stageClassName="h-[clamp(240px,calc(100dvh-19rem),400px)] w-full max-w-[300px]"
                />
              )}
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{migue.description}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className={`text-xs ${MUTED}`}>Canales</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">{migue.channels.join(', ')}</dd>
              </div>
              <div>
                <dt className={`text-xs ${MUTED}`}>Modelo de IA</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">{migue.llm_model}</dd>
              </div>
              <div>
                <dt className={`text-xs ${MUTED}`}>Look</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">{migue.look}</dd>
              </div>
              <div>
                <dt className={`text-xs ${MUTED}`}>Dias activo</dt>
                <dd className="font-semibold text-slate-950 dark:text-white">
                  {summary.active_days} de {summary.days}
                </dd>
              </div>
            </dl>
          </div>

          <div data-lenis-prevent className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            {entry.health === 'cargando' || entry.health === 'desconocido' ? (
              <p className={`text-sm ${MUTED}`}>{entry.health === 'cargando' ? 'Cargando datos...' : 'No se pudieron cargar los datos de este Migue.'}</p>
            ) : !hasData ? (
              <ConnectSteps entry={entry} canManageKey={canManageKey} hasKey={hasKey} onKeyCreated={onKeyCreated} />
            ) : (
              <div className="min-w-0 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile icon={Bot} label="Conversaciones" value={numberFormat.format(summary.conversations)}>
                    <Delta value={periodDelta(summary.conversations, entry.previous.conversations)} periodLabel={periodLabel} />
                  </StatTile>
                  <StatTile icon={CircleCheck} label="Efectividad" value={formatPercent(summary.effectiveness)}>
                    <Delta
                      value={summary.effectiveness !== null && entry.previous.effectiveness !== null ? summary.effectiveness - entry.previous.effectiveness : null}
                      unit="points"
                      periodLabel={periodLabel}
                    />
                  </StatTile>
                  <StatTile icon={Heart} label="Satisfaccion" value={formatPercent(summary.satisfaction)}>
                    <p className={`mt-1 text-xs ${MUTED}`}>{numberFormat.format(summary.positive_feedback + summary.negative_feedback)} valoraciones</p>
                  </StatTile>
                  <StatTile icon={Timer} label="Respuesta promedio" value={formatSeconds(summary.avg_response_ms)}>
                    <p className={`mt-1 text-xs ${MUTED}`}>{numberFormat.format(summary.messages)} mensajes</p>
                  </StatTile>
                  <StatTile icon={Cpu} label="Costo estimado" value={formatUsd(summary.cost_usd)}>
                    <p className={`mt-1 text-xs ${MUTED}`}>{migue.llm_model}</p>
                  </StatTile>
                  <StatTile icon={Award} label="Logros" value={`${achievements.filter((achievement) => achievement.earned).length} de ${achievements.length}`}>
                    <p className={`mt-1 text-xs ${MUTED}`}>En los ultimos {period} dias</p>
                  </StatTile>
                </div>

                <DetailBlock title="Como terminan las conversaciones">
                  <OutcomeBar summary={summary} />
                </DetailBlock>

                <DetailBlock title={`Conversaciones por dia · ultimos ${period} dias`}>
                  <DailyUsageChart stats={entry.current} />
                </DetailBlock>

                <div className="grid gap-5 md:grid-cols-2">
                  <DetailBlock title="Temas mas consultados">
                    {detailReady?.error ? (
                      <p className={`text-sm ${MUTED}`}>No se pudieron cargar los temas: {detailReady.error}</p>
                    ) : topics === null ? (
                      <p className={`text-sm ${MUTED}`}>Cargando temas...</p>
                    ) : (
                      <TopicBars topics={topics} />
                    )}
                  </DetailBlock>
                  <DetailBlock title="Preguntas sin respuesta" icon={MessageCircleQuestion}>
                    {detailReady?.error ? (
                      <p className={`text-sm ${MUTED}`}>No se pudieron cargar las preguntas: {detailReady.error}</p>
                    ) : unanswered === null ? (
                      <p className={`text-sm ${MUTED}`}>Cargando preguntas...</p>
                    ) : unanswered.length === 0 ? (
                      <p className={`text-sm ${MUTED}`}>Sin preguntas pendientes.</p>
                    ) : (
                      <ul className="space-y-2">
                        {unanswered.map((item) => (
                          <li key={item.question} className="flex items-start justify-between gap-3 text-sm">
                            <span className="text-slate-700 dark:text-slate-200">{formatQuestion(item.question)}</span>
                            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {item.count} veces
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className={`mt-3 text-xs ${MUTED}`}>Sirven para saber que agregarle a su base de conocimiento.</p>
                  </DetailBlock>
                </div>

                <DetailBlock title="Logros">
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {achievements.map((achievement) => {
                      const Icon = achievement.earned ? (ACHIEVEMENT_ICONS[achievement.id] ?? Award) : Lock
                      return (
                        <li
                          key={achievement.id}
                          className={`flex items-start gap-2.5 rounded-lg border p-3 ${
                            achievement.earned
                              ? 'border-amber-200 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10'
                              : 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900/60'
                          }`}
                        >
                          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${achievement.earned ? 'text-amber-600 dark:text-amber-300' : MUTED}`} aria-hidden />
                          <span>
                            <span className="block text-sm font-semibold text-slate-950 dark:text-white">
                              {achievement.label}
                              <span className="sr-only">{achievement.earned ? ' (conseguido)' : ' (pendiente)'}</span>
                            </span>
                            <span className={`block text-xs ${MUTED}`}>{achievement.description}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </DetailBlock>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// Ficha de un Migue que todavia no reporta: los pasos para conectarlo.
function ConnectSteps({ entry, canManageKey, hasKey, onKeyCreated }: { entry: MigueEntry; canManageKey: boolean; hasKey: boolean; onKeyCreated: () => void }) {
  const { migue } = entry
  const code = 'rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200'
  return (
    <div className="min-w-0 space-y-4">
      <DetailBlock title={migue.internal ? 'Todavia no hay consultas registradas' : 'Como conectar este Migue'} icon={Plug}>
        {migue.internal ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Migue DIA registra las consultas del chat del dashboard. Si no aparecen, falta ejecutar{' '}
            <code className={code}>supabase/add_migue.sql</code> en Supabase o configurar <code className={code}>SUPABASE_SERVICE_ROLE_KEY</code> en el servidor.
          </p>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              <span className={hasKey ? 'text-slate-400 line-through dark:text-slate-500' : ''}>Generar su clave.</span>
              {hasKey && <span className="sr-only"> (hecho)</span>}
              {canManageKey ? (
                <div className="mt-2">
                  <MigueKeyPanel slug={migue.slug} projectName={migue.project_name} hasKey={hasKey} onCreated={onKeyCreated} />
                </div>
              ) : (
                !hasKey && (
                  <span>
                    {' '}
                    Desde esta ficha, con una cuenta del equipo DIA, o con <code className={code}>npm run migue:token -- {migue.slug}</code>.
                  </span>
                )
              )}
            </li>
            <li>
              Pasarle la clave y la guia <code className={code}>docs/migue-conexion.md</code> al equipo de {migue.project_name}: el bot envia cada conversacion a{' '}
              <code className={code}>/api/migue/conversaciones</code>.
            </li>
            <li>Con la primera conversacion que llegue, aparecen aca sus numeros, temas y preguntas sin respuesta.</li>
          </ol>
        )}
      </DetailBlock>
    </div>
  )
}

function DetailBlock({ title, icon: Icon, children }: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
        {Icon && <Icon className="h-4 w-4 dia-primary-text" aria-hidden />}
        {title}
      </h3>
      {children}
    </div>
  )
}
