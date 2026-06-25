'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { TaskCreateButton } from '@/components/task-create-button'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { type DashboardProject } from '@/lib/dashboard-data'
import { expedientePriorityWeight, formatExpedienteDate } from '@/lib/expedientes'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check,
  Code2,
  ExternalLink,
  FileText,
  GitPullRequest,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Sun,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

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

type TaskProject = { name: string } | { name: string }[] | null

type PendingTask = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  created_at: string
  projects: TaskProject
}

type DashboardExpediente = {
  id: string
  name: string
  summary: string
  drive_url: string
  drive_created_at: string
  status: string
  priority: string
  brief_generated_at: string | null
  brief_error: string | null
}


const projectStatusOrder = ['Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado'] as const
const seenCommitsStorageKey = 'organizacion-dia-seen-commits'
const commitHistoryStorageKey = 'organizacion-dia-commit-history'
const projectStatusChart = [
  { status: 'Planificación', label: 'Planificación', color: 'bg-slate-300', href: '/projects?estado=Planificaci%C3%B3n' },
  { status: 'En desarrollo', label: 'En desarrollo', color: 'bg-amber-400', href: '/projects?estado=En%20desarrollo' },
  { status: 'MVP aprobado', label: 'MVP aprobado', color: 'bg-violet-500', href: '/projects?estado=MVP%20aprobado' },
  { status: 'QA', label: 'QA', color: 'bg-sky-500', href: '/projects?estado=QA' },
  { status: 'En Producción', label: 'En producción', color: 'bg-emerald-600', href: '/projects?estado=En%20Producci%C3%B3n' },
  { status: 'Pausado', label: 'Pausado', color: 'bg-red-500', href: '/projects?estado=Pausado' },
] as const

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

function formatCommitDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function taskProjectName(projects: TaskProject) {
  if (Array.isArray(projects)) return projects[0]?.name ?? 'Sin proyecto'
  return projects?.name ?? 'Sin proyecto'
}

function taskPriorityClass(priority: string, isDark: boolean) {
  if (priority === 'Critica') return isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-700'
  if (priority === 'Alta') return isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700'
  if (priority === 'Media') return isDark ? 'bg-sky-500/15 text-sky-300' : 'bg-sky-50 text-sky-700'
  return isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-500'
}

function projectPriorityWeight(priority: string | null | undefined) {
  if (priority === 'Critica') return 4
  if (priority === 'Alta') return 3
  if (priority === 'Media') return 2
  return 1
}


function SidebarItem({ icon, label, href, active, collapsed, isDark }: { icon: React.ReactNode; label: string; href: string; active?: boolean; collapsed?: boolean; isDark: boolean }) {
  const activeClass = isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-[#eaf3ff] text-[#1554c7]'
  const idleClass = isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
  const className = `flex w-full items-center rounded-lg py-2 text-sm font-medium transition ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? activeClass : idleClass}`

  if (href.startsWith('http')) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={collapsed ? label : undefined}
        aria-label={`${label} (abre en una pestaña nueva)`}
      >
        {icon}
        {!collapsed && label}
      </a>
    )
  }

  return (
    <Link
      href={href}
      className={className}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      {icon}
      {!collapsed && label}
    </Link>
  )
}

