'use client'

import { useAuth } from '@/context/AuthContext'
import { MemberMultiSelect, type MemberChoice } from '@/components/member-multi-select'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { FolderPlus, GitPullRequest, Link2, X } from 'lucide-react'
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
  avatar_url: string | null
}

export function TaskCreateButton({
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
  const [projects, setProjects] = useState<SelectOption[]>([])
  const [members, setMembers] = useState<MemberChoice[]>([])
  const [projectMode, setProjectMode] = useState<'existing' | 'new'>('existing')
  const [form, setForm] = useState({
    project_id: '',
    title: '',
    description: '',
    type: 'Feature',
    status: 'Pendiente',
    priority: 'Media',
    member_ids: [] as string[],
    branch_name: '',
    pr_url: '',
  })
  const [newProjectForm, setNewProjectForm] = useState({
    name: '',
    description: '',
    requester_area: '',
    stack: '',
    priority: 'Media',
    estimated_delivery: '',
  })

  const projectOptions = projects
  const inputClass = `h-10 rounded-md border px-3 text-sm outline-none ${
    isDark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-950'
  }`
  const textAreaClass = `min-h-24 rounded-md border px-3 py-2 text-sm outline-none ${
    isDark ? 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-white text-slate-950'
  }`

  async function refreshProjects() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { data: projectRows } = await supabase.from('projects').select('id, name').eq('active', true).order('name')
    setProjects(((projectRows ?? []) as ProjectOptionRow[]).map((project) => ({ id: project.id, label: project.name })))
  }

  useEffect(() => {
    if (!open || !authConfigured) return

    async function fetchOptions() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const [{ data: projectRows }, { data: memberRows }] = await Promise.all([
        supabase.from('projects').select('id, name').eq('active', true).order('name'),
        supabase.from('members').select('id, full_name, avatar_url').eq('active', true).order('full_name'),
      ])

      setProjects(((projectRows ?? []) as ProjectOptionRow[]).map((project) => ({ id: project.id, label: project.name })))
      setMembers(((memberRows ?? []) as MemberOptionRow[]).map((member) => ({ id: member.id, label: member.full_name, avatarUrl: member.avatar_url })))
    }

    fetchOptions().catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar opciones'))
  }, [authConfigured, open])

  async function createLinkedProject() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) throw new Error('Supabase no esta configurado.')

    const insertPayload = {
      name: newProjectForm.name.trim(),
      description: newProjectForm.description || null,
      requester_area: newProjectForm.requester_area || null,
      stack: newProjectForm.stack || null,
      priority: newProjectForm.priority,
      estimated_delivery: newProjectForm.estimated_delivery || null,
      status: 'Planificación',
      progress: 0,
    }

    const { data, error: projectError } = await supabase.from('projects').insert(insertPayload).select('id, name').single()

    if (projectError) throw projectError
    if (!data?.id) throw new Error('No se pudo obtener el proyecto creado.')

    await refreshProjects()
    return data.id as string
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado. Completa .env.local para guardar tareas reales.')
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

      let projectId = form.project_id

      if (projectMode === 'new') {
        if (!newProjectForm.name.trim()) {
          throw new Error('Completa el nombre del proyecto nuevo.')
        }
        projectId = await createLinkedProject()
      }

      if (!projectId) {
        throw new Error('Selecciona un proyecto existente o crea uno nuevo.')
      }

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          project_id: projectId,
          title: form.title,
          description: form.description || null,
          type: form.type,
          status: form.status,
          priority: form.priority,
          branch_name: form.branch_name || null,
          pr_url: form.pr_url || null,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (taskError) throw taskError

      if (form.member_ids.length > 0 && task?.id) {
        const { error: assigneeError } = await supabase.from('task_assignees').insert(
          form.member_ids.map((memberId) => ({ task_id: task.id, member_id: memberId })),
        )
        if (assigneeError) {
          await supabase.from('tasks').delete().eq('id', task.id)
          throw assigneeError
        }
      }

      setOpen(false)
      setForm({
        project_id: '',
        title: '',
        description: '',
        type: 'Feature',
        status: 'Pendiente',
        priority: 'Media',
        member_ids: [],
        branch_name: '',
        pr_url: '',
      })
      setNewProjectForm({
        name: '',
        description: '',
        requester_area: '',
        stack: '',
        priority: 'Media',
        estimated_delivery: '',
      })
      setProjectMode('existing')
      onCreated?.()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message?: unknown }).message)
            : 'No se pudo crear la tarea'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold shadow-sm ${
          isDark ? 'border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
        onClick={() => setOpen(true)}
        title="Nueva tarea"
      >
        <GitPullRequest className="h-4 w-4" />
        Nueva tarea
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4">
          <form
            onSubmit={handleSubmit}
            className={`max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border p-5 shadow-xl ${
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
            {!authConfigured && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Para crear tareas reales falta configurar Supabase en <a className="font-semibold underline" href="/supabase">/supabase</a>.
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <div className={`grid grid-cols-2 rounded-md border p-1 ${isDark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                <button
                  type="button"
                  className={`flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    projectMode === 'existing'
                      ? isDark ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-950 shadow-sm'
                      : isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  onClick={() => setProjectMode('existing')}
                >
                  <Link2 className="h-4 w-4" />
                  Proyecto existente
                </button>
                <button
                  type="button"
                  className={`flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition ${
                    projectMode === 'new'
                      ? isDark ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-950 shadow-sm'
                      : isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-900'
                  }`}
                  onClick={() => setProjectMode('new')}
                >
                  <FolderPlus className="h-4 w-4" />
                  Proyecto nuevo
                </button>
              </div>

              {projectMode === 'existing' ? (
                <select className={inputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} required>
                  <option value="">Seleccionar proyecto</option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={`grid gap-4 rounded-md border p-4 ${isDark ? 'border-slate-700 bg-slate-950/70' : 'border-slate-200 bg-slate-50'}`}>
                  <input className={inputClass} placeholder="Nombre del proyecto nuevo" value={newProjectForm.name} onChange={(e) => setNewProjectForm({ ...newProjectForm, name: e.target.value })} required={projectMode === 'new'} />
                  <textarea className={textAreaClass} placeholder="Descripcion / alcance del proyecto" value={newProjectForm.description} onChange={(e) => setNewProjectForm({ ...newProjectForm, description: e.target.value })} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <input className={inputClass} placeholder="Area solicitante" value={newProjectForm.requester_area} onChange={(e) => setNewProjectForm({ ...newProjectForm, requester_area: e.target.value })} />
                    <input className={inputClass} placeholder="Stack tecnico" value={newProjectForm.stack} onChange={(e) => setNewProjectForm({ ...newProjectForm, stack: e.target.value })} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <select className={inputClass} value={newProjectForm.priority} onChange={(e) => setNewProjectForm({ ...newProjectForm, priority: e.target.value })}>
                      <option>Baja</option>
                      <option>Media</option>
                      <option>Alta</option>
                      <option>Critica</option>
                    </select>
                    <input className={inputClass} type="date" value={newProjectForm.estimated_delivery} onChange={(e) => setNewProjectForm({ ...newProjectForm, estimated_delivery: e.target.value })} />
                  </div>
                </div>
              )}
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
              <MemberMultiSelect members={members} selectedIds={form.member_ids} onChange={(memberIds) => setForm({ ...form, member_ids: memberIds })} />
              {authConfigured && projectOptions.length === 0 && (
                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No hay proyectos cargados. Podes crear uno nuevo desde este formulario.</p>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <input className={inputClass} placeholder="Branch" value={form.branch_name} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} />
                <input className={inputClass} placeholder="PR URL" value={form.pr_url} onChange={(e) => setForm({ ...form, pr_url: e.target.value })} />
              </div>
            </div>

            <button className="mt-5 h-10 w-full rounded-md dia-primary-bg text-sm font-semibold text-white disabled:opacity-60" disabled={loading || !authConfigured || (projectMode === 'existing' && projectOptions.length === 0)}>
              {loading ? 'Guardando...' : 'Crear tarea'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
