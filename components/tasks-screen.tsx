'use client'

import { AppShell } from '@/components/app-shell'
import { MemberMultiSelect, TaskAssigneeList, type MemberChoice } from '@/components/member-multi-select'
import { TaskCreateButton } from '@/components/task-create-button'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getAssigneeChanges } from '@/lib/task-assignees'
import { CheckCircle2, ExternalLink, History, Pencil, Save, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type TaskProject = { name: string } | { name: string }[] | null
type TaskMember = { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] | null

type TaskAssignee = {
  member_id: string
  members: TaskMember
}

type TaskRow = {
  id: string
  project_id: string
  title: string
  description: string | null
  type: string
  status: string
  priority: string
  branch_name: string | null
  issue_url: string | null
  pr_url: string | null
  created_at: string
  projects: TaskProject
  task_assignees: TaskAssignee[]
}

type ProjectOption = {
  id: string
  name: string
}

type MemberOptionRow = {
  id: string
  full_name: string
  avatar_url: string | null
}

const taskTypes = ['Feature', 'Bug', 'Mejora', 'Refactor', 'Deploy', 'Documentacion', 'Soporte']
const taskStatuses = ['Backlog', 'Pendiente', 'En desarrollo', 'En revision', 'QA', 'Bloqueada', 'Terminada']
const taskPriorities = ['Baja', 'Media', 'Alta', 'Critica']

function getProjectName(projects: TaskProject) {
  if (Array.isArray(projects)) return projects[0]?.name ?? null
  return projects?.name ?? null
}

function getTaskMembers(task: TaskRow): MemberChoice[] {
  return task.task_assignees.flatMap((assignee) => {
    const member = Array.isArray(assignee.members) ? assignee.members[0] : assignee.members
    return member ? [{ id: member.id, label: member.full_name, avatarUrl: member.avatar_url }] : []
  })
}

function priorityClass(priority: string) {
  if (priority === 'Critica') return 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200'
  if (priority === 'Alta') return 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200'
  if (priority === 'Media') return 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))
}

