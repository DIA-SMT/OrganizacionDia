'use client'

import { useAuth } from '@/context/AuthContext'
import type { DashboardTask } from '@/lib/dashboard-data'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { GitPullRequest, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type SelectOption = {
  id: string
  label: string
}

type ProjectOptionRow = {
  id: string
  name: string
}

type MemberOptionRow = {
  id: string
  full_name: string
}

export function TaskCreateButton({
  onCreated,
  onDemoCreated,
  demoProjects = [],
  isDark = false,
}: {
  onCreated?: () => void
  onDemoCreated?: (task: DashboardTask & { status: string }) => void
  demoProjects?: SelectOption[]
  isDark?: boolean
}) {
  const { authConfigured, role } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<SelectOption[]>([])
  const [members, setMembers] = useState<SelectOption[]>([])
  const [form, setForm] = useState({
    project_id: '',
    title: '',
    description: '',
    type: 'Feature',
    status: 'Pendiente',
    priority: 'Media',
    member_id: '',
    owner_name: '',
    branch_name: '',
    pr_url: '',
  })

  const canCreate = !authConfigured || role === 'Admin' || role === 'PM'
  const projectOptions = authConfigured ? projects : demoProjects
  const inputClass = `h-10 rounded-md border px-3 text-sm outline-none ${
    isDark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-950'
  }`
  const textAreaClass = `min-h-24 rounded-md border px-3 py-2 text-sm outline-none ${
    isDark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-950'
  }`

  useEffect(() => {
    if (!open || !canCreate || !authConfigured) return

    async function fetchOptions() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const [{ data: projectRows }, { data: memberRows }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('active', true).order('name'),
        supabase.from('members').select('id, full_name').eq('active', true).order('full_name'),
      ])

      setProjects(((projectRows ?? []) as ProjectOptionRow[]).map((project) => ({ id: project.id, label: project.name })))
      setMembers(((memberRows ?? []) as MemberOptionRow[]).map((member) => ({ id: member.id, label: member.full_name })))
    }

    fetchOptions().catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar opciones'))
  }, [authConfigured, canCreate, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      const project = projectOptions.find((item) => item.id === form.project_id)
      onDemoCreated?.({
        title: form.title,
        project: project?.label ?? 'Sin proyecto',
        owner: form.owner_name || 'Sin responsable',
        status: form.status,
      })
      setOpen(false)
      setForm({
        project_id: '',
        title: '',
        description: '',
        type: 'Feature',
        status: 'Pendiente',
        priority: 'Media',
        member_id: '',
        owner_name: '',
        branch_name: '',
        pr_url: '',
      })
      return
    }

    setLoading(true)
    try {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          project_id: form.project_id,
          title: form.title,
          description: form.description || null,
          type: form.type,
          status: form.status,
          priority: form.priority,
          branch_name: form.branch_name || null,
          pr_url: form.pr_url || null,
        })
        .select('id')
        .single()

      if (taskError) throw taskError

      if (form.member_id && task?.id) {
        const { error: assigneeError } = await supabase.from('task_assignees').insert({
          task_id: task.id,
          member_id: form.member_id,
        })
        if (assigneeError) throw assigneeError
      }

      setOpen(false)
      setForm({
        project_id: '',
        title: '',
        description: '',
        type: 'Feature',
        status: 'Pendiente',
        priority: 'Media',
        member_id: '',
        owner_name: '',
        branch_name: '',
        pr_url: '',
      })
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
          isDark ? 'border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
        disabled={!canCreate}
        onClick={() => setOpen(true)}
        title={canCreate ? 'Nueva tarea' : 'Disponible para Admin o PM'}
      >
        <GitPullRequest className="h-4 w-4" />
        Nueva tarea
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
                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Crear tarea</h2>
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Feature, bug, refactor, deploy o tarea de QA.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className={`rounded-md p-2 text-slate-400 ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="mt-5 grid gap-4">
              <select className={inputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} required>
                <option value="">Seleccionar proyecto</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.label}
                  </option>
                ))}
              </select>
              <input className={inputClass} placeholder="Titulo de la tarea" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <textarea className={textAreaClass} placeholder="Descripcion tecnica" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid gap-4 md:grid-cols-3">
                <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option>Feature</option>
                  <option>Bug</option>
                  <option>Mejora</option>
                  <option>Refactor</option>
                  <option>Deploy</option>
                  <option>Documentacion</option>
                  <option>Soporte</option>
                </select>
                <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>Backlog</option>
                  <option>Pendiente</option>
                  <option>En desarrollo</option>
                  <option>En revision</option>
                  <option>QA</option>
                  <option>Bloqueada</option>
                  <option>Terminada</option>
                </select>
                <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option>Baja</option>
                  <option>Media</option>
                  <option>Alta</option>
                  <option>Critica</option>
                </select>
              </div>
              {authConfigured ? (
                <select className={inputClass} value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })}>
                  <option value="">Sin responsable</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={inputClass} placeholder="Responsable" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <input className={inputClass} placeholder="Branch" value={form.branch_name} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} />
                <input className={inputClass} placeholder="PR URL" value={form.pr_url} onChange={(e) => setForm({ ...form, pr_url: e.target.value })} />
              </div>
            </div>

            <button className="mt-5 h-10 w-full rounded-md bg-[#10b981] text-sm font-semibold text-white disabled:opacity-60" disabled={loading}>
              {loading ? 'Guardando...' : 'Crear tarea'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
