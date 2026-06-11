'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { type DashboardProject, type PipelineColumn } from '@/lib/dashboard-data'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  CheckCircle2,
  Check,
  ChevronDown,
  CircleDot,
  Code2,
  FlaskConical,
  FolderOpen,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  TrendingUp,
  Rocket,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type ProjectRow = {
  id: string
  name: string
  requester_area: string | null
  stack: string | null
  repository_url: string | null
  repository_url_secondary: string | null
  status: string
  priority: string
  progress: number | null
  estimated_delivery: string | null
}

type JoinedTaskRow = {
  title: string
  status: string
  projects: { name: string } | { name: string }[] | null
  task_assignees?: Array<{
    members?: { full_name: string } | { full_name: string }[] | null
  }>
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

type ProjectCommitChange = ProjectCommitActivity & {
  projectId?: string
  projectName: string
  projectStatus: string
  seenAt?: string
}

const pipelineConfig = [
  { title: 'Planificación', statuses: ['Backlog', 'Pendiente', 'Planificacion', 'Planificación'], tone: 'bg-slate-100 text-slate-700' },
  { title: 'En desarrollo', statuses: ['En desarrollo'], tone: 'bg-blue-50 text-blue-700' },
  { title: 'MVP aprobado', statuses: ['En aprobacion', 'En aprobación', 'En revision', 'En revisión', 'MVP aprobado'], tone: 'bg-violet-50 text-violet-700' },
  { title: 'Para testear', statuses: ['QA'], tone: 'bg-emerald-50 text-emerald-700' },
]

const projectStatusOrder = ['Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado'] as const
const seenCommitsStorageKey = 'organizacion-dia-seen-commits'
const commitHistoryStorageKey = 'organizacion-dia-commit-history'

function commitStorageId(commit: Pick<ProjectCommitChange, 'projectId' | 'projectName' | 'repo' | 'sha'>) {
  return `${commit.projectId ?? commit.projectName}:${commit.repo}:${commit.sha}`
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeProjectStatus(status: string) {
  const normalized = normalizeText(status)
  if (normalized === 'backlog' || normalized === 'pendiente' || normalized === 'planificacion') return 'Planificación'
  if (normalized === 'en desarrollo') return 'En desarrollo'
  if (normalized === 'mvp aprobado' || normalized === 'en aprobacion' || normalized === 'en revision') return 'MVP aprobado'
  if (normalized === 'qa' || normalized === 'testing') return 'QA'
  if (normalized === 'en produccion' || normalized === 'deployado' || normalized === 'produccion') return 'En Producción'
  if (normalized === 'pausado' || normalized === 'mantenimiento') return 'Pausado'
  return status
}

function projectPriorityCardClass(priority: string, isDark: boolean) {
  if (priority === 'Alta' || priority === 'Critica') {
    return isDark ? 'bg-red-950/45 hover:bg-red-950/55' : 'bg-red-100/80 hover:bg-red-100'
  }

  if (priority === 'Media') {
    return isDark ? 'bg-sky-950/45 hover:bg-sky-950/55' : 'bg-sky-100/80 hover:bg-sky-100'
  }

  return isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'
}

function formatCommitDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function firstName(value: JoinedTaskRow['projects']) {
  if (!value) return null
  return Array.isArray(value) ? value[0]?.name ?? null : value.name
}

function firstAssignee(task: JoinedTaskRow) {
  const assignee = task.task_assignees?.[0]?.members
  if (!assignee) return 'Sin responsable'
  return Array.isArray(assignee) ? assignee[0]?.full_name ?? 'Sin responsable' : assignee.full_name
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  accent,
  progress,
  series,
  isDark,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  accent: string
  progress: number
  series: number[]
  isDark: boolean
  href: string
}) {
  const clampedProgress = Math.max(0, Math.min(progress, 100))
  const circumference = 2 * Math.PI * 21
  const dashOffset = circumference - (clampedProgress / 100) * circumference

  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isDark ? 'border-slate-800 bg-slate-900 shadow-slate-950/20' : 'border-slate-200 bg-white'
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-md ${accent} text-white`}>{icon}</div>
            <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <p className={`text-4xl font-bold leading-none ${isDark ? 'text-white' : 'text-slate-950'}`}>{value}</p>
            <div className="mb-1 flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-1 text-[11px] font-semibold text-emerald-700">
              <TrendingUp className="h-3 w-3" />
              {clampedProgress}%
            </div>
          </div>
          <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{hint}</p>
        </div>

        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="21" fill="none" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="6" />
            <circle
              cx="26"
              cy="26"
              r="21"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="text-[#10b981] transition-all duration-700"
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{clampedProgress}</span>
        </div>
      </div>

      <div className="mt-4 flex h-10 items-end gap-1">
        {series.map((height, index) => (
          <div key={`${label}-${index}`} className={`flex-1 rounded-t-sm ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <div
              className={`rounded-t-sm ${accent} transition-all duration-500 group-hover:opacity-90`}
              style={{ height: `${Math.max(12, Math.min(height, 100))}%` }}
            />
          </div>
        ))}
      </div>
    </Link>
  )
}