export function DashboardView() {
  const { user, loading, authConfigured, signOut } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<DashboardProject[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([])
  const [recentExpedientes, setRecentExpedientes] = useState<DashboardExpediente[]>([])
  const [commitsByProject, setCommitsByProject] = useState<Record<string, ProjectCommitActivity[]>>({})
  const [seenCommitIds, setSeenCommitIds] = useState<string[]>([])
  const [lastCommitSync, setLastCommitSync] = useState<string | null>(null)
  const commitsScrollerRef = useRef<HTMLDivElement>(null)
  const tasksScrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem('organizacion-dia-theme')
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
      const savedSeenCommitIds = window.localStorage.getItem(seenCommitsStorageKey)
      if (savedSeenCommitIds) setSeenCommitIds(JSON.parse(savedSeenCommitIds) as string[])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const scrollers = [commitsScrollerRef.current, tasksScrollerRef.current].filter(
      (scroller): scroller is HTMLDivElement => scroller !== null,
    )

    const listeners = scrollers.map((scroller) => {
      const handleWheel = (event: WheelEvent) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || scroller.scrollWidth <= scroller.clientWidth) return

        event.preventDefault()
        event.stopPropagation()
        scroller.scrollLeft += event.deltaY
      }

      scroller.addEventListener('wheel', handleWheel, { passive: false })
      return () => scroller.removeEventListener('wheel', handleWheel)
    })

    return () => listeners.forEach((removeListener) => removeListener())
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem('organizacion-dia-theme', next)
      return next
    })
  }

  async function refreshPendingTasks() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, status, priority, created_at, projects(name)')
      .eq('active', true)
      .neq('status', 'Terminada')
      .order('updated_at', { ascending: false })
      .limit(30)

    setPendingTasks((data ?? []) as unknown as PendingTask[])
  }

  useEffect(() => {
    if (!authConfigured || loading || user) return
    router.replace('/login?next=/')
  }, [authConfigured, loading, router, user])

  useEffect(() => {
    if (!authConfigured || loading || !user) return

    async function fetchDashboard() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const [projectQuery, taskQuery, expedienteQuery] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, requester_area, stack, repository_url, repository_url_secondary, status, priority, progress, estimated_delivery')
          .eq('active', true)
          .order('estimated_delivery', { ascending: true }),
        supabase
          .from('tasks')
          .select('id, title, description, status, priority, created_at, projects(name)')
          .eq('active', true)
          .neq('status', 'Terminada')
          .order('updated_at', { ascending: false })
          .limit(30),
        supabase
          .from('expedientes')
          .select('id, name, summary, drive_url, drive_created_at, status, priority, brief_generated_at, brief_error')
          .neq('status', 'Archivado')
          .order('drive_created_at', { ascending: false })
          .limit(12),
      ])

      const projectRowsResult = projectQuery.error
        ? await supabase
            .from('projects')
            .select('id, name, requester_area, stack, repository_url, status, priority, progress, estimated_delivery')
            .eq('active', true)
            .order('estimated_delivery', { ascending: true })
        : projectQuery

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

      setProjects(
        [...nextProjects].sort((a, b) => {
          const priorityDiff = projectPriorityWeight(b.priority) - projectPriorityWeight(a.priority)
          if (priorityDiff !== 0) return priorityDiff
          return a.name.localeCompare(b.name)
        }),
      )
      setPendingTasks((taskQuery.data ?? []) as unknown as PendingTask[])
      setRecentExpedientes(
        ((expedienteQuery.data ?? []) as DashboardExpediente[])
          .sort((a, b) => {
            const priorityDiff = expedientePriorityWeight(b.priority) - expedientePriorityWeight(a.priority)
            if (priorityDiff !== 0) return priorityDiff
            return new Date(b.drive_created_at).getTime() - new Date(a.drive_created_at).getTime()
          })
          .slice(0, 4),
      )
    }

    fetchDashboard().catch((error) => {
      console.error('Error loading dashboard:', error)
    })
  }, [authConfigured, loading, user])

  const projectCommitSources = useMemo(
    () =>
      projects
        .filter((project) => project.repositoryUrl || project.repositoryUrlSecondary)
        .map((project) => ({
          id: project.id ?? project.name,
          repositoryUrl: project.repositoryUrl,
          repositoryUrlSecondary: project.repositoryUrlSecondary,
        })),
    [projects],
  )

  const projectCommitSourceSignature = useMemo(
    () => projectCommitSources.map((project) => `${project.id}:${project.repositoryUrl ?? ''}:${project.repositoryUrlSecondary ?? ''}`).join('|'),
    [projectCommitSources],
  )

  useEffect(() => {
    if (projectCommitSources.length === 0) return

    let cancelled = false

    async function fetchProjectCommits() {
      if (document.visibilityState === 'hidden') return

      try {
        const response = await fetch('/api/github/project-commits', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            days: 2,
            limitPerRepo: 12,
            projects: projectCommitSources,
          }),
        })
        const payload = (await response.json()) as {
          commitsByProject?: Record<string, ProjectCommitActivity[]>
        }
        if (!cancelled && payload.commitsByProject) {
          const hasCommits = Object.values(payload.commitsByProject).some((commits) => commits.length > 0)
          if (hasCommits) setCommitsByProject(payload.commitsByProject)
          setLastCommitSync(new Date().toISOString())
        }
      } catch {
        return
      }
    }

    fetchProjectCommits()
    const interval = window.setInterval(fetchProjectCommits, 180000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [
    projectCommitSourceSignature,
    projectCommitSources,
  ])

  const metrics = useMemo(() => {
    const statusCounts = Object.fromEntries(projectStatusOrder.map((status) => [status, 0])) as Record<(typeof projectStatusOrder)[number], number>

    projects.forEach((project) => {
      const status = normalizeProjectStatus(project.status)
      if (projectStatusOrder.includes(status as (typeof projectStatusOrder)[number])) {
        statusCounts[status as (typeof projectStatusOrder)[number]] += 1
      }
    })

    const totalProjects = projects.filter((project) => !['En Producción', 'Pausado'].includes(normalizeProjectStatus(project.status))).length
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
  const shellClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#eef3f6] text-slate-950'
  const surfaceClass = isDark ? 'border-slate-800 bg-slate-900 shadow-slate-950/20' : 'border-slate-200 bg-[#fbfcfd] shadow-sm'
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'
  const textMutedClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const chartMax = 10
  const chartTicks = Array.from({ length: chartMax + 1 }, (_, index) => chartMax - index)

  if (authConfigured && (loading || !user)) {
    return (
      <main className={`relative isolate flex min-h-screen items-center justify-center transition-colors ${shellClass}`}>
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${isDark ? 'border-slate-800 bg-slate-900 text-slate-300' : 'border-slate-200 bg-[#fbfcfd] text-slate-600'}`}>
          Verificando sesion...
        </div>
      </main>
    )
  }

  return (
    <main className={`relative isolate min-h-screen overflow-x-hidden transition-colors ${shellClass}`}>
      <CursorAiBackground isDark={isDark} />
      <div className="relative z-10 flex min-h-screen">
        <aside
          className={`sticky top-0 flex min-h-screen shrink-0 self-stretch flex-col border-r px-3 py-4 transition-[width] duration-200 ${sidebarCollapsed ? 'w-16' : 'w-56'} ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-[#fbfcfd]/95'}`}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
          onFocusCapture={() => setSidebarCollapsed(false)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSidebarCollapsed(true)
          }}
        >
          <div className={`mb-6 px-1 py-1 ${sidebarCollapsed ? 'flex justify-center' : 'flex items-center justify-between gap-2'}`}>
            <div className={`flex min-w-0 items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="flex aspect-square h-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#061e3d] ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="h-full w-full object-cover" src="/logo-dia.png" alt="DIA" />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className={`text-sm font-bold ${textStrongClass}`}>DIA</p>
                  <p className="text-xs leading-tight text-slate-400">Direccion de Inteligencia Artificial</p>
                </div>
              )}
            </div>
          </div>

          <nav className="space-y-1">
            <SidebarItem icon={<LayoutDashboard className="h-4 w-4 shrink-0" />} label="Dashboard" href="/" active collapsed={sidebarCollapsed} isDark={isDark} />
            <SidebarItem icon={<Code2 className="h-4 w-4 shrink-0" />} label="Proyectos" href="/projects" collapsed={sidebarCollapsed} isDark={isDark} />
            <SidebarItem icon={<GitPullRequest className="h-4 w-4 shrink-0" />} label="Tareas" href="/tasks" collapsed={sidebarCollapsed} isDark={isDark} />
            <SidebarItem icon={<Users className="h-4 w-4 shrink-0" />} label="Equipo" href="/team" collapsed={sidebarCollapsed} isDark={isDark} />
            <SidebarItem icon={<FileText className="h-4 w-4 shrink-0" />} label="Expedientes" href="/expedientes" collapsed={sidebarCollapsed} isDark={isDark} />
            <SidebarItem icon={<History className="h-4 w-4 shrink-0" />} label="Historial" href="/commit-history" collapsed={sidebarCollapsed} isDark={isDark} />
            <SidebarItem icon={<Trash2 className="h-4 w-4 shrink-0" />} label="Papelera" href="/papelera" collapsed={sidebarCollapsed} isDark={isDark} />
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`border-b backdrop-blur ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-[#fbfcfd]/90'}`}>
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
                  <p className="text-xs font-semibold uppercase text-[#1769e0]">Ultimas modificaciones</p>
                  <h2 className={`mt-1 text-xl font-bold ${textStrongClass}`}>Resumen de lo trabajado en los proyectos</h2>
                  <p className={`mt-2 max-w-2xl text-sm ${textMutedClass}`}>
                    Cambios recientes detectados desde los repositorios vinculados. Selecciona uno para abrir el proyecto con mas detalle.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-[#eaf3ff] text-[#1554c7]'}`}>
                    En vivo
                  </span>
                  <Link href="/commit-history" className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <History className="h-4 w-4" />
                    Ver todo
                  </Link>
                </div>
              </div>

              <div ref={commitsScrollerRef} className="mt-4 flex gap-3 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        <span className={`truncate text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`}>{change.projectName}</span>
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

            <section className={`mb-5 rounded-lg border p-5 ${surfaceClass}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#1769e0]">Trabajo pendiente</p>
                  <h2 className={`mt-1 text-xl font-bold ${textStrongClass}`}>Tareas por resolver</h2>
                  <p className={`mt-2 text-sm ${textMutedClass}`}>Tareas activas ordenadas por la modificacion mas reciente.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/tasks"
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                      isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <GitPullRequest className="h-4 w-4" />
                    Ver tareas
                  </Link>
                  <TaskCreateButton onCreated={() => void refreshPendingTasks()} isDark={isDark} />
                </div>
              </div>

              <div ref={tasksScrollerRef} className="mt-4 flex gap-3 overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {pendingTasks.length > 0 ? (
                  pendingTasks.map((task) => (
                    <Link
                      key={task.id}
                      href="/tasks"
                      className={`min-h-[148px] w-[290px] shrink-0 rounded-md border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
                        isDark ? 'border-slate-800 bg-slate-950/70 hover:bg-slate-950' : 'border-slate-200 bg-slate-50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`truncate text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`}>{taskProjectName(task.projects)}</span>
                        <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-semibold ${taskPriorityClass(task.priority, isDark)}`}>{task.priority}</span>
                      </div>
                      <h3 className={`mt-3 line-clamp-2 text-sm font-semibold leading-5 ${textStrongClass}`}>{task.title}</h3>
                      {task.description && <p className={`mt-1 line-clamp-1 text-xs ${textMutedClass}`}>{task.description}</p>}
                      <div className={`mt-3 flex items-center justify-between gap-3 text-xs ${textMutedClass}`}>
                        <span>{task.status}</span>
                        <span>{formatCommitDate(task.created_at)}</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className={`w-full rounded-md border p-4 text-sm ${isDark ? 'border-slate-800 bg-slate-950/70 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                    No hay tareas pendientes.
                  </div>
                )}
              </div>
            </section>

            <section className={`mb-5 rounded-lg border p-5 ${surfaceClass}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#1769e0]">Expedientes</p>
                  <h2 className={`mt-1 text-xl font-bold ${textStrongClass}`}>PDFs recientes desde Drive</h2>
                  <p className={`mt-2 text-sm ${textMutedClass}`}>Pantallazo rapido de los ultimos expedientes detectados.</p>
                </div>
                <Link
                  href="/expedientes"
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                    isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Ver expedientes
                </Link>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {recentExpedientes.length > 0 ? (
                  recentExpedientes.map((expediente) => (
                    <article key={expediente.id} className={`rounded-md border p-4 ${isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-bold ${textStrongClass}`}>{expediente.name}</p>
                          <p className={`mt-1 text-xs ${textMutedClass}`}>{formatExpedienteDate(expediente.drive_created_at)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${expediente.priority === 'Alta' ? (isDark ? 'bg-red-500/15 text-red-300' : 'bg-red-50 text-red-700') : isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-[#eaf3ff] text-[#1554c7]'}`}>
                            {expediente.priority}
                          </span>
                          <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-500'}`}>
                            {expediente.status}
                          </span>
                        </div>
                      </div>
                      {expediente.brief_generated_at && expediente.summary ? (
                        <p className={`mt-3 line-clamp-2 text-sm leading-5 ${textMutedClass}`}>{expediente.summary}</p>
                      ) : null}
                      <p className={`mt-2 text-[11px] ${expediente.brief_error ? 'text-red-400' : textMutedClass}`}>
                        {expediente.brief_error ? 'Brief OCR pendiente' : expediente.brief_generated_at ? 'Brief OCR guardado' : 'Esperando brief OCR'}
                      </p>
                      <a className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`} href={expediente.drive_url} target="_blank" rel="noreferrer">
                        Abrir PDF
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </article>
                  ))
                ) : (
                  <div className={`rounded-md border p-4 text-sm lg:col-span-2 ${isDark ? 'border-slate-800 bg-slate-950/70 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                    Todavia no hay expedientes sincronizados. Usa la pestaña Expedientes para conectar Drive.
                  </div>
                )}
              </div>
            </section>

            <section className={`rounded-lg border p-5 ${surfaceClass}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-[#1769e0]">Distribución operativa</p>
                  <h2 className={`mt-1 text-xl font-bold ${textStrongClass}`}>Proyectos por estado</h2>
                  <p className={`mt-2 text-sm ${textMutedClass}`}>Vista rápida del trabajo en marcha, detenido y finalizado.</p>
                </div>
                <Link
                  href="/projects?estado=Todos"
                  className={`inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                    isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Ver proyectos
                </Link>
              </div>

              <div className="mt-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="min-w-[680px]">
                  <div className="relative h-80 pl-9">
                    {chartTicks.map((value) => (
                      <div
                        key={value}
                        className="absolute left-0 right-0 flex items-center gap-3"
                        style={{ bottom: `${(value / chartMax) * 100}%` }}
                      >
                        <span className={`w-6 -translate-y-1/2 text-right text-xs tabular-nums ${textMutedClass}`}>{value}</span>
                        <span className={`h-px flex-1 border-t border-dashed ${isDark ? 'border-slate-700/70' : 'border-slate-200'}`} />
                      </div>
                    ))}

                    <div className={`absolute inset-y-0 left-9 right-0 z-10 grid grid-cols-6 gap-4 border-b px-3 ${isDark ? 'border-slate-600' : 'border-slate-300'}`}>
                    {projectStatusChart.map((item) => {
                      const count = metrics.statusCounts[item.status]
                      const height = Math.min(100, (count / chartMax) * 100)

                      return (
                        <Link key={item.status} href={item.href} className="group relative h-full min-w-0">
                            <div
                              className={`absolute bottom-0 left-1/2 w-full max-w-24 -translate-x-1/2 rounded-t-lg ${item.color} shadow-sm transition-[height,filter,transform] duration-500 group-hover:-translate-x-1/2 group-hover:-translate-y-1 group-hover:brightness-95`}
                              style={{ height: `${height}%` }}
                            >
                              <span className="absolute left-1/2 top-2 -translate-x-1/2 text-sm font-bold text-white drop-shadow-sm">{count}</span>
                              <div className={`pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-md border p-3 text-left shadow-xl group-hover:block ${
                                isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
                              }`}>
                                <p className="text-sm font-semibold">{item.label}</p>
                                <p className={`mt-1 text-xs ${textMutedClass}`}>{count} proyecto{count === 1 ? '' : 's'}</p>
                              </div>
                            </div>
                        </Link>
                      )
                    })}
                    </div>
                  </div>

                  <div className="ml-9 grid grid-cols-6 gap-4 px-3">
                    {projectStatusChart.map((item) => (
                      <Link key={item.status} href={item.href} className={`mt-3 min-h-10 text-center text-xs font-medium leading-4 ${textMutedClass}`}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>

          </div>
        </section>
      </div>

    </main>
  )
}
