'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type TaskProject = { name: string } | { name: string }[] | null

type TaskHistoryRow = {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  created_at: string
  updated_at: string
  projects: TaskProject
}

const timeFilters = [
  { label: '24 h', days: 1 },
  { label: '3 dias', days: 3 },
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '1 mes', days: 30 },
  { label: '1 año', days: 365 },
  { label: 'Todo el tiempo', days: null },
] as const

function getProjectName(projects: TaskProject) {
  if (Array.isArray(projects)) return projects[0]?.name ?? null
  return projects?.name ?? null
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function isInsideDateFilter(value: string | null, days: number | null) {
  if (!days) return true
  if (!value) return false

  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return false

  const since = Date.now() - days * 24 * 60 * 60 * 1000
  return time >= since
}

function priorityClass(priority: string) {
  if (priority === 'Critica') return 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200'
  if (priority === 'Alta') return 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200'
  if (priority === 'Media') return 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

export function TaskHistoryScreen() {
  const [search, setSearch] = useState('')
  const [tasks, setTasks] = useState<TaskHistoryRow[]>([])
  const [selectedDays, setSelectedDays] = useState<number | null>(3)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTasks() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase no esta configurado.')
        setLoading(false)
        return
      }

      setError(null)
      setLoading(true)
      const { data, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, description, type, status, priority, created_at, updated_at, projects(name)')
        .eq('active', true)
        .eq('status', 'Terminada')
        .order('updated_at', { ascending: false })

      if (tasksError) {
        setError(tasksError.message)
        setTasks([])
      } else {
        setTasks((data ?? []) as unknown as TaskHistoryRow[])
      }
      setLoading(false)
    }

    void fetchTasks()
  }, [])

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    const byDate = tasks.filter((task) => isInsideDateFilter(task.updated_at, selectedDays))
    if (!q) return byDate
    return byDate.filter((task) =>
      [task.title, task.description, task.type, task.priority, getProjectName(task.projects)].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [search, selectedDays, tasks])

  const activeFilterLabel = timeFilters.find((filter) => filter.days === selectedDays)?.label ?? '3 dias'

  return (
    <AppShell title="Historial de tareas" subtitle="Tareas finalizadas por periodo" search={search} onSearchChange={setSearch}>
      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">{error}</div>}

      <section className="rounded-lg border border-slate-200 dia-surface-bg shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 dia-primary-text" />
                <h2 className="font-semibold text-slate-950 dark:text-white">Tareas finalizadas</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {loading ? 'Actualizando historial...' : `${filteredTasks.length} tareas - ${activeFilterLabel}`}
              </p>
            </div>

            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {timeFilters.map((filter) => {
                const active = filter.days === selectedDays
                return (
                  <button
                    key={filter.label}
                    type="button"
                    className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold transition ${
                      active
                        ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setSelectedDays(filter.days)}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredTasks.map((task) => (
            <article key={task.id} className="grid gap-3 p-5 transition hover:bg-slate-50/80 lg:grid-cols-[1fr_auto] dark:hover:bg-slate-950/40">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold dia-primary-text">{getProjectName(task.projects) ?? 'Sin proyecto'}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{task.type}</span>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
                </div>
                <p className="mt-2 font-semibold text-slate-950 dark:text-white">{task.title}</p>
                {task.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{task.description}</p>}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 lg:text-right">
                <p>Finalizada: {formatDateTime(task.updated_at)}</p>
                <p className="mt-1">Creada: {formatDateTime(task.created_at)}</p>
              </div>
            </article>
          ))}
          {filteredTasks.length === 0 && (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Buscando tareas...' : 'No hay tareas finalizadas para el periodo seleccionado.'}
            </p>
          )}
        </div>
      </section>
    </AppShell>
  )
}
