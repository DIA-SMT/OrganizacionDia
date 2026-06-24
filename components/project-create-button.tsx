'use client'

import { useAuth } from '@/context/AuthContext'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'

export function ProjectCreateButton({
  onCreated,
  isDark = false,
}: {
  onCreated?: () => void
  isDark?: boolean
}) {
  const { authConfigured } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    requester_area: '',
    stack: '',
    repository_url: '',
    repository_url_secondary: '',
    website_url: '',
    status: 'Planificación',
    priority: 'Media',
    progress: '0',
    estimated_delivery: '',
  })

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
      setError('Supabase no esta configurado. Completa .env.local para guardar proyectos reales.')
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

      const insertPayload = {
        name: form.name,
        description: form.description || null,
        requester_area: form.requester_area || null,
        stack: form.stack || null,
        repository_url: form.repository_url || null,
        repository_url_secondary: form.repository_url_secondary || null,
        website_url: form.website_url
          ? /^https?:\/\//i.test(form.website_url.trim())
            ? form.website_url.trim()
            : `https://${form.website_url.trim()}`
          : null,
        priority: form.priority,
        progress: Number(form.progress),
        estimated_delivery: form.estimated_delivery || null,
        status: form.status,
      }

      const fallbackPayload = {
        name: insertPayload.name,
        description: insertPayload.description,
        requester_area: insertPayload.requester_area,
        stack: insertPayload.stack,
        repository_url: insertPayload.repository_url,
        priority: insertPayload.priority,
        progress: insertPayload.progress,
        estimated_delivery: insertPayload.estimated_delivery,
        status: insertPayload.status,
      }
      const { error: insertError } = await supabase.from('projects').insert(insertPayload)

      if (insertError) {
        const { error: fallbackError } = await supabase.from('projects').insert(fallbackPayload)
        if (fallbackError) throw insertError
        setError('Proyecto creado con campos basicos. Ejecuta las migraciones pendientes de Supabase para guardar todos los enlaces.')
      }

      setOpen(false)
      setForm({ name: '', description: '', requester_area: '', stack: '', repository_url: '', repository_url_secondary: '', website_url: '', status: 'Planificación', priority: 'Media', progress: '0', estimated_delivery: '' })
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
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#1677f2] px-4 text-sm font-semibold text-white shadow-sm"
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
            {!authConfigured && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Para crear proyectos reales falta configurar Supabase en <a className="font-semibold underline" href="/supabase">/supabase</a>.
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <input className={inputClass} placeholder="Nombre del proyecto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <textarea className={textAreaClass} placeholder="Descripcion / alcance tecnico" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid gap-4 md:grid-cols-2">
                <input className={inputClass} placeholder="Area solicitante" value={form.requester_area} onChange={(e) => setForm({ ...form, requester_area: e.target.value })} />
                <input className={inputClass} placeholder="Stack tecnico" value={form.stack} onChange={(e) => setForm({ ...form, stack: e.target.value })} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <input className={inputClass} placeholder="Repo 1 / Frontend" value={form.repository_url} onChange={(e) => setForm({ ...form, repository_url: e.target.value })} />
                <input className={inputClass} placeholder="Repo 2 / Backend" value={form.repository_url_secondary} onChange={(e) => setForm({ ...form, repository_url_secondary: e.target.value })} />
              </div>
              <input className={inputClass} placeholder="Pagina web / Vercel (https://...)" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
              <label className={`rounded-md border p-3 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-4">
                  <span className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Progreso</span>
                  <span className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{form.progress}%</span>
                </div>
                <input
                  className="mt-3 w-full accent-[#1677f2]"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={form.progress}
                  onChange={(e) => setForm({ ...form, progress: e.target.value })}
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="Planificación">Planificación</option>
                  <option value="En desarrollo">En desarrollo</option>
                  <option value="MVP aprobado">MVP aprobado</option>
                  <option value="QA">QA</option>
                  <option value="En Producción">En Producción</option>
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

            <button className="mt-5 h-10 w-full rounded-md bg-[#1677f2] text-sm font-semibold text-white disabled:opacity-60" disabled={loading || !authConfigured}>
              {loading ? 'Guardando...' : 'Crear proyecto'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
