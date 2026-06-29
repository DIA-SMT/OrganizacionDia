'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type DeletedProject = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  stack: string | null
  status: string
  priority: string
  progress: number | null
  estimated_delivery: string | null
}

export function TrashScreen() {
  const [projects, setProjects] = useState<DeletedProject[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchDeletedProjects() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }

      const { data, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, description, requester_area, stack, status, priority, progress, estimated_delivery')
        .eq('active', false)
        .order('updated_at', { ascending: false })

      if (projectsError) setError(projectsError.message)
      setProjects((data ?? []) as DeletedProject[])
      setLoading(false)
    }

    fetchDeletedProjects()
  }, [])

  async function restoreProject(projectId: string) {
    setError(null)
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setRestoringId(projectId)
    const { error: restoreError } = await supabase.from('projects').update({ active: true }).eq('id', projectId)
    setRestoringId(null)

    if (restoreError) {
      setError(restoreError.message)
      return
    }

    setProjects((current) => current.filter((project) => project.id !== projectId))
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((project) =>
      [project.name, project.description, project.requester_area, project.stack, project.status, project.priority]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [projects, search])

  return (
    <AppShell title="Papelera" subtitle="Proyectos eliminados del dashboard" search={search} onSearchChange={setSearch}>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando papelera...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay proyectos en la papelera.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((project) => (
            <article key={project.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-slate-950 dark:text-white">{project.name}</h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.requester_area ?? 'Sin area'} - {project.stack ?? 'Sin stack'}</p>
                    </div>
                  </div>
                  {project.description && <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{project.description}</p>}
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{project.status}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{project.priority}</span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{project.progress ?? 0}%</span>
                    {project.estimated_delivery && <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{project.estimated_delivery}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md dia-primary-bg px-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                  onClick={() => restoreProject(project.id)}
                  disabled={restoringId === project.id}
                >
                  <RotateCcw className="h-4 w-4" />
                  {restoringId === project.id ? 'Restaurando...' : 'Restaurar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  )
}
