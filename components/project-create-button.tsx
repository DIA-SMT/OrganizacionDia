'use client'

import type { DashboardProject } from '@/lib/dashboard-data'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'

export function ProjectCreateButton({
  onCreated,
  onDemoCreated,
  isDark = false,
}: {
  onCreated?: () => void
  onDemoCreated?: (project: DashboardProject) => void
  isDark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    requester_area: '',
    stack: '',
    repository_url: '',
    status: 'En desarrollo',
    priority: 'Media',
    estimated_delivery: '',
  })

  const canCreate = true
  const inputClass = `h-10 rounded-md border px-3 text-sm outline-none ${
    isDark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-950'
  }`
  const textAreaClass = `min-h-24 rounded-md border px-3 py-2 text-sm outline-none ${
    isDark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-950'
  }`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      onDemoCreated?.({
        name: form.name,
        area: form.requester_area || 'Sin area',
        stack: form.stack || 'Sin stack',
        status: form.status,
        priority: form.priority,
        progress: 0,
        delivery: form.estimated_delivery || null,
        repositoryUrl: form.repository_url || null,
      })
      setOpen(false)
      setForm({ name: '', description: '', requester_area: '', stack: '', repository_url: '', status: 'En desarrollo', priority: 'Media', estimated_delivery: '' })
      return
    }

    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        throw new Error('No hay una sesion activa. Volve a iniciar sesion para guardar en Supabase.')
      }

      const { error: insertError } = await supabase.from('projects').insert({
        name: form.name,
        description: form.description || null,
        requester_area: form.requester_area || null,
        stack: form.stack || null,
        repository_url: form.repository_url || null,
        priority: form.priority,
        estimated_delivery: form.estimated_delivery || null,
        status: form.status,
      })

      if (insertError) throw insertError

      setOpen(false)
      setForm({ name: '', description: '', requester_area: '', stack: '', repository_url: '', status: 'En desarrollo', priority: 'Media', estimated_delivery: '' })
      onCreated?.()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'No se pudo crear el proyecto'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#10b981] px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canCreate}
        onClick={() => setOpen(true)}
        title="Nuevo proyecto"
      >
        <Plus className="h-4 w-4" />
        Nuevo proyecto
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <form
            onSubmit={handleSubmit}
            className={`w-full max-w-xl rounded-lg border p-5 shadow-xl ${
              isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Crear proyecto</h2>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Alta rapida para un sistema, modulo o integracion.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className={`rounded-md p-2 text-slate-400 ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="mt-5 grid gap-4">
              <input className={inputClass} placeholder="Nombre del proyecto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <textarea className={textAreaClass} placeholder="Descripcion / alcance tecnico" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid gap-4 md:grid-cols-2">
                <input className={inputClass} placeholder="Area solicitante" value={form.requester_area} onChange={(e) => setForm({ ...form, requester_area: e.target.value })} />
                <input className={inputClass} placeholder="Stack tecnico" value={form.stack} onChange={(e) => setForm({ ...form, stack: e.target.value })} />
              </div>
              <input className={inputClass} placeholder="Link de GitHub / repositorio" value={form.repository_url} onChange={(e) => setForm({ ...form, repository_url: e.target.value })} />
              <div className="grid gap-4 md:grid-cols-2">
                <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="Backlog">Backlog</option>
                  <option value="Planificacion">Planificacion</option>
                  <option value="En desarrollo">Proyecto activo</option>
                  <option value="En aprobacion">En aprobacion</option>
                  <option value="QA">Para testear</option>
                  <option value="Deployado">Deployado</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Pausado">Pausado</option>
                </select>
                <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option>Baja</option>
                  <option>Media</option>
                  <option>Alta</option>
                  <option>Critica</option>
                </select>
              </div>
              <input className={inputClass} type="date" value={form.estimated_delivery} onChange={(e) => setForm({ ...form, estimated_delivery: e.target.value })} />
            </div>

            <button className="mt-5 h-10 w-full rounded-md bg-[#10b981] text-sm font-semibold text-white disabled:opacity-60" disabled={loading}>
              {loading ? 'Guardando...' : 'Crear proyecto'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
