'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type ProjectRow = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  stack: string | null
  repository_url: string | null
  status: string
  priority: string
  estimated_delivery: string | null
}

export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProjects() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('projects')
        .select('id, name, description, requester_area, stack, repository_url, status, priority, estimated_delivery')
        .eq('active', true)
        .order('created_at', { ascending: false })

      setProjects((data ?? []) as ProjectRow[])
      setLoading(false)
    }

    fetchProjects()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((project) => [project.name, project.description, project.requester_area, project.stack, project.status, project.priority].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [projects, search])

  return (
    <AppShell title="Proyectos" subtitle="Informacion cargada de cada proyecto" search={search} onSearchChange={setSearch}>
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando proyectos...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay proyectos cargados.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((project) => (
            <article key={project.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white">{project.name}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.requester_area ?? 'Sin area'} - {project.stack ?? 'Sin stack'}</p>
                </div>
                <span className="rounded-md bg-[#e9f8f1] px-2 py-1 text-xs font-semibold text-[#08784f] dark:bg-emerald-500/15 dark:text-emerald-300">{project.status}</span>
              </div>

              {project.description && <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{project.description}</p>}

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Prioridad</p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{project.priority}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Entrega</p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{project.estimated_delivery ?? 'Sin fecha'}</p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
                  <p className="text-xs text-slate-400 dark:text-slate-500">Repositorio</p>
                  {project.repository_url ? (
                    <a className="mt-1 inline-flex items-center gap-1 font-semibold text-[#0d8f62] dark:text-emerald-300" href={project.repository_url} target="_blank" rel="noreferrer">
                      GitHub <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">Sin link</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  )
}
