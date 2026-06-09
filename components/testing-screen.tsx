'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type TestingProjectRef = { name: string } | { name: string }[] | null

type TestingTask = {
  id: string
  title: string
  priority: string
  status: string
  projects: TestingProjectRef
}

type TestingProject = {
  id: string
  name: string
  requester_area: string | null
  repository_url: string | null
  priority: string
  estimated_delivery: string | null
}

function getProjectName(projects: TestingProjectRef) {
  if (Array.isArray(projects)) return projects[0]?.name ?? null
  return projects?.name ?? null
}

export function TestingScreen() {
  const [tasks, setTasks] = useState<TestingTask[]>([])
  const [projects, setProjects] = useState<TestingProject[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTesting() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }

      const [{ data: taskRows }, { data: projectRows }] = await Promise.all([
        supabase.from('tasks').select('id, title, priority, status, projects(name)').eq('active', true).eq('status', 'QA'),
        supabase.from('projects').select('id, name, requester_area, repository_url, priority, estimated_delivery').eq('active', true).eq('status', 'QA'),
      ])

      setTasks((taskRows ?? []) as unknown as TestingTask[])
      setProjects((projectRows ?? []) as TestingProject[])
      setLoading(false)
    }

    fetchTesting()
  }, [])

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((project) => [project.name, project.requester_area, project.priority].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [projects, search])

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((task) => [task.title, task.priority, task.status, getProjectName(task.projects)].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [search, tasks])

  return (
    <AppShell title="Testing" subtitle="Proyectos y tareas listas para probar" search={search} onSearchChange={setSearch}>
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando testing...</div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-950 dark:text-white">Proyectos para testear</h2>
            <div className="mt-4 space-y-3">
              {filteredProjects.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No hay proyectos en testing.</p>
              ) : (
                filteredProjects.map((project) => (
                  <div key={project.id} className="rounded-md border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{project.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{project.requester_area ?? 'Sin area'}</p>
                      </div>
                      <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-200">{project.priority}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Entrega: {project.estimated_delivery ?? 'Sin fecha'}</span>
                      {project.repository_url && (
                        <a className="inline-flex items-center gap-1 font-semibold text-[#0d8f62] dark:text-emerald-300" href={project.repository_url} target="_blank" rel="noreferrer">
                          GitHub <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-950 dark:text-white">Tareas en QA</h2>
            <div className="mt-4 space-y-3">
              {filteredTasks.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No hay tareas en QA.</p>
              ) : (
                filteredTasks.map((task) => (
                  <div key={task.id} className="rounded-md border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{task.title}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{getProjectName(task.projects) ?? 'Sin proyecto'} - {task.priority}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}
