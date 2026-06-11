'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ExternalLink, GitCommitHorizontal } from 'lucide-react'
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
  projectId: string
  projectName: string
  projectStatus: string
  seen?: boolean
}

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

function commitStorageId(commit: Pick<CommitHistoryItem, 'projectId' | 'projectName' | 'repo' | 'sha'>) {
  return `${commit.projectId ?? commit.projectName}:${commit.repo}:${commit.sha}`
}

export function CommitHistoryScreen() {
  const [search, setSearch] = useState('')
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [items, setItems] = useState<CommitHistoryItem[]>([])
  const [selectedDays, setSelectedDays] = useState<number | null>(3)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingCommits, setLoadingCommits] = useState(false)
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
            days: selectedDays,
            allTime: selectedDays === null,
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

        setItems(nextItems)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar commits.')
        setItems([])
      } finally {
        setLoadingCommits(false)
      }
    }

    void fetchCommits()
  }, [projects, selectedDays, seenIds])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [item.projectName, item.message, item.author, item.repo, item.projectStatus].join(' ').toLowerCase().includes(q),
    )
  }, [items, search])

  const activeFilterLabel = timeFilters.find((filter) => filter.days === selectedDays)?.label ?? '3 dias'
  const projectsWithReposCount = projects.filter((project) => project.repository_url || project.repository_url_secondary).length

  return (
    <AppShell title="Historial de commits" subtitle="Bitacora de cambios detectados en repositorios vinculados" search={search} onSearchChange={setSearch}>
      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">{error}</div>}

      <section className="rounded-lg border border-slate-200 bg-[#fbfcfd] shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <GitCommitHorizontal className="h-4 w-4 text-[#0d8f62]" />
                <h2 className="font-semibold text-slate-950 dark:text-white">Commits por periodo</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {loadingProjects || loadingCommits ? 'Actualizando historial...' : `${filteredItems.length} commits - ${projectsWithReposCount} proyectos con repos - ${activeFilterLabel}`}
              </p>
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
                        ? 'border-[#10b981] bg-[#e9f8f1] text-[#08784f] dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
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

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredItems.map((item) => (
            <article key={`${item.projectId}-${item.repo}-${item.sha}`} className="grid gap-3 p-5 transition hover:bg-slate-50/80 lg:grid-cols-[1fr_auto] dark:hover:bg-slate-950/40">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/projects?proyecto=${item.projectId}`} className="font-semibold text-[#0d8f62] hover:underline">
                    {item.projectName}
                  </Link>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.repoLabel}</span>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{item.projectStatus}</span>
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
          ))}
          {filteredItems.length === 0 && (
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
              {loadingProjects || loadingCommits ? 'Buscando commits...' : 'No hay commits para el periodo seleccionado.'}
            </p>
          )}
        </div>
      </section>
    </AppShell>
  )
}
