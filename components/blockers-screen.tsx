'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type BlockerRow = {
  id: string
  reason: string
  status: string
  created_at: string
  tasks: { title: string } | { title: string }[] | null
  blocked_by: { full_name: string } | { full_name: string }[] | null
}

function taskTitle(value: BlockerRow['tasks']) {
  if (!value) return 'Sin tarea'
  return Array.isArray(value) ? value[0]?.title ?? 'Sin tarea' : value.title
}

function memberName(value: BlockerRow['blocked_by']) {
  if (!value) return 'Sin responsable'
  return Array.isArray(value) ? value[0]?.full_name ?? 'Sin responsable' : value.full_name
}

export function BlockersScreen() {
  const [blockers, setBlockers] = useState<BlockerRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBlockers() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('blockers')
        .select('id, reason, status, created_at, tasks(title), blocked_by:members!blockers_blocked_by_id_fkey(full_name)')
        .order('created_at', { ascending: false })

      setBlockers((data ?? []) as BlockerRow[])
      setLoading(false)
    }

    fetchBlockers()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return blockers
    return blockers.filter((blocker) =>
      [blocker.reason, blocker.status, taskTitle(blocker.tasks), memberName(blocker.blocked_by)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [blockers, search])

  return (
    <AppShell title="Impedimentos" subtitle="Bloqueos operativos cargados desde Supabase" search={search} onSearchChange={setSearch}>
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando impedimentos...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay impedimentos cargados.</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((blocker) => (
            <article key={blocker.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h2 className="font-semibold text-slate-950 dark:text-white">{blocker.reason}</h2>
                    <span className="w-fit rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{blocker.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {taskTitle(blocker.tasks)} - {memberName(blocker.blocked_by)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  )
}