export function TasksScreen() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [members, setMembers] = useState<MemberChoice[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [finishingId, setFinishingId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null)
  const [editingAssigneeIds, setEditingAssigneeIds] = useState<string[]>([])
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('id, project_id, title, description, type, status, priority, branch_name, issue_url, pr_url, created_at, projects(name), task_assignees(member_id, members(id, full_name, avatar_url))')
      .eq('active', true)
      .neq('status', 'Terminada')
      .order('updated_at', { ascending: false })

    setTasks((data ?? []) as unknown as TaskRow[])
    setLoading(false)
  }, [])

  const fetchProjects = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .eq('active', true)
      .order('name', { ascending: true })

    setProjects((data ?? []) as ProjectOption[])
  }, [])

  const fetchMembers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { data } = await supabase
      .from('members')
      .select('id, full_name, avatar_url')
      .eq('active', true)
      .order('full_name', { ascending: true })

    setMembers(((data ?? []) as MemberOptionRow[]).map((member) => ({ id: member.id, label: member.full_name, avatarUrl: member.avatar_url })))
  }, [])

  function openTaskEditor(task: TaskRow) {
    setEditingTask(task)
    setEditingAssigneeIds(task.task_assignees.map((assignee) => assignee.member_id))
  }

  async function finishTask(taskId: string) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setFinishingId(taskId)
    const { error } = await supabase.from('tasks').update({ status: 'Terminada' }).eq('id', taskId)
    if (!error) {
      setTasks((current) => current.filter((task) => task.id !== taskId))
    }
    setFinishingId(null)
  }

  async function saveTask(task: TaskRow) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setError(null)
    setSavingTaskId(task.id)

    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        project_id: task.project_id,
        title: task.title.trim() || 'Sin titulo',
        description: task.description?.trim() || null,
        type: task.type,
        status: task.status,
        priority: task.priority,
        branch_name: task.branch_name?.trim() || null,
        issue_url: task.issue_url?.trim() || null,
        pr_url: task.pr_url?.trim() || null,
      })
      .eq('id', task.id)

    if (updateError) {
      setError(updateError.message)
      setSavingTaskId(null)
      return
    }

    const currentAssigneeIds = task.task_assignees.map((assignee) => assignee.member_id)
    const changes = getAssigneeChanges(currentAssigneeIds, editingAssigneeIds)

    if (changes.removed.length > 0) {
      const { error: removeError } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', task.id)
        .in('member_id', changes.removed)

      if (removeError) {
        setError(removeError.message)
        setSavingTaskId(null)
        return
      }
    }

    if (changes.added.length > 0) {
      const { error: addError } = await supabase
        .from('task_assignees')
        .upsert(
          changes.added.map((memberId) => ({ task_id: task.id, member_id: memberId })),
          { onConflict: 'task_id,member_id' },
        )

      if (addError) {
        setError(addError.message)
        setSavingTaskId(null)
        return
      }
    }

    setEditingTask(null)
    setEditingAssigneeIds([])
    await fetchTasks()

    setSavingTaskId(null)
  }

  useEffect(() => {
    void Promise.resolve().then(fetchTasks)
  }, [fetchTasks])

  useEffect(() => {
    void Promise.resolve().then(fetchProjects)
  }, [fetchProjects])

  useEffect(() => {
    void Promise.resolve().then(fetchMembers)
  }, [fetchMembers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((task) => [task.title, task.description, task.type, task.status, task.priority, task.branch_name, getProjectName(task.projects)].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [search, tasks])

  return (
    <AppShell title="Tareas" subtitle="Trabajo tecnico asociado a los proyectos" search={search} onSearchChange={setSearch}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{filtered.length} tareas visibles</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Crea tareas vinculadas a proyectos existentes o nuevos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/commit-history"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <History className="h-4 w-4" />
            Historial
          </Link>
          <TaskCreateButton onCreated={fetchTasks} isDark />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando tareas...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay tareas cargadas.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="hidden grid-cols-[1.15fr_0.7fr_0.42fr_0.48fr_0.48fr_0.5fr_0.9fr] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-400 dark:border-slate-800 dark:text-slate-500 lg:grid">
            <span>Tarea</span>
            <span>Proyecto</span>
            <span>Tipo</span>
            <span>Estado</span>
            <span>Prioridad</span>
            <span>Creada</span>
            <span>Acciones</span>
          </div>
          {filtered.map((task) => (
            <div key={task.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 dark:border-slate-800 lg:grid-cols-[1.15fr_0.7fr_0.42fr_0.48fr_0.48fr_0.5fr_0.9fr]">
              <div>
                <p className="font-semibold text-slate-950 dark:text-white">{task.title}</p>
                {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{task.description}</p>}
                {task.branch_name && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Branch: {task.branch_name}</p>}
                <TaskAssigneeList members={getTaskMembers(task)} />
              </div>
              <span className="text-slate-600 dark:text-slate-300">{getProjectName(task.projects) ?? 'Sin proyecto'}</span>
              <span className="text-slate-600 dark:text-slate-300">{task.type}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{task.status}</span>
              <span>
                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(task.priority)}`}>{task.priority}</span>
              </span>
              <span className="text-slate-500 dark:text-slate-400">{formatDate(task.created_at)}</span>
              <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-start">
                <div className="flex flex-wrap gap-1.5">
                  {task.issue_url && (
                    <a className="inline-flex h-8 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold dia-primary-text hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200" href={task.issue_url} target="_blank" rel="noreferrer">
                      Issue <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {task.pr_url && (
                    <a className="inline-flex h-8 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold dia-primary-text hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200" href={task.pr_url} target="_blank" rel="noreferrer">
                      PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-500 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-500/30 dark:hover:text-blue-200"
                  onClick={() => openTaskEditor(task)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 px-3.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/25 disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
                  disabled={finishingId === task.id}
                  onClick={() => void finishTask(task.id)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {finishingId === task.id ? 'Cerrando...' : 'Finalizar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm" onClick={() => { setEditingTask(null); setEditingAssigneeIds([]) }}>
          <section
            data-lenis-prevent
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Editar tarea</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Actualiza estado, prioridad, proyecto y datos tecnicos.</p>
              </div>
              <button type="button" className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { setEditingTask(null); setEditingAssigneeIds([]) }} title="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Titulo
                <input
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={editingTask.title}
                  onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Descripcion
                <textarea
                  className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={editingTask.description ?? ''}
                  onChange={(event) => setEditingTask({ ...editingTask, description: event.target.value })}
                />
              </label>

              <MemberMultiSelect members={members} selectedIds={editingAssigneeIds} onChange={setEditingAssigneeIds} />

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Proyecto
                  <select
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.project_id}
                    onChange={(event) => setEditingTask({ ...editingTask, project_id: event.target.value })}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Prioridad
                  <select
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.priority}
                    onChange={(event) => setEditingTask({ ...editingTask, priority: event.target.value })}
                  >
                    {taskPriorities.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Tipo
                  <select
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.type}
                    onChange={(event) => setEditingTask({ ...editingTask, type: event.target.value })}
                  >
                    {taskTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Estado
                  <select
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.status}
                    onChange={(event) => setEditingTask({ ...editingTask, status: event.target.value })}
                  >
                    {taskStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Branch
                  <input
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.branch_name ?? ''}
                    onChange={(event) => setEditingTask({ ...editingTask, branch_name: event.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Issue URL
                  <input
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.issue_url ?? ''}
                    onChange={(event) => setEditingTask({ ...editingTask, issue_url: event.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  PR URL
                  <input
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={editingTask.pr_url ?? ''}
                    onChange={(event) => setEditingTask({ ...editingTask, pr_url: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md dia-primary-bg text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
              disabled={savingTaskId === editingTask.id}
              onClick={() => void saveTask(editingTask)}
            >
              <Save className="h-4 w-4" />
              {savingTaskId === editingTask.id ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </section>
        </div>
      )}
    </AppShell>
  )
}
