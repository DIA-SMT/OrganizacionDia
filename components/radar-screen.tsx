'use client'

import { AppShell } from '@/components/app-shell'
import { useAuth } from '@/context/AuthContext'
import { filterCatalog, getTeamOptions, type CatalogProject } from '@/lib/catalog-filters'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ExternalLink, GitBranch, Globe, Radar } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function statusTone(status: string) {
  if (status === 'Pausado') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
  if (status === 'QA') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300'
  if (status === 'MVP aprobado') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300'
  if (status === 'En Producción') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'En desarrollo') return 'border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-800/70 dark:bg-yellow-400/15 dark:text-yellow-200'
  return 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
}

function repoLabel(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`.replace(/\/$/, '')
  } catch {
    return url
  }
}

export function RadarScreen() {
  const { teamSlug: ownTeamSlug } = useAuth()
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [projects, setProjects] = useState<CatalogProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCatalog() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase no esta configurado.')
        setLoading(false)
        return
      }

      setError(null)
      setLoading(true)
      const { data, error: catalogError } = await supabase
        .from('project_catalog')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

      if (catalogError) {
        setError(catalogError.message)
        setProjects([])
      } else {
        setProjects((data ?? []) as unknown as CatalogProject[])
      }
      setLoading(false)
    }

    void fetchCatalog()
  }, [])

  const teamOptions = useMemo(() => getTeamOptions(projects), [projects])
  const filteredProjects = useMemo(() => filterCatalog(projects, teamFilter, search), [projects, teamFilter, search])

  return (
    <AppShell title="Radar de proyectos" subtitle="Que esta desarrollando cada equipo" search={search} onSearchChange={setSearch}>
      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 dia-surface-bg shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Radar className="h-4 w-4 dia-primary-text" />
                <h2 className="font-semibold text-slate-950 dark:text-white">Catalogo compartido</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {loading
                  ? 'Actualizando catalogo...'
                  : `${filteredProjects.length} proyectos - la ficha publica de cada equipo, para detectar cruces a tiempo`}
              </p>
            </div>

            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              <button
                type="button"
                className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold transition ${
                  teamFilter === null
                    ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
                onClick={() => setTeamFilter(null)}
              >
                Todos ({projects.length})
              </button>
              {teamOptions.map((team) => {
                const active = teamFilter === team.slug
                return (
                  <button
                    key={team.slug}
                    type="button"
                    className={`flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                      active
                        ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setTeamFilter(active ? null : team.slug)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color ?? '#94a3b8' }} />
                    {team.name} ({team.count})
                    {team.slug === ownTeamSlug && <span className="text-xs font-normal text-slate-400">tu equipo</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <article
              key={project.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 font-semibold text-slate-950 dark:text-white">{project.name}</h3>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: project.team_color ?? '#64748b' }}
                >
                  {project.team_name}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${statusTone(project.status)}`}>{project.status}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {project.priority}
                </span>
              </div>

              {project.description && <p className="text-sm text-slate-500 dark:text-slate-400">{project.description}</p>}

              <dl className="space-y-1 text-sm text-slate-500 dark:text-slate-400">
                {project.stack && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">Stack:</dt>
                    <dd className="min-w-0">{project.stack}</dd>
                  </div>
                )}
                {project.requester_area && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">Area:</dt>
                    <dd className="min-w-0">{project.requester_area}</dd>
                  </div>
                )}
                {project.technical_owner_name && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">Responsable:</dt>
                    <dd className="min-w-0">{project.technical_owner_name}</dd>
                  </div>
                )}
                {formatDate(project.estimated_delivery) && (
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-semibold text-slate-600 dark:text-slate-300">Entrega estimada:</dt>
                    <dd className="min-w-0">{formatDate(project.estimated_delivery)}</dd>
                  </div>
                )}
              </dl>

              {(project.repository_url || project.repository_url_secondary || project.website_url) && (
                <div className="mt-auto flex flex-col gap-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                  {project.repository_url && (
                    <a
                      className="flex min-w-0 items-center gap-2 dia-primary-text hover:underline"
                      href={project.repository_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GitBranch className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{repoLabel(project.repository_url)}</span>
                    </a>
                  )}
                  {project.repository_url_secondary && (
                    <a
                      className="flex min-w-0 items-center gap-2 dia-primary-text hover:underline"
                      href={project.repository_url_secondary}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GitBranch className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{repoLabel(project.repository_url_secondary)}</span>
                    </a>
                  )}
                  {project.website_url && (
                    <a
                      className="flex min-w-0 items-center gap-2 dia-primary-text hover:underline"
                      href={project.website_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Sitio</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
              )}
            </article>
          ))}
          {filteredProjects.length === 0 && (
            <p className="col-span-full p-2 text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Buscando proyectos...' : 'No hay proyectos para el filtro seleccionado.'}
            </p>
          )}
        </div>
      </section>
    </AppShell>
  )
}
