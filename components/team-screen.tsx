'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Mail, UserRoundCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type MemberRow = {
  id: string
  full_name: string
  email: string
  role: string | null
  specialty: string | null
  active: boolean
  created_at: string
}

export function TeamScreen() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMembers() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('members')
        .select('id, full_name, email, role, specialty, active, created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })

      setMembers((data ?? []) as MemberRow[])
      setLoading(false)
    }

    fetchMembers()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((member) => [member.full_name, member.email, member.specialty, member.role].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [members, search])

  return (
    <AppShell title="Equipo" subtitle="Usuarios internos habilitados para operar el sistema" search={search} onSearchChange={setSearch}>
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando equipo...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay integrantes cargados.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => (
            <article key={member.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#e9f8f1] text-[#08784f] dark:bg-emerald-500/15 dark:text-emerald-300">
                  <UserRoundCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-slate-950 dark:text-white">{member.full_name || 'Sin nombre'}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{member.specialty ?? 'Sin especialidad'}</p>
                </div>
              </div>

              <a className="mt-5 flex items-center gap-2 text-sm font-medium text-[#0d8f62] dark:text-emerald-300" href={`mailto:${member.email}`}>
                <Mail className="h-4 w-4" />
                <span className="truncate">{member.email}</span>
              </a>

              <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <p className="text-xs text-slate-400 dark:text-slate-500">Acceso</p>
                <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">Funciones habilitadas</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  )
}
