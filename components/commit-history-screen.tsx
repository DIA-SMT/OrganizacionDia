'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { CheckCircle2, ExternalLink, GitCommitHorizontal, History } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type ProjectRow = {
  id: string
  name: string
  status: string
  repository_url: string | null
  repository_url_secondary: string | null
}

type ProjectCommitActivity = {
  sha: string
  message: string
  author: string
  date: string | null
  url: string
  repo: string
  repoLabel: string
}

type CommitHistoryItem = ProjectCommitActivity & {
  itemType: 'commit'
  projectId: string
  projectName: string
  projectStatus: string
  seen?: boolean
}

type TaskProject = { name: string } | { name: string }[] | null

type TaskHistoryItem = {
  itemType: 'task'
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

type HistoryItem = CommitHistoryItem | TaskHistoryItem

const seenCommitsStorageKey = 'organizacion-dia-seen-commits'

const timeFilters = [
  { label: '24 h', days: 1 },
  { label: '3 dias', days: 3 },
  { label: '7 dias', days: 7 },
  { label: '15 dias', days: 15 },
  { label: '1 mes', days: 30 },
  { label: '1 año', days: 365 },
  { label: 'Todo el tiempo', days: null },
] as const

const typeFilters = [
  { label: 'Ver todo', value: 'all' },
  { label: 'Commits', value: 'commits' },
  { label: 'Tareas', value: 'tasks' },
] as const

function getProjectName(projects: TaskProject) {
  if (Array.isArray(projects)) return projects[0]?.name ?? null
  return projects?.name ?? null
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function historyDate(item: HistoryItem) {
  return item.itemType === 'commit' ? item.date : item.updated_at
}

function commitStorageId(commit: Pick<CommitHistoryItem, 'projectId' | 'projectName' | 'repo' | 'sha'>) {
  return `${commit.projectId ?? commit.projectName}:${commit.repo}:${commit.sha}`
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

export function CommitHistoryScreen() {
  const [search, setSearch] = useState('')
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [commits, setCommits] = useState<CommitHistoryItem[]>([])
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([])
  const [selectedDays, setSelectedDays] = useState<number | null>(3)
  const [selectedType, setSelectedType] = useState<(typeof typeFilters)[number]['value']>('all')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingCommits, setLoadingCommits] = useState(false)
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [seenIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = window.localStorage.getItem(seenCommitsStorageKey)
    return saved ? (JSON.parse(saved) as string[]) : []
  })

  useEffect(() => {
    async function fetchProjects() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase no esta configurado.')
        setLoadingProjects(false)
        return
      }

      setError(null)
      setLoadingProjects(true)
      const { data, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, status, repository_url, repository_url_secondary')
        .eq('active', true)
        .order('name', { ascending: true })

      if (projectsError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('projects')
          .select('id, name, status, repository_url')
          .eq('active', true)
          .order('name', { ascending: true })

        if (fallbackError) {
          setError(fallbackError.message)
          setProjects([])
        } else {
          setProjects(((fallbackData ?? []) as Omit<ProjectRow, 'repository_url_secondary'>[]).map((project) => ({ ...project, repository_url_secondary: null })))
        }
      } else {
        setProjects((data ?? []) as ProjectRow[])
      }

      setLoadingProjects(false)
    }

    void fetchProjects()
  }, [])

  useEffect(() => {
    async function fetchTasks() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoadingTasks(false)
        return
      }

      setLoadingTasks(true)
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
        setTasks(((data ?? []) as unknown as Omit<TaskHistoryItem, 'itemType'>[]).map((task) => ({ ...task, itemType: 'task' })))
      }
      setLoadingTasks(false)
    }

    void fetchTasks()
  }, [])

  useEffect(() => {
    const projectsWithRepos = projects.filter((project) => project.repository_url || project.repository_url_secondary)
    if (projectsWithRepos.length === 0) {
      return
    }

    async function fetchCommits() {
      setLoadingCommits(true)
      setError(null)
      try {
        const response = await fetch('/api/github/project-commits', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            allTime: true,
            projects: projectsWithRepos.map((project) => ({
              id: project.id,
              repositoryUrl: project.repository_url,
              repositoryUrlSecondary: project.repository_url_secondary,
            })),
          }),
        })

        if (!response.ok) throw new Error('No se pudieron cargar commits desde GitHub.')

        const payload = (await response.json()) as {
          commitsByProject?: Record<string, ProjectCommitActivity[]>
        }

        const nextItems = projectsWithRepos
          .flatMap((project) =>
            (payload.commitsByProject?.[project.id] ?? []).map((commit) => {
              const item = {
                ...commit,
                itemType: 'commit' as const,
                projectId: project.id,
                projectName: project.name,
                projectStatus: project.status,
              }
              return {
                ...item,
                seen: seenIds.includes(commitStorageId(item)),
              }
            }),
          )
          .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())

        setCommits(nextItems)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar commits.')
      } finally {
        setLoadingCommits(false)
      }
    }

    void fetchCommits()
  }, [projects, seenIds])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sourceItems: HistoryItem[] = [
      ...(selectedType === 'tasks' ? [] : commits),
      ...(selectedType === 'commits' ? [] : tasks),
    ]

    const byDate = sourceItems.filter((item) => isInsideDateFilter(historyDate(item), selectedDays))
    const bySearch = !q
      ? byDate
      : byDate.filter((item) => {
          if (item.itemType === 'commit') {
            return [item.projectName, item.message, item.author, item.repo, item.projectStatus].join(' ').toLowerCase().includes(q)
          }

          return [item.title, item.description, item.type, item.priority, getProjectName(item.projects)].filter(Boolean).join(' ').toLowerCase().includes(q)
        })

    return bySearch.sort((a, b) => new Date(historyDate(b) ?? 0).getTime() - new Date(historyDate(a) ?? 0).getTime())
  }, [commits, search, selectedDays, selectedType, tasks])

  const loading = loadingProjects || loadingCommits || loadingTasks
  const activeFilterLabel = timeFilters.find((filter) => filter.days === selectedDays)?.label ?? '3 dias'
  const projectsWithReposCount = projects.filter((project) => project.repository_url || project.repository_url_secondary).length
  const visibleCommits = filteredItems.filter((item) => item.itemType === 'commit').length
  const visibleTasks = filteredItems.filter((item) => item.itemType === 'task').length

  return (
    <AppShell title="Historial" subtitle="Commits y tareas finalizadas por periodo" search={search} onSearchChange={setSearch}>
      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">{error}</div>}

      <section className="rounded-lg border border-slate-200 bg-[#fbfcfd] shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#1769e0]" />
                <h2 className="font-semibold text-slate-950 dark:text-white">Bitacora por periodo</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {loading ? 'Actualizando historial...' : `${visibleCommits} commits - ${visibleTasks} tareas - ${projectsWithReposCount} proyectos con repos - ${activeFilterLabel}`}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {typeFilters.map((filter) => {
                  const active = filter.value === selectedType
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold transition ${
                        active
                          ? 'border-[#1677f2] bg-[#eaf3ff] text-[#1554c7] dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                      onClick={() => setSelectedType(filter.value)}
                    >
                      {filter.label}
                    </button>
                  )
                })}
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
                          ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300'
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
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredItems.map((item) =>
            item.itemType === 'commit' ? (
              <article key={`commit-${item.projectId}-${item.repo}-${item.sha}`} className="grid gap-3 p-5 transition hover:bg-slate-50/80 lg:grid-cols-[1fr_auto] dark:hover:bg-slate-950/40">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <GitCommitHorizontal className="h-3.5 w-3.5" />
                      Commit
                    </span>
                    <Link href={`/projects?proyecto=${item.projectId}`} className="font-semibold text-[#1769e0] hover:underline">
                      {item.projectName}
                    </Link>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.repoLabel}</span>
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{item.projectStatus}</span>
                    {item.seen && <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">Visto</span>}
                  </div>
                  <p className="mt-2 font-semibold text-slate-950 dark:text-white">{item.message}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {item.author} - {formatDate(item.date)}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-400">{item.repo}</p>
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <ExternalLink className="h-4 w-4" />
                  GitHub
                </a>
              </article>
            ) : (
              <article key={`task-${item.id}`} className="grid gap-3 p-5 transition hover:bg-slate-50/80 lg:grid-cols-[1fr_auto] dark:hover:bg-slate-950/40">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Tarea
                    </span>
                    <span className="font-semibold text-[#1769e0]">{getProjectName(item.projects) ?? 'Sin proyecto'}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.type}</span>
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
                  </div>
                  <p className="mt-2 font-semibold text-slate-950 dark:text-white">{item.title}</p>
                  {item.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 lg:text-right">
                  <p>Finalizada: {formatDate(item.updated_at)}</p>
                  <p className="mt-1">Creada: {formatDate(item.created_at)}</p>
                </div>
              </article>
            ),
          )}
          {filteredItems.length === 0 && (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Buscando historial...' : 'No hay movimientos para el periodo seleccionado.'}
            </p>
          )}
        </div>
      </section>
    </AppShell>
  )
}
