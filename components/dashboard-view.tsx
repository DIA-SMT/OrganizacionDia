'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { type DashboardProject } from '@/lib/dashboard-data'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check,
  CircleDot,
  Code2,
  FlaskConical,
  FolderOpen,
  GitPullRequest,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
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

function formatCommitDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}


function MetricCard({
  icon,
  label,
  value,
  hint,
  accent,
  isDark,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  accent: string
  isDark: boolean
  href: string
}) {
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
          <div className="mt-4">
            <p className={`text-4xl font-bold leading-none ${isDark ? 'text-white' : 'text-slate-950'}`}>{value}</p>
          </div>
          <p className={`mt-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{hint}</p>
        </div>
      </div>
    </Link>
  )
}

export function DashboardView() {
  const { user, loading, authConfigured, signOut } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<DashboardProject[]>([])
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

    async function fetchDashboard() {
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

      setProjects(nextProjects)
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

  const normalizedSearch = searchQuery.trim().toLowerCase()
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

  function scrollCommitsHorizontally(event: React.WheelEvent<HTMLDivElement>) {
    const container = event.currentTarget
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || container.scrollWidth <= container.clientWidth) return

    event.preventDefault()
    container.scrollLeft += event.deltaY
  }

  const isDark = theme === 'dark'
  const shellClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#eef3f6] text-slate-950'
  const surfaceClass = isDark ? 'border-slate-800 bg-slate-900 shadow-slate-950/20' : 'border-slate-200 bg-[#fbfcfd] shadow-sm'
  const mutedSurfaceClass = isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-[#fbfcfd]'
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'
  const textMutedClass = isDark ? 'text-slate-400' : 'text-slate-500'

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
    <main className={`relative isolate min-h-screen overflow-hidden transition-colors ${shellClass}`}>
      <CursorAiBackground isDark={isDark} />
      <div className="relative z-10 flex min-h-screen flex-col">
          <header className={`border-b backdrop-blur ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-[#fbfcfd]/90'}`}>
            <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex aspect-square h-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#061e3d] ring-1 ring-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="h-full w-full object-cover" src="/logo-dia.png" alt="DIA" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${textStrongClass}`}>DIA</p>
                    <p className="max-w-[11rem] truncate text-xs leading-tight text-slate-400">Direccion de Inteligencia Artificial</p>
                  </div>
                </div>

                <nav className="flex max-w-full gap-1 overflow-x-auto rounded-lg p-1 [scrollbar-width:none]">
                  {[
                    { href: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
                    { href: '/projects', label: 'Proyectos', icon: <Code2 className="h-4 w-4 shrink-0" /> },
                    { href: '/tasks', label: 'Tareas', icon: <GitPullRequest className="h-4 w-4 shrink-0" /> },
                    { href: '/team', label: 'Equipo', icon: <Users className="h-4 w-4 shrink-0" /> },
                    { href: '/commit-history', label: 'Historial', icon: <History className="h-4 w-4 shrink-0" /> },
                    { href: '/papelera', label: 'Papelera', icon: <Trash2 className="h-4 w-4 shrink-0" /> },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                        item.href === '/' ? (isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#e9f8f1] text-[#08784f]') : isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <label className={`flex h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-md border px-3 text-sm sm:min-w-[18rem] ${isDark ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                  <Search className="h-4 w-4" />
                  <input
                    className="w-full bg-transparent outline-none placeholder:text-inherit"
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
                <button
                  className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}
                  onClick={() => setSettingsOpen(true)}
                  title="Configuracion"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="px-4 pb-3">
              <h1 className={`truncate text-xl font-bold ${textStrongClass}`}>Gestion de proyectos</h1>
              <p className={`truncate text-sm ${textMutedClass}`}>Seguimiento operativo del equipo interno DIA</p>
            </div>
          </header>

          <div className="flex-1 px-5 py-5">
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
                    Ver todo
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]" onWheel={scrollCommitsHorizontally}>
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
                isDark={isDark}
                href="/projects?estado=Todos"
              />
              <MetricCard
                icon={<Code2 className="h-4 w-4" />}
                label="En desarrollo"
                value={String(metrics.developmentCount)}
                hint="Construccion activa"
                accent="bg-blue-500"
                isDark={isDark}
                href="/projects?estado=En%20desarrollo"
              />
              <MetricCard
                icon={<GitPullRequest className="h-4 w-4" />}
                label="MVP aprobado"
                value={String(metrics.approvalCount)}
                hint="Esperando revision interna"
                accent="bg-violet-500"
                isDark={isDark}
                href="/projects?estado=MVP%20aprobado"
              />
              <MetricCard
                icon={<FlaskConical className="h-4 w-4" />}
                label="Para testear"
                value={String(metrics.testingCount)}
                hint="Listo para QA"
                accent="bg-sky-500"
                isDark={isDark}
                href="/projects?estado=QA"
              />
              <MetricCard
                icon={<Rocket className="h-4 w-4" />}
                label="En Producción"
                value={String(metrics.productionCount)}
                hint="Finalizados y online"
                accent="bg-emerald-600"
                isDark={isDark}
                href="/projects?estado=En%20Producci%C3%B3n"
              />
              <MetricCard
                icon={<CircleDot className="h-4 w-4" />}
                label="Proyectos pausados"
                value={String(metrics.pausedCount)}
                hint="Detenidos temporalmente"
                accent="bg-red-500"
                isDark={isDark}
                href="/projects?estado=Pausado"
              />
            </section>

          </div>
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
