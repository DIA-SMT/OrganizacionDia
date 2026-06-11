'use client'

import { AppShell } from '@/components/app-shell'
import { TaskCreateButton } from '@/components/task-create-button'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type TaskProject = { name: string } | { name: string }[] | null

type TaskRow = {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  branch_name: string | null
  issue_url: string | null
  pr_url: string | null
  projects: TaskProject
}

function getProjectName(projects: TaskProject) {
  if (Array.isArray(projects)) return projects[0]?.name ?? null
  return projects?.name ?? null
}

function priorityClass(priority: string) {
  if (priority === 'Critica') return 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200'
  if (priority === 'Alta') return 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200'
  if (priority === 'Media') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

export function TasksScreen() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchTasks = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, type, status, priority, branch_name, issue_url, pr_url, projects(name)')
      .eq('active', true)
      .order('updated_at', { ascending: false })

    setTasks((data ?? []) as unknown as TaskRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchTasks)
  }, [fetchTasks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((task) => [task.title, task.description, task.type, task.status, task.priority, task.branch_name, getProjectName(task.projects)].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [search, tasks])

  return (
    <AppShell title="Tareas" subtitle="Trabajo tecnico asociado a los proyectos" search={search} onSearchChange={setSearch}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{filtered.length} tareas visibles</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Crea tareas vinculadas a proyectos existentes o nuevos.</p>
        </div>
        <TaskCreateButton onCreated={fetchTasks} isDark />
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando tareas...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay tareas cargadas.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="hidden grid-cols-[1.2fr_0.8fr_0.55fr_0.55fr_0.6fr_0.7fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-400 dark:border-slate-800 dark:text-slate-500 lg:grid">
            <span>Tarea</span>
            <span>Proyecto</span>
            <span>Tipo</span>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Links</span>
          </div>
          {filtered.map((task) => (
            <div key={task.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 dark:border-slate-800 lg:grid-cols-[1.2fr_0.8fr_0.55fr_0.55fr_0.6fr_0.7fr]">
              <div>
                <p className="font-semibold text-slate-950 dark:text-white">{task.title}</p>
                {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{task.description}</p>}
                {task.branch_name && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Branch: {task.branch_name}</p>}
              </div>
              <span className="text-slate-600 dark:text-slate-300">{getProjectName(task.projects) ?? 'Sin proyecto'}</span>
              <span className="text-slate-600 dark:text-slate-300">{task.type}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{task.status}</span>
              <span>
                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
              </span>
              <div className="flex flex-col gap-1">
                {task.issue_url && (
                  <a className="inline-flex items-center gap-1 text-[#0d8f62] dark:text-emerald-300" href={task.issue_url} target="_blank" rel="noreferrer">
                    Issue <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {task.pr_url && (
                  <a className="inline-flex items-center gap-1 text-[#0d8f62] dark:text-emerald-300" href={task.pr_url} target="_blank" rel="noreferrer">
                    PR <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
