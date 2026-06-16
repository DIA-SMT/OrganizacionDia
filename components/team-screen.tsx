'use client'

import { AppShell } from '@/components/app-shell'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { CalendarDays, Gamepad2, Heart, Mail, Pencil, Plus, Save, Trash2, Utensils, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type MemberRow = {
  id: string
  full_name: string
  email: string | null
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

function memberAvatarFallback(name: string) {
  return name.trim() || 'Sin nombre'
}

function fallbackNameClass(name: string) {
  const length = memberAvatarFallback(name).length
  if (length > 26) return 'text-[13px]'
  if (length > 18) return 'text-sm'
  if (length > 12) return 'text-base'
  return 'text-lg'
}

function formatBirthday(value: string | null) {
  if (!value) return 'Sin cargar'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long' }).format(new Date(`${value}T00:00:00`))
}

function ProfileInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-400">{icon}{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">{value || 'Sin cargar'}</p>
    </div>
  )
}

export function TeamScreen() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
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
      setError('Faltan columnas de perfil en Supabase. Ejecuta supabase/add_member_profile_fields.sql para guardar foto, cumpleaños, comida, hobby y juego.')
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

  const selectedMember = selectedMemberId ? members.find((member) => member.id === selectedMemberId) ?? null : null
  const editingMember = editingMemberId ? members.find((member) => member.id === editingMemberId) ?? null : null

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
        email: member.email?.trim() || null,
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
    } else {
      setEditingMemberId(null)
    }

    setSavingId(null)
  }

  async function deleteMember(member: MemberRow) {
    const confirmed = window.confirm(`Eliminar el perfil de "${member.full_name || 'Sin nombre'}"?`)
    if (!confirmed) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setSavingId(member.id)
    setError(null)

    const { error: deleteError } = await supabase.from('members').update({ active: false }).eq('id', member.id)

    if (deleteError) {
      setError(deleteError.message)
    } else {
      setMembers((current) => current.filter((item) => item.id !== member.id))
      setSelectedMemberId(null)
      setEditingMemberId(null)
    }

    setSavingId(null)
  }

  function handleAvatarFile(member: MemberRow, file: File | null) {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('La foto tiene que ser una imagen.')
      return
    }

    if (file.size > 1_500_000) {
      setError('La foto no puede superar 1.5 MB.')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => setError('No se pudo leer la imagen seleccionada.')
    reader.onload = () => {
      const avatarUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!avatarUrl) {
        setError('No se pudo cargar la imagen seleccionada.')
        return
      }

      const updatedMember = { ...member, avatar_url: avatarUrl }
      setMembers((current) => current.map((currentMember) => (currentMember.id === member.id ? updatedMember : currentMember)))
      void saveMember(updatedMember)
    }
    reader.readAsDataURL(file)
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
        setError('Persona creada. Para guardar foto, cumpleaños, comida, hobby y juego ejecuta supabase/add_member_profile_fields.sql.')
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

  const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500'

  function renderAvatar(member: MemberRow, sizeClass: string, textClass = 'text-3xl') {
    return (
      <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e9f8f1] font-bold text-[#08784f] ring-4 ring-white dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-slate-800 ${sizeClass} ${textClass}`}>
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="h-full w-full object-cover" src={member.avatar_url} alt={`Foto de ${member.full_name}`} />
        ) : (
          <span className={`max-w-[78%] px-1 text-center font-serif font-semibold italic leading-tight tracking-wide ${fallbackNameClass(member.full_name)}`}>
            {memberAvatarFallback(member.full_name)}
          </span>
        )}
      </div>
    )
  }

  function renderAvatarPicker(member: MemberRow, inputId: string) {
    return (
      <>
        <input
          id={inputId}
          className="hidden"
          type="file"
          accept="image/*"
          onClick={(event) => {
            event.stopPropagation()
            event.currentTarget.value = ''
          }}
          onChange={(event) => {
            event.stopPropagation()
            handleAvatarFile(member, event.target.files?.[0] ?? null)
          }}
        />
        <label
          htmlFor={inputId}
          className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/80 bg-white text-slate-700 shadow-lg transition hover:scale-105 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
          onClick={(event) => event.stopPropagation()}
          title="Cambiar foto JPG"
        >
          <Pencil className="h-4 w-4" />
        </label>
      </>
    )
  }

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((member) => (
            <article
              key={member.id}
              className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              onClick={() => setSelectedMemberId(member.id)}
            >
              <div className="flex w-full justify-center">
                <div className="relative">
                  {renderAvatar(member, 'h-36 w-36', 'text-4xl')}
                  {renderAvatarPicker(member, `avatar-card-${member.id}`)}
                </div>
              </div>
              <p className="mt-4 line-clamp-1 text-base font-bold text-slate-950 dark:text-white">{member.full_name || 'Sin nombre'}</p>
              <p className="mt-1 text-sm font-semibold text-[#0d8f62] dark:text-emerald-300">{member.role ?? 'Sin rol'}</p>
            </article>
          ))}
        </div>
      )}

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" onClick={() => setSelectedMemberId(null)}>
          <section className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="absolute right-4 top-4 flex gap-2">
              <button className="flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60" onClick={() => deleteMember(selectedMember)} title="Eliminar perfil" disabled={savingId === selectedMember.id}>
                <Trash2 className="h-4 w-4" />
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setEditingMemberId(selectedMember.id)} title="Editar perfil">
                <Pencil className="h-4 w-4" />
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setSelectedMemberId(null)} title="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex w-full justify-center">
              <div className="relative">
                {renderAvatar(selectedMember, 'h-48 w-48', 'text-5xl')}
                {renderAvatarPicker(selectedMember, `avatar-profile-${selectedMember.id}`)}
              </div>
            </div>
            <h2 className="mt-5 text-2xl font-bold text-slate-950 dark:text-white">{selectedMember.full_name || 'Sin nombre'}</h2>
            <p className="mt-1 text-sm font-semibold text-[#0d8f62] dark:text-emerald-300">{selectedMember.role ?? 'Sin rol'}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{selectedMember.specialty || 'Sin skill cargado'}</p>

            <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
              <ProfileInfo icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={selectedMember.email} />
              <ProfileInfo icon={<CalendarDays className="h-3.5 w-3.5" />} label="Cumpleaños" value={formatBirthday(selectedMember.birthday)} />
              <ProfileInfo icon={<Utensils className="h-3.5 w-3.5" />} label="Comida favorita" value={selectedMember.favorite_food} />
              <ProfileInfo icon={<Heart className="h-3.5 w-3.5" />} label="Hobby" value={selectedMember.hobby} />
              <ProfileInfo icon={<Gamepad2 className="h-3.5 w-3.5" />} label="Juego favorito" value={selectedMember.favorite_game} />
            </div>
          </section>
        </div>
      )}

      {editingMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm" onClick={() => setEditingMemberId(null)}>
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Editar perfil</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Actualiza los datos visibles de la persona.</p>
              </div>
              <button type="button" className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setEditingMemberId(null)} title="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex justify-center">
              <div className="relative">
                {renderAvatar(editingMember, 'h-32 w-32', 'text-4xl')}
                {renderAvatarPicker(editingMember, `avatar-edit-${editingMember.id}`)}
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Nombre
                  <input className={inputClass} value={editingMember.full_name} onChange={(event) => updateLocalMember(editingMember.id, 'full_name', event.target.value)} placeholder="Nombre y apellido" />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Rol
                  <select className={inputClass} value={editingMember.role ?? 'Dev'} onChange={(event) => updateLocalMember(editingMember.id, 'role', event.target.value)}>
                    <option>Admin</option>
                    <option>PM</option>
                    <option>Dev</option>
                    <option>QA</option>
                    <option>Viewer</option>
                  </select>
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Foto
                <input className={inputClass} value={editingMember.avatar_url ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'avatar_url', event.target.value)} placeholder="https://..." />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Email
                  <input className={inputClass} type="email" value={editingMember.email ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'email', event.target.value)} placeholder="persona@dominio.com" />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Skill
                  <input className={inputClass} value={editingMember.specialty ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'specialty', event.target.value)} placeholder="Frontend, Backend, QA..." />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Cumpleaños
                <input className={inputClass} type="date" value={editingMember.birthday ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'birthday', event.target.value)} />
              </label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Comida favorita
                  <input className={inputClass} value={editingMember.favorite_food ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'favorite_food', event.target.value)} placeholder="Milanesa" />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Hobby
                  <input className={inputClass} value={editingMember.hobby ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'hobby', event.target.value)} placeholder="Musica" />
                </label>
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Juego favorito
                  <input className={inputClass} value={editingMember.favorite_game ?? ''} onChange={(event) => updateLocalMember(editingMember.id, 'favorite_game', event.target.value)} placeholder="Valorant" />
                </label>
              </div>
            </div>

            <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#10b981] text-sm font-semibold text-white disabled:opacity-60" onClick={() => saveMember(editingMember)} disabled={savingId === editingMember.id}>
              <Save className="h-4 w-4" />
              {savingId === editingMember.id ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </section>
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
