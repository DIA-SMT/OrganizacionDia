'use client'

import { AppShell } from '@/components/app-shell'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type CommitHistoryItem = {
  sha: string
  message: string
  author: string
  date: string | null
  url: string
  repo: string
  repoLabel: string
  projectId?: string
  projectName: string
  projectStatus: string
  seenAt?: string
}

const commitHistoryStorageKey = 'organizacion-dia-commit-history'

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

export function CommitHistoryScreen() {
  const [search, setSearch] = useState('')
  const [items] = useState<CommitHistoryItem[]>(() => {
    if (typeof window === 'undefined') return []
    const saved = window.localStorage.getItem(commitHistoryStorageKey)
    return saved ? (JSON.parse(saved) as CommitHistoryItem[]) : []
  })

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      [item.projectName, item.message, item.author, item.repo, item.projectStatus].join(' ').toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <AppShell title="Historial de commits" subtitle="Cambios marcados como vistos desde el dashboard" search={search} onSearchChange={setSearch}>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-slate-950 dark:text-white">Commits vistos</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filteredItems.length} movimientos guardados</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredItems.map((item) => (
            <article key={`${item.projectName}-${item.repo}-${item.sha}`} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={item.projectId ? `/projects?proyecto=${item.projectId}` : `/projects?buscar=${encodeURIComponent(item.projectName)}`} className="font-semibold text-[#0d8f62] hover:underline">
                    {item.projectName}
                  </Link>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{item.repoLabel}</span>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{item.projectStatus}</span>
                </div>
                <p className="mt-2 font-semibold text-slate-950 dark:text-white">{item.message}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {item.author} - commit {formatDate(item.date)} - visto {formatDate(item.seenAt)}
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
            <p className="p-5 text-sm text-slate-500 dark:text-slate-400">Todavia no hay commits guardados en el historial.</p>
          )}
        </div>
      </section>
    </AppShell>
  )
}
