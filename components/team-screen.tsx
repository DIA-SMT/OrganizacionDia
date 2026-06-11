'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { CalendarDays, Gamepad2, Heart, ImageIcon, Mail, Plus, Save, Sparkles, Utensils, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type MemberRow = {
  id: string
  full_name: string
  email: string
  role: string | null
  specialty: string | null
  avatar_url: string | null
  birthday: string | null
  favorite_food: string | null
  hobby: string | null
  favorite_game: string | null
  active: boolean
  created_at: string
}

type MemberProfileField = 'full_name' | 'email' | 'role' | 'birthday' | 'specialty' | 'avatar_url' | 'favorite_food' | 'hobby' | 'favorite_game'
type MemberRole = 'Admin' | 'PM' | 'Dev' | 'QA' | 'Viewer'

const emptyProfile = {
  avatar_url: null,
  birthday: null,
  favorite_food: null,
  hobby: null,
  favorite_game: null,
}

function memberInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  return initials || 'DIA'
}

export function TeamScreen() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newMember, setNewMember] = useState({
    full_name: '',
    email: '',
    role: 'Dev' as MemberRole,
    specialty: '',
    avatar_url: '',
    birthday: '',
    favorite_food: '',
    hobby: '',
    favorite_game: '',
  })

  const fetchMembers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: membersError } = await supabase
      .from('members')
      .select('id, full_name, email, role, specialty, avatar_url, birthday, favorite_food, hobby, favorite_game, active, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (!membersError) {
      setMembers((data ?? []) as MemberRow[])
      setLoading(false)
      return
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('members')
      .select('id, full_name, email, role, specialty, active, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (fallbackError) {
      setError(fallbackError.message)
      setMembers([])
    } else {
      setMembers(((fallbackData ?? []) as Omit<MemberRow, keyof typeof emptyProfile>[]).map((member) => ({ ...member, ...emptyProfile })))
      setError('Faltan columnas de perfil en Supabase. Ejecuta supabase/add_member_profile_fields.sql para guardar cumpleaños, comida, hobby y juego.')
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchMembers)
  }, [fetchMembers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((member) =>
      [member.full_name, member.email, member.specialty, member.role, member.favorite_food, member.hobby, member.favorite_game]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [members, search])

  function updateLocalMember(memberId: string, field: MemberProfileField, value: string) {
    setMembers((current) => current.map((member) => (member.id === memberId ? { ...member, [field]: value || null } : member)))
  }

  async function saveMember(member: MemberRow) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setSavingId(member.id)
    setError(null)

    const { error: updateError } = await supabase
      .from('members')
      .update({
        birthday: member.birthday || null,
        full_name: member.full_name.trim() || 'Sin nombre',
        email: member.email.trim() || null,
        role: member.role || 'Dev',
        specialty: member.specialty || null,
        avatar_url: member.avatar_url || null,
        favorite_food: member.favorite_food || null,
        hobby: member.hobby || null,
        favorite_game: member.favorite_game || null,
      })
      .eq('id', member.id)

    if (updateError) {
      setError(`${updateError.message}. Si faltan columnas, ejecuta supabase/add_member_profile_fields.sql.`)
    }

    setSavingId(null)
  }

  async function createMember(event: React.FormEvent) {
    event.preventDefault()

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setCreating(true)
    setError(null)

    const insertPayload = {
      full_name: newMember.full_name.trim(),
      email: newMember.email.trim() || null,
      role: newMember.role,
      specialty: newMember.specialty || null,
      avatar_url: newMember.avatar_url || null,
      birthday: newMember.birthday || null,
      favorite_food: newMember.favorite_food || null,
      hobby: newMember.hobby || null,
      favorite_game: newMember.favorite_game || null,
    }

    try {
      const { error: insertError } = await supabase.from('members').insert(insertPayload)

      if (insertError) {
        const fallbackPayload = {
          full_name: insertPayload.full_name,
          email: insertPayload.email,
          role: insertPayload.role,
          specialty: insertPayload.specialty,
        }
        const { error: fallbackError } = await supabase.from('members').insert(fallbackPayload)
        if (fallbackError) throw insertError
        setError('Persona creada. Para guardar cumpleaños, comida, hobby y juego ejecuta supabase/add_member_profile_fields.sql.')
      }

      setNewMember({
        full_name: '',
        email: '',
        role: 'Dev',
        specialty: '',
        avatar_url: '',
        birthday: '',
        favorite_food: '',
        hobby: '',
        favorite_game: '',
      })
      setCreateOpen(false)
      await fetchMembers()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'No se pudo crear la persona'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  const inputClass = 'mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500'

  return (
    <AppShell title="Equipo" subtitle="Usuarios internos habilitados para operar el sistema" search={search} onSearchChange={setSearch}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{filtered.length} personas visibles</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Integrantes que trabajan en proyectos de la DIA.</p>
        </div>
        <button className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#10b981] text-white shadow-sm hover:bg-[#0d9f6e]" onClick={() => setCreateOpen(true)} title="Agregar persona">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">{error}</div>}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando equipo...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay integrantes cargados.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => (
            <article key={member.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9f8f1] text-sm font-bold text-[#08784f] ring-2 ring-white dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-slate-800">
                  {member.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="h-full w-full object-cover" src={member.avatar_url} alt={`Foto de ${member.full_name}`} />
                  ) : (
                    memberInitials(member.full_name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    className="w-full rounded-md border border-transparent bg-transparent px-0 text-base font-bold text-slate-950 outline-none transition focus:border-slate-200 focus:bg-white focus:px-2 dark:text-white dark:focus:border-slate-700 dark:focus:bg-slate-950"
                    value={member.full_name}
                    onChange={(event) => updateLocalMember(member.id, 'full_name', event.target.value)}
                    placeholder="Nombre"
                  />
                  <select
                    className="mt-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                    value={member.role ?? 'Dev'}
                    onChange={(event) => updateLocalMember(member.id, 'role', event.target.value)}
                  >
                    <option>Admin</option>
                    <option>PM</option>
                    <option>Dev</option>
                    <option>QA</option>
                    <option>Viewer</option>
                  </select>
                </div>
                </div>
                <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => saveMember(member)} disabled={savingId === member.id} title="Guardar datos">
                  <Save className="h-4 w-4" />
                </button>
              </div>

              <label className="mt-5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span>
                <input className={inputClass} type="email" value={member.email ?? ''} onChange={(event) => updateLocalMember(member.id, 'email', event.target.value)} placeholder="persona@dominio.com" />
              </label>

              <div className="mt-5 grid gap-3">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> Skill</span>
                  <input className={inputClass} value={member.specialty ?? ''} onChange={(event) => updateLocalMember(member.id, 'specialty', event.target.value)} placeholder="Frontend, Backend, QA..." />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /> Foto</span>
                  <input className={inputClass} value={member.avatar_url ?? ''} onChange={(event) => updateLocalMember(member.id, 'avatar_url', event.target.value)} placeholder="https://..." />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" /> Cumpleaños</span>
                  <input className={inputClass} type="date" value={member.birthday ?? ''} onChange={(event) => updateLocalMember(member.id, 'birthday', event.target.value)} />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-2"><Utensils className="h-3.5 w-3.5" /> Comida favorita</span>
                    <input className={inputClass} value={member.favorite_food ?? ''} onChange={(event) => updateLocalMember(member.id, 'favorite_food', event.target.value)} placeholder="Milanesa, sushi..." />
                  </label>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-2"><Heart className="h-3.5 w-3.5" /> Hobby</span>
                    <input className={inputClass} value={member.hobby ?? ''} onChange={(event) => updateLocalMember(member.id, 'hobby', event.target.value)} placeholder="Gimnasio, musica..." />
                  </label>
                </div>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-2"><Gamepad2 className="h-3.5 w-3.5" /> Juego favorito</span>
                  <input className={inputClass} value={member.favorite_game ?? ''} onChange={(event) => updateLocalMember(member.id, 'favorite_game', event.target.value)} placeholder="FIFA, Valorant, Minecraft..." />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <form onSubmit={createMember} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Agregar persona</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Alta rapida para integrantes del equipo.</p>
              </div>
              <button type="button" className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setCreateOpen(false)} title="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Nombre
                  <input className={inputClass} value={newMember.full_name} onChange={(event) => setNewMember({ ...newMember, full_name: event.target.value })} placeholder="Nombre y apellido" required />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Email
                  <input className={inputClass} type="email" value={newMember.email} onChange={(event) => setNewMember({ ...newMember, email: event.target.value })} placeholder="persona@dominio.com" />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Rol
                  <select className={inputClass} value={newMember.role} onChange={(event) => setNewMember({ ...newMember, role: event.target.value as MemberRole })}>
                    <option>Admin</option>
                    <option>PM</option>
                    <option>Dev</option>
                    <option>QA</option>
                    <option>Viewer</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Skill
                  <input className={inputClass} value={newMember.specialty} onChange={(event) => setNewMember({ ...newMember, specialty: event.target.value })} placeholder="Frontend, Backend, Diseño..." />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Cumpleaños
                <input className={inputClass} type="date" value={newMember.birthday} onChange={(event) => setNewMember({ ...newMember, birthday: event.target.value })} />
              </label>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Foto
                <input className={inputClass} value={newMember.avatar_url} onChange={(event) => setNewMember({ ...newMember, avatar_url: event.target.value })} placeholder="https://..." />
              </label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Comida favorita
                  <input className={inputClass} value={newMember.favorite_food} onChange={(event) => setNewMember({ ...newMember, favorite_food: event.target.value })} placeholder="Milanesa" />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Hobby
                  <input className={inputClass} value={newMember.hobby} onChange={(event) => setNewMember({ ...newMember, hobby: event.target.value })} placeholder="Musica" />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Juego favorito
                  <input className={inputClass} value={newMember.favorite_game} onChange={(event) => setNewMember({ ...newMember, favorite_game: event.target.value })} placeholder="Valorant" />
                </label>
              </div>
            </div>

            <button className="mt-5 h-10 w-full rounded-md bg-[#10b981] text-sm font-semibold text-white disabled:opacity-60" disabled={creating}>
              {creating ? 'Guardando...' : 'Agregar persona'}
            </button>
          </form>
        </div>
      )}
    </AppShell>
  )
}
