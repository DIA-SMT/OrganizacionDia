'use client'

import { AppShell } from '@/components/app-shell'
import {
  countActiveProjects,
  isAccountFull,
  latestAccount,
  nextAliasNumber,
  sortAccounts,
  suggestNextEmail,
  unassignedProjects,
  type AccountProject,
  type SupabaseAccount,
} from '@/lib/supabase-accounts'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Database, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type AccountForm = {
  alias_number: string
  email: string
  label: string
  notes: string
  project_limit: string
}

const emptyForm: AccountForm = { alias_number: '', email: '', label: '', notes: '', project_limit: '2' }

export function SupabaseAccountsScreen() {
  const [accounts, setAccounts] = useState<SupabaseAccount[]>([])
  const [projects, setProjects] = useState<AccountProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setError('Supabase no esta configurado.')
        setLoading(false)
        return
      }

      setError(null)
      setLoading(true)

      const [accountsRes, projectsRes] = await Promise.all([
        supabase.from('supabase_accounts').select('*').order('alias_number', { ascending: true }),
        supabase.from('projects').select('id, name, status, active, supabase_account_id').eq('active', true).order('name', { ascending: true }),
      ])

      if (accountsRes.error) {
        setError(accountsRes.error.message)
        setAccounts([])
      } else {
        setAccounts((accountsRes.data ?? []) as SupabaseAccount[])
      }

      setProjects((projectsRes.data ?? []) as AccountProject[])
      setLoading(false)
    }

    void load()
  }, [version])

  const sortedAccounts = useMemo(() => sortAccounts(accounts), [accounts])
  const latest = useMemo(() => latestAccount(accounts), [accounts])
  const nextAlias = useMemo(() => nextAliasNumber(accounts), [accounts])
  const unassigned = useMemo(() => unassignedProjects(projects), [projects])
  const projectsByAccount = useMemo(() => {
    const map = new Map<string, AccountProject[]>()
    for (const project of projects) {
      if (!project.supabase_account_id) continue
      const list = map.get(project.supabase_account_id) ?? []
      list.push(project)
      map.set(project.supabase_account_id, list)
    }
    return map
  }, [projects])

  function reload() {
    setVersion((current) => current + 1)
  }

  function openNewAccount() {
    setEditingId(null)
    setForm({
      alias_number: String(nextAlias),
      email: suggestNextEmail(accounts),
      label: '',
      notes: '',
      project_limit: '2',
    })
    setModalOpen(true)
  }

  function openEditAccount(account: SupabaseAccount) {
    setEditingId(account.id)
    setForm({
      alias_number: String(account.alias_number),
      email: account.email ?? '',
      label: account.label ?? '',
      notes: account.notes ?? '',
      project_limit: String(account.project_limit),
    })
    setModalOpen(true)
  }

  async function saveAccount(event: React.FormEvent) {
    event.preventDefault()
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const aliasNumber = Number(form.alias_number)
    if (!Number.isInteger(aliasNumber) || aliasNumber < 1) {
      setError('El numero de alias debe ser un entero positivo.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      alias_number: aliasNumber,
      email: form.email.trim() || null,
      label: form.label.trim() || null,
      notes: form.notes.trim() || null,
      project_limit: Number(form.project_limit) || 0,
    }

    const { error: saveError } = editingId
      ? await supabase.from('supabase_accounts').update(payload).eq('id', editingId)
      : await supabase.from('supabase_accounts').insert(payload)

    setSaving(false)

    if (saveError) {
      setError(saveError.message.includes('duplicate') ? `Ya existe una cuenta con el alias +${aliasNumber}.` : saveError.message)
      return
    }

    setModalOpen(false)
    reload()
  }

  async function deleteAccount(account: SupabaseAccount) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    if (!window.confirm(`Eliminar la cuenta +${account.alias_number}? Los proyectos vinculados quedaran sin cuenta.`)) return

    const { error: deleteError } = await supabase.from('supabase_accounts').delete().eq('id', account.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    reload()
  }

  async function assignProject(projectId: string, accountId: string | null) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setBusyProjectId(projectId)
    const { error: assignError } = await supabase.from('projects').update({ supabase_account_id: accountId }).eq('id', projectId)
    setBusyProjectId(null)

    if (assignError) {
      setError(assignError.message)
      return
    }
    reload()
  }

  const inputClass =
    'h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'
  const selectClass =
    'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'

  return (
    <AppShell title="Cuentas Supabase" subtitle="Inventario de cuentas free tier (alias +N) y sus proyectos">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 dia-surface-bg p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 dia-primary-text" />
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {loading ? 'Cargando inventario...' : `${accounts.length} cuentas registradas`}
            </p>
            <p className="font-semibold text-slate-950 dark:text-white">
              {latest ? `Ultimo alias: +${latest.alias_number}` : 'Sin cuentas todavia'} ·{' '}
              <span className="dia-primary-text">Proximo libre: +{nextAlias}</span>
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md dia-primary-bg px-4 text-sm font-semibold text-white shadow-sm"
          onClick={openNewAccount}
        >
          <Plus className="h-4 w-4" />
          Nueva cuenta
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {sortedAccounts.map((account) => {
          const accountProjects = projectsByAccount.get(account.id) ?? []
          const activeCount = countActiveProjects(account.id, projects)
          const full = isAccountFull(account, projects)

          return (
            <article
              key={account.id}
              className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white dark:bg-slate-700">+{account.alias_number}</span>
                    {account.label && <span className="font-semibold text-slate-950 dark:text-white">{account.label}</span>}
                    {!account.active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">inactiva</span>}
                  </div>
                  {account.email && <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{account.email}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                      full
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                    }`}
                    title={full ? 'Cuenta al limite del free tier' : 'Con lugar disponible'}
                  >
                    {full && <TriangleAlert className="h-3 w-3" />}
                    {activeCount}/{account.project_limit}
                  </span>
                  <button
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => openEditAccount(account)}
                    title="Editar cuenta"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    onClick={() => void deleteAccount(account)}
                    title="Eliminar cuenta"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {account.notes && <p className="text-sm text-slate-500 dark:text-slate-400">{account.notes}</p>}

              <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800">
                {accountProjects.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Sin proyectos vinculados.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {accountProjects.map((project) => (
                      <li key={project.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                          {project.name} <span className="text-xs text-slate-400">· {project.status}</span>
                        </span>
                        <select
                          className={selectClass}
                          value={account.id}
                          disabled={busyProjectId === project.id}
                          onChange={(event) => void assignProject(project.id, event.target.value || null)}
                          title="Mover a otra cuenta"
                        >
                          {sortedAccounts.map((option) => (
                            <option key={option.id} value={option.id}>
                              +{option.alias_number}
                              {option.label ? ` (${option.label})` : ''}
                            </option>
                          ))}
                          <option value="">Sin cuenta</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          )
        })}
        {!loading && sortedAccounts.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Todavia no hay cuentas cargadas. Usa &quot;Nueva cuenta&quot; para registrar el primer alias.
          </p>
        )}
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 dia-surface-bg shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="font-semibold text-slate-950 dark:text-white">Proyectos sin cuenta ({unassigned.length})</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Proyectos activos que todavia no estan asignados a una cuenta Supabase.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {unassigned.map((project) => (
            <div key={project.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                {project.name} <span className="text-xs text-slate-400">· {project.status}</span>
              </span>
              <select
                className={selectClass}
                defaultValue=""
                disabled={busyProjectId === project.id || accounts.length === 0}
                onChange={(event) => event.target.value && void assignProject(project.id, event.target.value)}
              >
                <option value="" disabled>
                  Asignar a...
                </option>
                {sortedAccounts.map((option) => (
                  <option key={option.id} value={option.id}>
                    +{option.alias_number}
                    {option.label ? ` (${option.label})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {unassigned.length === 0 && !loading && (
            <p className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">Todos los proyectos activos tienen cuenta asignada.</p>
          )}
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <form onSubmit={saveAccount} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">{editingId ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Numero de alias (+N)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="1"
                  value={form.alias_number}
                  onChange={(event) => setForm({ ...form, alias_number: event.target.value })}
                  required
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Correo completo</span>
                <input className={inputClass} placeholder="base+15@dominio.gob.ar" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Etiqueta (opcional)</span>
                <input className={inputClass} placeholder="Ej: Ambiente y Turismo" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Limite de proyectos (free tier)</span>
                <input className={inputClass} type="number" min="0" value={form.project_limit} onChange={(event) => setForm({ ...form, project_limit: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-slate-600 dark:text-slate-300">Notas (opcional)</span>
                <textarea
                  className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
            </div>

            <button className="mt-5 h-10 w-full rounded-md dia-primary-bg text-sm font-semibold text-white disabled:opacity-60" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      )}
    </AppShell>
  )
}
