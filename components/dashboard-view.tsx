'use client'

import { useAuth } from '@/context/AuthContext'
import { ProjectCreateButton } from '@/components/project-create-button'
import { TaskCreateButton } from '@/components/task-create-button'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { mockActivity, mockPipeline, mockProjects, type DashboardProject, type DashboardTask, type PipelineColumn } from '@/lib/dashboard-data'
import Link from 'next/link'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Code2,
  FlaskConical,
  GitPullRequest,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  TrendingUp,
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
  status: string
  priority: string
  estimated_delivery: string | null
}

type TaskProgressRow = {
  project_id: string | null
  status: string
}

type JoinedTaskRow = {
  title: string
  status: string
  projects: { name: string } | { name: string }[] | null
  task_assignees?: Array<{
    members?: { full_name: string } | { full_name: string }[] | null
  }>
}

const pipelineConfig = [
  { title: 'Pendiente', statuses: ['Backlog', 'Pendiente'], tone: 'bg-slate-100 text-slate-700' },
  { title: 'En desarrollo', statuses: ['En desarrollo'], tone: 'bg-blue-50 text-blue-700' },
  { title: 'En aprobacion', statuses: ['En aprobacion', 'En revision'], tone: 'bg-violet-50 text-violet-700' },
  { title: 'Para testear', statuses: ['QA'], tone: 'bg-emerald-50 text-emerald-700' },
]

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
  const [projects, setProjects] = useState<DashboardProject[]>(mockProjects)
  const [pipeline, setPipeline] = useState<PipelineColumn[]>(mockPipeline)
  const [activity, setActivity] = useState<string[]>(mockActivity)
  const [usingMockData, setUsingMockData] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem('organizacion-dia-theme')
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
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
    if (!authConfigured || loading || !user) return
    const currentUser = user

    async function fetchDashboard() {
      const userEmail = currentUser.email ?? 'usuario interno'
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const [{ data: projectRows }, { data: taskProgressRows }, { data: joinedTaskRows }] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, requester_area, stack, repository_url, status, priority, estimated_delivery')
          .eq('active', true)
          .order('estimated_delivery', { ascending: true }),
        supabase.from('tasks').select('project_id, status').eq('active', true),
        supabase
          .from('tasks')
          .select('title, status, projects(name), task_assignees(members(full_name))')
          .eq('active', true)
          .neq('status', 'Terminada')
          .order('updated_at', { ascending: false })
          .limit(20),
      ])

      const progressByProject = new Map<string, { total: number; done: number }>()
      ;((taskProgressRows ?? []) as TaskProgressRow[]).forEach((task) => {
        if (!task.project_id) return
        const current = progressByProject.get(task.project_id) ?? { total: 0, done: 0 }
        current.total += 1
        if (task.status === 'Terminada') current.done += 1
        progressByProject.set(task.project_id, current)
      })

      const nextProjects = ((projectRows ?? []) as ProjectRow[]).map((project) => {
        const progress = progressByProject.get(project.id)
        return {
          name: project.name,
          area: project.requester_area ?? 'Sin area',
          stack: project.stack ?? 'Sin stack',
          status: project.status,
          priority: project.priority,
          progress: progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0,
          delivery: project.estimated_delivery,
          repositoryUrl: project.repository_url,
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
      setUsingMockData(false)
    }

    fetchDashboard().catch((error) => {
      console.error('Error loading dashboard:', error)
      setUsingMockData(true)
    })
  }, [authConfigured, loading, user])

  const metrics = useMemo(() => {
    const activeProjects = projects.filter((project) => project.status === 'En desarrollo').length
    const approvalCount = projects.filter((project) => project.status === 'En aprobacion').length
    const testingCount = projects.filter((project) => project.status === 'QA').length
    const upcomingCount = projects.filter((project) => project.delivery).length

    return {
      activeProjects,
      approvalCount,
      testingCount,
      upcomingCount,
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

  function handleDemoProjectCreated(project: DashboardProject) {
    setProjects((current) => [project, ...current])
    setActivity((current) => [`Proyecto creado: ${project.name}`, ...current].slice(0, 5))
    setUsingMockData(true)
  }

  function statusToColumn(status: string) {
    if (status === 'En desarrollo') return 'En desarrollo'
    if (status === 'En revision') return 'En aprobacion'
    if (status === 'QA') return 'Para testear'
    return 'Pendiente'
  }

  function handleDemoTaskCreated(task: DashboardTask & { status: string }) {
    const columnTitle = statusToColumn(task.status)
    setPipeline((current) =>
      current.map((column) =>
        column.title === columnTitle
          ? {
              ...column,
              tasks: [{ title: task.title, project: task.project, owner: task.owner }, ...column.tasks],
            }
          : column
      )
    )
    setActivity((current) => [`Tarea creada: ${task.title}`, ...current].slice(0, 5))
    setUsingMockData(true)
  }

  const isDark = theme === 'dark'
  const shellClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#f6f8fb] text-slate-950'
  const surfaceClass = isDark ? 'border-slate-800 bg-slate-900 shadow-slate-950/20' : 'border-slate-200 bg-white shadow-sm'
  const mutedSurfaceClass = isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-[#fbfcfd]'
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'
  const textMutedClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const dividerClass = isDark ? 'border-slate-800' : 'border-slate-100'

  return (
    <main className={`min-h-screen transition-colors ${shellClass}`}>
      <div className="flex min-h-screen">
        <aside className={`hidden w-64 border-r px-4 py-5 lg:block ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
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
            <SidebarItem icon={<Code2 className="h-4 w-4" />} label="Proyectos" href="/projects" />
            <SidebarItem icon={<GitPullRequest className="h-4 w-4" />} label="Tareas" href="/tasks" />
            <SidebarItem icon={<FlaskConical className="h-4 w-4" />} label="Testing" href="/testing" />
            <SidebarItem icon={<Users className="h-4 w-4" />} label="Equipo" href="/team" />
          </nav>

          <div className={`mt-8 rounded-lg border p-3 ${mutedSurfaceClass}`}>
            <p className="text-xs font-semibold uppercase text-slate-400">Sprint actual</p>
            <p className={`mt-2 text-sm font-semibold ${textStrongClass}`}>Junio · Semana 2</p>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 w-[62%] rounded-full bg-[#10b981]" />
            </div>
            <p className="mt-2 text-xs text-slate-500">62% de avance planificado</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`border-b ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
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

            <section className={`mb-5 flex flex-col justify-between gap-4 rounded-lg border p-5 md:flex-row md:items-center ${surfaceClass}`}>
              <div>
                <p className="text-xs font-semibold uppercase text-[#0d8f62]">Panel interno</p>
                <h2 className={`mt-1 text-2xl font-bold ${textStrongClass}`}>Proyectos, revision y testing en un solo lugar</h2>
                <p className={`mt-2 max-w-2xl text-sm ${textMutedClass}`}>
                  Una vista compacta para entender que se esta desarrollando, que espera aprobacion y que necesita testeo antes de entregar.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!authConfigured && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Demo sin Supabase</span>}
                  {usingMockData && (
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                      Datos de ejemplo
                    </span>
                  )}
                  {user && <span className="rounded-md bg-[#e9f8f1] px-2 py-1 text-xs font-semibold text-[#08784f]">Sesion activa</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <TaskCreateButton
                  onCreated={() => window.location.reload()}
                  onDemoCreated={handleDemoTaskCreated}
                  demoProjects={projects.map((project) => ({ id: project.name, label: project.name }))}
                  isDark={isDark}
                />
                <ProjectCreateButton onCreated={() => window.location.reload()} onDemoCreated={handleDemoProjectCreated} isDark={isDark} />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <MetricCard
                icon={<Code2 className="h-4 w-4" />}
                label="Proyectos activos"
                value={String(metrics.activeProjects)}
                hint="En seguimiento"
                accent="bg-[#10b981]"
                progress={Math.min(metrics.activeProjects * 24, 96)}
                series={[34, 56, 48, 72, 62, 86, 74]}
                isDark={isDark}
                href="/projects"
              />
              <MetricCard
                icon={<GitPullRequest className="h-4 w-4" />}
                label="En aprobacion"
                value={String(metrics.approvalCount)}
                hint="Esperando revision interna"
                accent="bg-violet-500"
                progress={Math.min(metrics.approvalCount * 35, 100)}
                series={[22, 34, 58, 46, 64, 38, 52]}
                isDark={isDark}
                href="/projects"
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
                href="/testing"
              />
              <MetricCard
                icon={<CalendarClock className="h-4 w-4" />}
                label="Entregas proximas"
                value={String(metrics.upcomingCount)}
                hint="Con fecha estimada"
                accent="bg-amber-500"
                progress={Math.min(metrics.upcomingCount * 30, 100)}
                series={[40, 44, 38, 70, 66, 76, 88]}
                isDark={isDark}
                href="/projects"
              />
            </section>

            <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-slate-200 bg-[#103b3a] p-5 text-white shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-emerald-100/70">Pulso del sprint</p>
                    <h2 className="mt-2 text-2xl font-bold">62% encaminado</h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-50/75">
                      Vista rapida del trabajo activo, revision interna y testing antes de entrega.
                    </p>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/10 text-2xl font-bold">62</div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    ['Dev', '46%'],
                    ['Revision', '18%'],
                    ['QA', '36%'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-white/10 p-3">
                      <p className="text-xs text-emerald-50/70">{label}</p>
                      <p className="mt-1 text-lg font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

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
                    ['Desarrollo', 58, 'bg-[#10b981]'],
                    ['Aprobacion', Math.max(metrics.approvalCount * 22, 16), 'bg-violet-500'],
                    ['Testing', Math.max(metrics.testingCount * 24, 18), 'bg-sky-500'],
                    ['Entrega', Math.max(metrics.upcomingCount * 18, 22), 'bg-amber-500'],
                  ].map(([label, value, color]) => (
                    <div key={label as string}>
                      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
                        <span>{label}</span>
                        <span>{value}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-3 rounded-full ${color}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                  ))}
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
                  {filteredProjects.map((project) => (
                    <Link key={project.name} href="/projects" className={`block p-5 transition ${isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className={`font-semibold ${textStrongClass}`}>{project.name}</h3>
                          <p className={`mt-1 text-sm ${textMutedClass}`}>
                            {project.area} · {project.stack}
                          </p>
                          {project.repositoryUrl && (
                            <a
                              className="mt-2 inline-flex text-xs font-semibold text-[#0d8f62] hover:underline"
                              href={project.repositoryUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver repositorio
                            </a>
                          )}
                        </div>
                        <span className="rounded-md bg-[#eef8ff] px-2 py-1 text-xs font-semibold text-[#1677a8]">{project.status}</span>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span>{project.priority}</span>
                          <span>{project.progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-[#10b981]" style={{ width: `${project.progress}%` }} />
                        </div>
                      </div>
                    </Link>
                  ))}
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