function SidebarItem({ icon, label, href, active }: { icon: React.ReactNode; label: string; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-[#e9f8f1] text-[#08784f]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}

export function DashboardView() {
  const { user, loading, authConfigured, signOut } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [pipeline, setPipeline] = useState<PipelineColumn[]>(pipelineConfig.map((column) => ({ title: column.title, tone: column.tone, tasks: [] })))
  const [activity, setActivity] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [commitsByProject, setCommitsByProject] = useState<Record<string, ProjectCommitActivity[]>>({})
  const [seenCommitIds, setSeenCommitIds] = useState<string[]>([])
  const [lastCommitSync, setLastCommitSync] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem('organizacion-dia-theme')
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
      const savedSeenCommitIds = window.localStorage.getItem(seenCommitsStorageKey)
      if (savedSeenCommitIds) setSeenCommitIds(JSON.parse(savedSeenCommitIds) as string[])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem('organizacion-dia-theme', next)
      return next
    })
  }

  useEffect(() => {
    if (!authConfigured || loading || user) return
    router.replace('/login?next=/')
  }, [authConfigured, loading, router, user])

  useEffect(() => {
    if (!authConfigured || loading || !user) return
    const currentUser = user

    async function fetchDashboard() {
      const userEmail = currentUser.email ?? 'usuario interno'
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const projectQuery = await supabase
          .from('projects')
        .select('id, name, requester_area, stack, repository_url, repository_url_secondary, status, priority, progress, estimated_delivery')
          .eq('active', true)
        .order('estimated_delivery', { ascending: true })

      const projectRowsResult = projectQuery.error
        ? await supabase
            .from('projects')
            .select('id, name, requester_area, stack, repository_url, status, priority, progress, estimated_delivery')
            .eq('active', true)
            .order('estimated_delivery', { ascending: true })
        : projectQuery

      const [{ data: joinedTaskRows }] = await Promise.all([
        supabase
          .from('tasks')
          .select('title, status, projects(name), task_assignees(members(full_name))')
          .eq('active', true)
          .neq('status', 'Terminada')
          .order('updated_at', { ascending: false })
          .limit(20),
      ])

      const nextProjects = ((projectRowsResult.data ?? []) as Partial<ProjectRow>[]).map((project) => {
        return {
          id: project.id,
          name: project.name ?? 'Sin nombre',
          area: project.requester_area ?? 'Sin area',
          stack: project.stack ?? 'Sin stack',
          status: normalizeProjectStatus(project.status ?? 'Planificación'),
          priority: project.priority ?? 'Media',
          progress: project.progress ?? 0,
          delivery: project.estimated_delivery ?? null,
          repositoryUrl: project.repository_url,
          repositoryUrlSecondary: project.repository_url_secondary,
        }
      })

      const tasks = (joinedTaskRows ?? []) as JoinedTaskRow[]
      const nextPipeline = pipelineConfig.map((column) => ({
        title: column.title,
        tone: column.tone,
        tasks: tasks
          .filter((task) => column.statuses.includes(task.status))
          .map((task) => ({
            title: task.title,
            project: firstName(task.projects) ?? 'Sin proyecto',
            owner: firstAssignee(task),
          })),
      }))

      setProjects(nextProjects)
      setPipeline(nextPipeline)
      setActivity([
        `Sesion iniciada como ${userEmail}`,
        `${nextProjects.length} proyectos activos cargados`,
        `${tasks.length} tareas tecnicas en seguimiento`,
      ])
    }

    fetchDashboard().catch((error) => {
      console.error('Error loading dashboard:', error)
      setActivity(['No se pudieron cargar datos desde Supabase'])
    })
  }, [authConfigured, loading, user])

  useEffect(() => {
    const projectsWithRepos = projects.filter((project) => project.repositoryUrl || project.repositoryUrlSecondary)
    if (projectsWithRepos.length === 0) return

    async function fetchProjectCommits() {
      try {
        const response = await fetch('/api/github/project-commits', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projects: projectsWithRepos.map((project) => ({
              id: project.id ?? project.name,
              repositoryUrl: project.repositoryUrl,
              repositoryUrlSecondary: project.repositoryUrlSecondary,
            })),
          }),
        })
        const payload = (await response.json()) as {
          commitsByProject?: Record<string, ProjectCommitActivity[]>
        }
        if (payload.commitsByProject) {
          setCommitsByProject(payload.commitsByProject)
          setLastCommitSync(new Date().toISOString())
        }
      } catch {
        return
      }
    }

    fetchProjectCommits()
    const interval = window.setInterval(fetchProjectCommits, 60000)

    return () => window.clearInterval(interval)
  }, [projects])

  useEffect(() => {
    async function fetchGithubProjects() {
      try {
        const res = await fetch('/api/github/projects', { cache: 'no-store' })
        if (!res.ok) return

        const payload = (await res.json()) as {
          projects?: DashboardProject[]
          configured?: boolean
          error?: string | null
        }

        if (payload.projects && payload.projects.length > 0) {
          setActivity((current) => [`${payload.projects?.length ?? 0} repositorios sincronizados desde GitHub`, ...current].slice(0, 5))
          return
        }

        if (payload.error) return
      } catch {
        return
      }
    }

    fetchGithubProjects()
  }, [])

  const metrics = useMemo(() => {
    const statusCounts = Object.fromEntries(projectStatusOrder.map((status) => [status, 0])) as Record<(typeof projectStatusOrder)[number], number>

    projects.forEach((project) => {
      const status = normalizeProjectStatus(project.status)
      if (projectStatusOrder.includes(status as (typeof projectStatusOrder)[number])) {
        statusCounts[status as (typeof projectStatusOrder)[number]] += 1
      }
    })

    const totalProjects = projects.length
    const developmentCount = statusCounts['En desarrollo']
    const approvalCount = statusCounts['MVP aprobado']
    const testingCount = statusCounts.QA
    const productionCount = statusCounts['En Producción']
    const pausedCount = statusCounts.Pausado

    return {
      totalProjects,
      developmentCount,
      approvalCount,
      testingCount,
      productionCount,
      pausedCount,
      statusCounts,
    }
  }, [projects])

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredProjects = useMemo(() => {
    if (!normalizedSearch) return projects
    return projects.filter((project) =>
      [project.name, project.area, project.stack, project.status, project.priority]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    )
  }, [normalizedSearch, projects])

  const filteredPipeline = useMemo(() => {
    if (!normalizedSearch) return pipeline
    return pipeline.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) =>
        [task.title, task.project, task.owner, column.title].join(' ').toLowerCase().includes(normalizedSearch)
      ),
    }))
  }, [normalizedSearch, pipeline])

  const filteredActivity = useMemo(() => {
    if (!normalizedSearch) return activity
    return activity.filter((item) => item.toLowerCase().includes(normalizedSearch))
  }, [activity, normalizedSearch])

  const recentProjectChanges = useMemo(() => {
    return projects
      .flatMap((project) =>
        (commitsByProject[project.id ?? project.name] ?? []).map((commit) => ({
          ...commit,
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
        })),
      )
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .filter((commit) => !seenCommitIds.includes(commitStorageId(commit)))
      .slice(0, 30)
  }, [commitsByProject, projects, seenCommitIds])

  function markCommitAsSeen(commit: ProjectCommitChange) {
    const id = commitStorageId(commit)
    const historyCommit = { ...commit, seenAt: new Date().toISOString() }

    setSeenCommitIds((current) => {
      const next = Array.from(new Set([id, ...current]))
      window.localStorage.setItem(seenCommitsStorageKey, JSON.stringify(next))
      return next
    })

    const savedHistory = window.localStorage.getItem(commitHistoryStorageKey)
    const history = savedHistory ? (JSON.parse(savedHistory) as ProjectCommitChange[]) : []
    const nextHistory = [historyCommit, ...history.filter((item) => commitStorageId(item) !== id)].slice(0, 300)
    window.localStorage.setItem(commitHistoryStorageKey, JSON.stringify(nextHistory))
  }

  const isDark = theme === 'dark'
  const shellClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f6f8fb] text-slate-950'
  const surfaceClass = isDark ? 'border-slate-800 bg-slate-900 shadow-slate-950/20' : 'border-slate-200 bg-white shadow-sm'
  const mutedSurfaceClass = isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-[#fbfcfd]'
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'
  const textMutedClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const dividerClass = isDark ? 'border-slate-800' : 'border-slate-100'

  if (authConfigured && (loading || !user)) {
    return (
      <main className={`relative isolate flex min-h-screen items-center justify-center transition-colors ${shellClass}`}>
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${isDark ? 'border-slate-800 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
          Verificando sesion...
        </div>
      </main>
    )
  }

  return (
    <main className={`relative isolate min-h-screen overflow-hidden transition-colors ${shellClass}`}>
      <CursorAiBackground isDark={isDark} />
      <div className="relative z-10 flex min-h-screen">
        <aside className={`hidden w-64 border-r px-4 py-5 lg:block ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'}`}>
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#103b3a] text-white">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-sm font-bold ${textStrongClass}`}>Organizacion DIA</p>
              <p className="text-xs text-slate-400">Equipo de desarrollo</p>
            </div>
          </div>

          <nav className="space-y-1">
            <SidebarItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" href="/" active />
            <SidebarItem icon={<Code2 className="h-4 w-4" />} label="Proyectos" href="/proyectos" />
            <SidebarItem icon={<GitPullRequest className="h-4 w-4" />} label="Tareas" href="/tareas" />
            <SidebarItem icon={<FlaskConical className="h-4 w-4" />} label="Testing" href="/testing" />
            <SidebarItem icon={<Users className="h-4 w-4" />} label="Equipo" href="/equipo" />
            <SidebarItem icon={<History className="h-4 w-4" />} label="Historial" href="/commit-history" />
            <SidebarItem icon={<Trash2 className="h-4 w-4" />} label="Papelera" href="/papelera" />
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`border-b backdrop-blur ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/90'}`}>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <h1 className={`text-xl font-bold ${textStrongClass}`}>Gestion de proyectos</h1>
                <p className={`text-sm ${textMutedClass}`}>Seguimiento operativo del equipo interno DIA</p>
              </div>
              <div className="flex items-center gap-2">
                <label className={`hidden h-10 items-center gap-2 rounded-md border px-3 text-sm md:flex ${isDark ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                  <Search className="h-4 w-4" />
                  <input
                    className="w-56 bg-transparent outline-none placeholder:text-inherit"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar proyecto o tarea"
                  />
                </label>
                <button
                  className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}
                  onClick={toggleTheme}
                  title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                {user && (
                  <button
                    className={`hidden h-10 items-center gap-2 rounded-md border px-3 text-sm md:flex ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}
                    onClick={signOut}
                  >
                    <LogOut className="h-4 w-4" />
                    Salir
                  </button>
                )}
                <button className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <Bell className="h-4 w-4" />
                </button>
                <button
                  className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}
                  onClick={() => setSettingsOpen(true)}
                  title="Configuracion"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 px-5 py-5">
            <label className={`mb-4 flex h-10 items-center gap-2 rounded-md border px-3 text-sm md:hidden ${isDark ? 'border-slate-700 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
              <Search className="h-4 w-4" />
              <input
                className="w-full bg-transparent outline-none placeholder:text-inherit"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar proyecto o tarea"
              />
            </label>

            <section className={`mb-5 rounded-lg border p-5 ${surfaceClass}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#0d8f62]">Ultimas modificaciones</p>
                  <h2 className={`mt-1 text-xl font-bold ${textStrongClass}`}>Resumen de lo trabajado en los proyectos</h2>
                  <p className={`mt-2 max-w-2xl text-sm ${textMutedClass}`}>
                    Cambios recientes detectados desde los repositorios vinculados. Selecciona uno para abrir el proyecto con mas detalle.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#e9f8f1] text-[#08784f]'}`}>
                    En vivo
                  </span>
                  <Link href="/commit-history" className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <History className="h-4 w-4" />
                    Historial
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {recentProjectChanges.length > 0 ? (
                  recentProjectChanges.map((change) => (
                    <article
                      key={`${change.projectName}-${change.repo}-${change.sha}`}
                      className={`min-h-[172px] w-[310px] shrink-0 cursor-pointer rounded-md border p-3 transition hover:-translate-y-0.5 ${
                        isDark ? 'border-slate-800 bg-slate-950/70 hover:bg-slate-950' : 'border-slate-200 bg-slate-50 hover:bg-white'
                      }`}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(change.projectId ? `/projects?proyecto=${change.projectId}` : `/projects?buscar=${encodeURIComponent(change.projectName)}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') router.push(change.projectId ? `/projects?proyecto=${change.projectId}` : `/projects?buscar=${encodeURIComponent(change.projectName)}`)
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-xs font-semibold ${isDark ? 'text-emerald-300' : 'text-[#0d8f62]'}`}>{change.projectName}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-500'}`}>{change.repoLabel}</span>
                      </div>
                      <p className={`mt-2 line-clamp-2 text-sm font-semibold leading-5 ${textStrongClass}`}>{change.message}</p>
                      <p className={`mt-2 text-xs ${textMutedClass}`}>
                        {change.author} - {formatCommitDate(change.date)}
                      </p>
                      <button
                        className={`mt-4 flex h-8 w-8 items-center justify-center rounded-full border transition ${isDark ? 'border-sky-800/80 bg-sky-950/30 text-sky-300 hover:bg-sky-950/60' : 'border-sky-200 bg-white text-sky-500 hover:bg-sky-50'}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          markCommitAsSeen(change)
                        }}
                        title="Marcar como visto"
                        aria-label="Marcar como visto"
                      >
                        <span className="relative flex h-4 w-5 items-center justify-center" aria-hidden="true">
                          <Check className="absolute left-0 h-3.5 w-3.5" strokeWidth={3} />
                          <Check className="absolute left-1.5 h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      </button>
                    </article>
                  ))
                ) : (
                  <div className={`w-full rounded-md border p-4 text-sm ${isDark ? 'border-slate-800 bg-slate-950/70 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                    Todavia no hay commits recientes para mostrar. Cuando se actualicen los repos vinculados van a aparecer aca.
                  </div>
                )}
              </div>
              <p className={`mt-2 text-xs ${textMutedClass}`}>
                {lastCommitSync ? `Ultima actualizacion: ${formatCommitDate(lastCommitSync)}. Los commits vistos se guardan en Historial.` : 'Sincronizando commits...'}
              </p>
            </section>

            <section className="grid gap-4 md:grid-cols-3 2xl:grid-cols-6">
              <MetricCard
                icon={<FolderOpen className="h-4 w-4" />}
                label="Todos los proyectos"
                value={String(metrics.totalProjects)}
                hint="Activos en el dashboard"
                accent="bg-[#10b981]"
                progress={Math.min(metrics.totalProjects * 12, 96)}
                series={[34, 56, 48, 72, 62, 86, 74]}
                isDark={isDark}
                href="/projects?estado=Todos"
              />
              <MetricCard
                icon={<Code2 className="h-4 w-4" />}
                label="En desarrollo"
                value={String(metrics.developmentCount)}
                hint="Construccion activa"
                accent="bg-blue-500"
                progress={Math.min(metrics.developmentCount * 24, 96)}
                series={[24, 42, 58, 54, 72, 68, 84]}
                isDark={isDark}
                href="/projects?estado=En%20desarrollo"
              />
              <MetricCard
                icon={<GitPullRequest className="h-4 w-4" />}
                label="MVP aprobado"
                value={String(metrics.approvalCount)}
                hint="Esperando revision interna"
                accent="bg-violet-500"
                progress={Math.min(metrics.approvalCount * 35, 100)}
                series={[22, 34, 58, 46, 64, 38, 52]}
                isDark={isDark}
                href="/projects?estado=MVP%20aprobado"
              />
              <MetricCard
                icon={<FlaskConical className="h-4 w-4" />}
                label="Para testear"
                value={String(metrics.testingCount)}
                hint="Listo para QA"
                accent="bg-sky-500"
                progress={Math.min(metrics.testingCount * 40, 100)}
                series={[18, 28, 36, 52, 44, 68, 58]}
                isDark={isDark}
                href="/projects?estado=QA"
              />
              <MetricCard
                icon={<Rocket className="h-4 w-4" />}
                label="En Producción"
                value={String(metrics.productionCount)}
                hint="Finalizados y online"
                accent="bg-emerald-600"
                progress={Math.min(metrics.productionCount * 30, 100)}
                series={[30, 46, 52, 64, 58, 76, 82]}
                isDark={isDark}
                href="/projects?estado=En%20Producci%C3%B3n"
              />
              <MetricCard
                icon={<CircleDot className="h-4 w-4" />}
                label="Proyectos pausados"
                value={String(metrics.pausedCount)}
                hint="Detenidos temporalmente"
                accent="bg-red-500"
                progress={Math.min(metrics.pausedCount * 30, 100)}
                series={[28, 36, 30, 44, 38, 52, 46]}
                isDark={isDark}
                href="/projects?estado=Pausado"
              />
            </section>

            <section className="mt-5">
              <div className={`rounded-lg border p-5 ${surfaceClass}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className={`font-semibold ${textStrongClass}`}>Distribucion operativa</h2>
                    <p className={`text-sm ${textMutedClass}`}>Donde esta concentrado el trabajo ahora</p>
                  </div>
                  <span className="rounded-md bg-[#e9f8f1] px-2 py-1 text-xs font-semibold text-[#08784f]">En vivo</span>
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    ['Planificación', metrics.statusCounts['Planificación'], 'bg-amber-500'],
                    ['En desarrollo', metrics.statusCounts['En desarrollo'], 'bg-[#10b981]'],
                    ['MVP aprobado', metrics.statusCounts['MVP aprobado'], 'bg-violet-500'],
                    ['QA', metrics.statusCounts.QA, 'bg-sky-500'],
                    ['En Producción', metrics.statusCounts['En Producción'], 'bg-emerald-600'],
                    ['Pausado', metrics.statusCounts.Pausado, 'bg-red-500'],
                  ].map(([label, count, color]) => {
                    const total = Math.max(projects.length, 1)
                    const value = Math.round((Number(count) / total) * 100)
                    return (
                    <div key={label as string}>
                      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
                        <span>{label}</span>
                        <span>{count} - {value}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-3 rounded-full ${color}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className={`rounded-lg border ${surfaceClass}`}>
                <div className={`flex items-center justify-between border-b px-5 py-4 ${dividerClass}`}>
                  <div>
                    <h2 className={`font-semibold ${textStrongClass}`}>Proyectos principales</h2>
                    <p className={`text-sm ${textMutedClass}`}>Estado, stack y avance general</p>
                  </div>
                  <Link href="/projects" className={`flex items-center gap-1 rounded-md border px-3 py-2 text-sm ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {normalizedSearch ? `${filteredProjects.length} resultados` : 'Todos'}
                    <ChevronDown className="h-4 w-4" />
                  </Link>
                </div>
                <div className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {filteredProjects.map((project) => {
                    const projectHref = project.id ? `/projects?proyecto=${project.id}` : `/projects?buscar=${encodeURIComponent(project.name)}`
                    const latestCommit = commitsByProject[project.id ?? project.name]?.[0]

                    return (
                    <article
                      key={project.name}
                      className={`cursor-pointer p-5 transition ${projectPriorityCardClass(project.priority, isDark)}`}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(projectHref)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') router.push(projectHref)
                      }}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className={`font-semibold ${textStrongClass}`}>{project.name}</h3>
                          <p className={`mt-1 text-sm ${textMutedClass}`}>
                            {project.area} - {project.stack}
                          </p>
                          {(project.repositoryUrl || project.repositoryUrlSecondary) && (
                            <div className="mt-2 grid max-w-xl gap-1.5">
                              {[
                                [project.repositoryUrl, 'Repo 1'],
                                [project.repositoryUrlSecondary, 'Repo 2'],
                              ].map(([url, label]) =>
                                url ? (
                                  <a key={label} className="block break-all text-xs font-semibold leading-5 text-[#0d8f62] hover:underline" href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}: </span>
                                    {url}
                                  </a>
                                ) : null,
                              )}
                            </div>
                          )}
                        </div>
                        <span className="rounded-md bg-[#eef8ff] px-2 py-1 text-xs font-semibold text-[#1677a8]">{project.status}</span>
                      </div>
                      {latestCommit && (
                        <div className={`mt-3 rounded-md border px-3 py-2 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white/75'}`}>
                          <div className="flex items-center gap-2">
                            <GitCommitHorizontal className={`h-3.5 w-3.5 ${isDark ? 'text-emerald-300' : 'text-[#0d8f62]'}`} />
                            <p className={`line-clamp-1 text-xs font-semibold ${textStrongClass}`}>{latestCommit.message}</p>
                          </div>
                          <p className={`mt-1 text-[11px] ${textMutedClass}`}>
                            {latestCommit.repoLabel} - {latestCommit.author} - {formatCommitDate(latestCommit.date)}
                          </p>
                        </div>
                      )}
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span>{project.priority}</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-[#10b981]" style={{ width: `${project.progress}%` }} />
                        </div>
                      </div>
                    </article>
                    )
                  })}
                  {filteredProjects.length === 0 && <p className={`p-5 text-sm ${textMutedClass}`}>No hay proyectos que coincidan con la busqueda.</p>}
                </div>
              </div>

              <div className={`rounded-lg border ${surfaceClass}`}>
                <div className={`border-b px-5 py-4 ${dividerClass}`}>
                  <h2 className={`font-semibold ${textStrongClass}`}>Actividad reciente</h2>
                  <p className={`text-sm ${textMutedClass}`}>Movimientos del equipo</p>
                </div>
                <div className="space-y-4 p-5">
                  {filteredActivity.map((item) => (
                    <div key={item} className="flex gap-3">
                      <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-md bg-[#e9f8f1] text-[#0d8f62]">
                        <CircleDot className="h-4 w-4" />
                      </div>
                      <p className={`text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{item}</p>
                    </div>
                  ))}
                  {filteredActivity.length === 0 && <p className={`text-sm ${textMutedClass}`}>No hay actividad que coincida con la busqueda.</p>}
                </div>
              </div>
            </section>

            <section className={`mt-5 rounded-lg border ${surfaceClass}`}>
              <div className={`border-b px-5 py-4 ${dividerClass}`}>
                <h2 className={`font-semibold ${textStrongClass}`}>Flujo de tareas</h2>
                <p className={`text-sm ${textMutedClass}`}>Vista tipo embudo para seguir desarrollo, aprobacion y testing</p>
              </div>
              <div className="grid gap-4 p-5 lg:grid-cols-4">
                {filteredPipeline.map((column) => (
                  <div key={column.title} className={`rounded-lg border ${mutedSurfaceClass}`}>
                    <div className={`flex items-center justify-between border-b p-3 ${dividerClass}`}>
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${column.tone}`}>{column.title}</span>
                      <span className="text-xs font-semibold text-slate-400">{column.tasks.length}</span>
                    </div>
                    <div className="space-y-3 p-3">
                      {column.tasks.map((task) => (
                        <article key={`${column.title}-${task.title}`} className={`rounded-lg border p-3 shadow-sm ${surfaceClass}`}>
                          <h3 className={`text-sm font-semibold ${textStrongClass}`}>{task.title}</h3>
                          <p className={`mt-1 text-xs ${textMutedClass}`}>{task.project}</p>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-slate-400">{task.owner}</span>
                            <CheckCircle2 className="h-4 w-4 text-[#10b981]" />
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <aside className={`h-full w-full max-w-md border-l p-5 shadow-xl ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`text-lg font-bold ${textStrongClass}`}>Configuracion</h2>
                <p className={`mt-1 text-sm ${textMutedClass}`}>Ajustes visuales y de experiencia del dashboard.</p>
              </div>
              <button className={`rounded-md p-2 ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`} onClick={() => setSettingsOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className={`rounded-lg border p-4 ${mutedSurfaceClass}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className={`font-semibold ${textStrongClass}`}>Tema</p>
                    <p className={`mt-1 text-sm ${textMutedClass}`}>Cambiar entre modo claro y oscuro.</p>
                  </div>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md bg-[#10b981] px-3 text-sm font-semibold text-white" onClick={toggleTheme}>
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {isDark ? 'Claro' : 'Oscuro'}
                  </button>
                </div>
              </div>

              <div className={`rounded-lg border p-4 ${mutedSurfaceClass}`}>
                <p className={`font-semibold ${textStrongClass}`}>Busqueda activa</p>
                <p className={`mt-1 text-sm ${textMutedClass}`}>
                  {normalizedSearch ? `Filtrando por "${searchQuery}" en proyectos, tareas y actividad.` : 'Sin filtros activos.'}
                </p>
                {normalizedSearch && (
                  <button
                    className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${
                      isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                    onClick={() => setSearchQuery('')}
                  >
                    Limpiar busqueda
                  </button>
                )}
              </div>

              <div className={`rounded-lg border p-4 ${mutedSurfaceClass}`}>
                <p className={`font-semibold ${textStrongClass}`}>Datos</p>
                <p className={`mt-1 text-sm ${textMutedClass}`}>
                  {authConfigured ? 'Supabase configurado. El dashboard puede leer datos reales.' : 'Modo demo activo. Los cambios se muestran en pantalla hasta recargar.'}
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${mutedSurfaceClass}`}>
                <p className={`font-semibold ${textStrongClass}`}>Sesion</p>
                <div className={`mt-2 space-y-1 text-sm ${textMutedClass}`}>
                  <p>Email: {user?.email ?? 'Sin sesion'}</p>
                  <p>Permisos: funciones habilitadas para todos los usuarios con acceso</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}
