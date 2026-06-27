'use client'

import { AppShell } from '@/components/app-shell'
import { ProjectCreateButton } from '@/components/project-create-button'
import { filterAndSortProjects, type ProjectFilter } from '@/lib/project-filters'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Check, ChevronDown, ExternalLink, FileText, Funnel, GitCommitHorizontal, Globe2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { motion, type Variants } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

type ProjectRow = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  stack: string | null
  repository_url: string | null
  repository_url_secondary: string | null
  website_url: string | null
  status: string
  priority: string
  progress: number
  estimated_delivery: string | null
  note: string | null
}

type ProjectDocument = {
  id: string
  project_id: string
  file_name: string
  file_url: string
  storage_path: string | null
  size_bytes: number | null
  created_at: string
}

type ProjectCommitActivity = {
  sha: string
  message: string
  author: string
  authorLogin?: string | null
  authorAvatarUrl?: string | null
  date: string | null
  url: string
  repo: string
  repoLabel: string
}

const projectStatuses = ['Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado']
type TeamMember = {
  id: string
  full_name: string
  email: string | null
  role: string | null
  avatar_url: string | null
  github_username?: string | null
}

type ProjectParticipant = {
  key: string
  name: string
  role: string | null
  avatarUrl: string | null
}

const priorities = ['Baja', 'Media', 'Alta', 'Critica']

const projectFilterGroups: Array<{
  label: string
  options: Array<{ label: string; filter: ProjectFilter }>
}> = [
  {
    label: 'Vista',
    options: [
      { label: 'Todos', filter: { kind: 'all' } },
      { label: 'Activos', filter: { kind: 'active' } },
      { label: 'Finalizados', filter: { kind: 'finished' } },
      { label: 'Pausados', filter: { kind: 'paused' } },
    ],
  },
  {
    label: 'Estado',
    options: projectStatuses.slice(0, 4).map((status) => ({ label: status, filter: { kind: 'status', value: status } })),
  },
  {
    label: 'Prioridad',
    options: [...priorities].reverse().map((priority) => ({ label: priority, filter: { kind: 'priority', value: priority } })),
  },
]

function filterKey(filter: ProjectFilter) {
  return filter.kind === 'status' || filter.kind === 'priority' ? `${filter.kind}:${filter.value}` : filter.kind
}

function initialProjectFilter(statusFilter: string | null): ProjectFilter {
  if (!statusFilter || statusFilter === 'Todos') return { kind: 'all' }
  if (statusFilter === 'Activos') return { kind: 'active' }
  if (statusFilter === 'Pausado') return { kind: 'paused' }
  if (statusFilter === 'En Producción') return { kind: 'finished' }
  return { kind: 'status', value: statusFilter }
}

function projectFilterLabel(filter: ProjectFilter) {
  for (const group of projectFilterGroups) {
    const option = group.options.find((item) => filterKey(item.filter) === filterKey(filter))
    if (option) return option.label
  }
  return 'Todos'
}

const fadeInUpVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut', delay },
  }),
}

const staggerContainerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
}

function statusTone(status: string, isDark: boolean) {
  if (status === 'Pausado') return isDark ? 'border-red-900/60 bg-red-950/40 text-red-300' : 'border-red-200 bg-red-50 text-red-700'
  if (status === 'QA') return isDark ? 'border-sky-900/60 bg-sky-950/40 text-sky-300' : 'border-sky-200 bg-sky-50 text-sky-700'
  if (status === 'MVP aprobado') return isDark ? 'border-violet-900/60 bg-violet-950/40 text-violet-300' : 'border-violet-200 bg-violet-50 text-violet-700'
  if (status === 'En Producción') return isDark ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'En desarrollo') return isDark ? 'border-yellow-800/70 bg-yellow-400/15 text-yellow-200' : 'border-yellow-300 bg-yellow-100 text-yellow-800'
  return isDark ? 'border-slate-700 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-700'
}

function projectPriorityCardClass(priority: string, isDark: boolean) {
  if (priority === 'Alta' || priority === 'Critica') {
    return isDark ? 'border-red-800/80 bg-red-950/45 shadow-red-950/20' : 'border-red-300 bg-red-100/80 shadow-red-100/70'
  }

  if (priority === 'Media') {
    return isDark ? 'border-sky-800/80 bg-sky-950/45 shadow-sky-950/20' : 'border-sky-300 bg-sky-100/80 shadow-sky-100/70'
  }

  return isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
}

function formatCommitDate(value: string | null) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@/, '')
    .replace(/[^a-z0-9]/g, '')
}

function participantInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = parts.length > 1 ? `${parts[0][0] ?? ''}${parts[1][0] ?? ''}` : name.slice(0, 2)
  return initials.toUpperCase() || '?'
}

function formatFileSize(value: number | null) {
  if (!value) return 'Sin peso'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function safeStorageFileName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
}

function ParticipantAvatar({ participant, size = 'sm', isDark }: { participant: ProjectParticipant; size?: 'sm' | 'md'; isDark: boolean }) {
  const sizeClass = size === 'md' ? 'h-11 w-11 text-sm' : 'h-8 w-8 text-[11px]'
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-bold shadow-sm ${
        isDark ? 'border-slate-900 bg-blue-500/15 text-blue-200' : 'border-white bg-[#eaf3ff] text-[#1554c7]'
      } ${sizeClass}`}
      title={participant.role ? `${participant.name} - ${participant.role}` : participant.name}
    >
      {participant.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full w-full object-cover" src={participant.avatarUrl} alt={participant.name} />
      ) : (
        participantInitials(participant.name)
      )}
    </div>
  )
}

function useStoredTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const savedTheme = window.localStorage.getItem('organizacion-dia-theme')
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light'
  })

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const next = (event as CustomEvent<'light' | 'dark'>).detail
      if (next === 'dark' || next === 'light') setTheme(next)
    }

    window.addEventListener('organizacion-dia-theme-change', handleThemeChange)
    return () => window.removeEventListener('organizacion-dia-theme-change', handleThemeChange)
  }, [])

  return theme
}

function StatusDropdown({
  value,
  isDark,
  onChange,
}: {
  value: string
  isDark: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusTone(value, isDark)}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute left-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border p-1.5 shadow-xl shadow-slate-900/10 ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
          {projectStatuses.map((status) => (
            <button
              key={status}
              type="button"
              className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm font-semibold transition hover:scale-[1.01] ${statusTone(status, isDark)} ${
                status === value ? 'ring-2 ring-[#1677f2]/30' : ''
              }`}
              onClick={() => {
                onChange(status)
                setOpen(false)
              }}
            >
              <span>{status}</span>
              {status === value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProjectsScreen({
  initialSearch = '',
  initialStatusFilter = null,
  initialSelectedProjectId = null,
}: {
  initialSearch?: string
  initialStatusFilter?: string | null
  initialSelectedProjectId?: string | null
}) {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [search, setSearch] = useState(initialSearch)
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(() => initialProjectFilter(initialStatusFilter))
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingProgressId, setSavingProgressId] = useState<string | null>(null)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingSecondaryRepoIds, setAddingSecondaryRepoIds] = useState<string[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialSelectedProjectId)
  const [selectedProjectEditing, setSelectedProjectEditing] = useState(false)
  const [commitsByProject, setCommitsByProject] = useState<Record<string, ProjectCommitActivity[]>>({})
  const [projectDocuments, setProjectDocuments] = useState<Record<string, ProjectDocument[]>>({})
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const theme = useStoredTheme()
  const isDark = theme === 'dark'

  const cardClass = isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'
  const panelClass = isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'
  const titleClass = isDark ? 'text-white' : 'text-slate-950'
  const bodyClass = isDark ? 'text-slate-300' : 'text-slate-600'
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500'
  const labelClass = isDark ? 'text-slate-500' : 'text-slate-400'
  const inputClass = isDark ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'

  useEffect(() => {
    async function fetchProjects() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }

      const { data, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, description, requester_area, stack, repository_url, repository_url_secondary, website_url, status, priority, progress, estimated_delivery, note')
        .eq('active', true)
        .order('created_at', { ascending: false })

      if (projectsError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('projects')
          .select('id, name, description, requester_area, stack, repository_url, status, priority, progress, estimated_delivery')
          .eq('active', true)
          .order('created_at', { ascending: false })

        if (fallbackError) {
          setError(fallbackError.message)
          setProjects([])
        } else {
          setError('Falta actualizar Supabase con columnas nuevas. Ejecuta las migraciones de nota, Repo 2 y website_url.')
          setProjects(((fallbackData ?? []) as Omit<ProjectRow, 'note' | 'repository_url_secondary' | 'website_url'>[]).map((project) => ({ ...project, note: null, repository_url_secondary: null, website_url: null })))
        }
      } else {
        setProjects((data ?? []) as ProjectRow[])
      }

      setLoading(false)
    }

    fetchProjects()
  }, [])

  useEffect(() => {
    async function fetchMembers() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error: membersError } = await supabase
        .from('members')
        .select('id, full_name, email, role, avatar_url, github_username')
        .eq('active', true)

      if (!membersError) {
        setMembers((data ?? []) as TeamMember[])
        return
      }

      const { data: fallbackData } = await supabase
        .from('members')
        .select('id, full_name, email, role, avatar_url')
        .eq('active', true)

      setMembers(((fallbackData ?? []) as Omit<TeamMember, 'github_username'>[]).map((member) => ({ ...member, github_username: null })))
    }

    void fetchMembers()
  }, [])

  const projectDocumentSourceSignature = useMemo(() => projects.map((project) => project.id).join('|'), [projects])

  useEffect(() => {
    async function fetchProjectDocuments() {
      const supabase = getSupabaseBrowserClient()
      const projectIds = projectDocumentSourceSignature ? projectDocumentSourceSignature.split('|') : []
      if (!supabase || projectIds.length === 0) {
        setProjectDocuments({})
        return
      }

      const { data, error: documentsError } = await supabase
        .from('project_documents')
        .select('id, project_id, file_name, file_url, storage_path, size_bytes, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })

      if (documentsError) {
        setProjectDocuments({})
        return
      }

      const grouped = ((data ?? []) as ProjectDocument[]).reduce<Record<string, ProjectDocument[]>>((acc, document) => {
        acc[document.project_id] = [...(acc[document.project_id] ?? []), document]
        return acc
      }, {})

      setProjectDocuments(grouped)
    }

    void fetchProjectDocuments()
  }, [projectDocumentSourceSignature])

  const projectCommitSources = useMemo(
    () =>
      projects
        .filter((project) => project.repository_url || project.repository_url_secondary)
        .map((project) => ({
          id: project.id,
          repositoryUrl: project.repository_url,
          repositoryUrlSecondary: project.repository_url_secondary,
        })),
    [projects],
  )

  const projectCommitSourceSignature = useMemo(
    () => projectCommitSources.map((project) => `${project.id}:${project.repositoryUrl ?? ''}:${project.repositoryUrlSecondary ?? ''}`).join('|'),
    [projectCommitSources],
  )

  useEffect(() => {
    if (projectCommitSources.length === 0) return

    let cancelled = false

    async function fetchProjectCommits() {
      try {
        const response = await fetch('/api/github/project-commits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            days: 7,
            limitPerRepo: 20,
            projects: projectCommitSources,
          }),
        })
        const payload = (await response.json()) as {
          commitsByProject?: Record<string, ProjectCommitActivity[]>
        }
        if (!cancelled) setCommitsByProject(payload.commitsByProject ?? {})
      } catch {
        if (!cancelled) setCommitsByProject({})
      }
    }

    fetchProjectCommits()

    return () => {
      cancelled = true
    }
  }, [projectCommitSourceSignature, projectCommitSources])

  const memberIdentityMap = useMemo(() => {
    const map = new Map<string, TeamMember>()

    for (const member of members) {
      const identities = [member.github_username, member.full_name, member.email?.split('@')[0]]
      for (const identity of identities) {
        const key = normalizeIdentity(identity)
        if (key && !map.has(key)) map.set(key, member)
      }
    }

    return map
  }, [members])

  const participantsByProject = useMemo(() => {
    const result: Record<string, ProjectParticipant[]> = {}

    for (const [projectId, commits] of Object.entries(commitsByProject)) {
      const participants = new Map<string, ProjectParticipant>()

      for (const commit of commits) {
        const member = memberIdentityMap.get(normalizeIdentity(commit.authorLogin)) ?? memberIdentityMap.get(normalizeIdentity(commit.author))
        const key = member?.id ?? normalizeIdentity(commit.authorLogin || commit.author)
        if (!key || participants.has(key)) continue

        participants.set(key, {
          key,
          name: member?.full_name || commit.author,
          role: member?.role ?? null,
          avatarUrl: member?.avatar_url || commit.authorAvatarUrl || null,
        })
      }

      result[projectId] = Array.from(participants.values()).slice(0, 6)
    }

    return result
  }, [commitsByProject, memberIdentityMap])

  async function updateProject<K extends keyof Pick<ProjectRow, 'name' | 'status' | 'priority' | 'estimated_delivery' | 'note' | 'repository_url' | 'repository_url_secondary' | 'website_url'>>(projectId: string, field: K, value: ProjectRow[K]) {
    setError(null)
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, [field]: value } : project)))

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    const key = `${projectId}-${String(field)}`
    setSavingField(key)
    const nullableFields: Array<keyof ProjectRow> = ['estimated_delivery', 'note', 'repository_url', 'repository_url_secondary', 'website_url']
    const persistedValue = nullableFields.includes(field) ? value || null : value
    const { error: updateError } = await supabase.from('projects').update({ [field]: persistedValue }).eq('id', projectId)
    setSavingField(null)

    if (updateError) setError(updateError.message)
  }

  async function updateProgress(projectId: string, progress: number) {
    setError(null)
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, progress } : project)))

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setSavingProgressId(projectId)
    const { error: updateError } = await supabase.from('projects').update({ progress }).eq('id', projectId)
    setSavingProgressId(null)

    if (updateError) setError(updateError.message)
  }

  async function deleteProject(project: ProjectRow) {
    const confirmed = window.confirm(`¿Eliminar "${project.name}"? Esta accion lo quitara del dashboard.`)
    if (!confirmed) return

    setError(null)
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setDeletingId(project.id)
    const { error: deleteError } = await supabase.from('projects').update({ active: false }).eq('id', project.id)
    setDeletingId(null)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setProjects((current) => current.filter((item) => item.id !== project.id))
    setSelectedProjectId((current) => (current === project.id ? null : current))
  }

  async function uploadProjectPdf(projectId: string, file: File | null) {
    if (!file) return

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Solo se pueden subir archivos PDF.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Supabase no esta configurado.')
      return
    }

    setError(null)
    setUploadingDocumentId(projectId)

    try {
      const storagePath = `${projectId}/${Date.now()}-${safeStorageFileName(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from('project-pdfs')
        .upload(storagePath, file, {
          contentType: 'application/pdf',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from('project-pdfs').getPublicUrl(storagePath)
      const fileUrl = publicUrlData.publicUrl

      const { data, error: insertError } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_url: fileUrl,
          storage_path: storagePath,
          mime_type: 'application/pdf',
          size_bytes: file.size,
        })
        .select('id, project_id, file_name, file_url, storage_path, size_bytes, created_at')
        .single()

      if (insertError) throw insertError

      setProjectDocuments((current) => ({
        ...current,
        [projectId]: [data as ProjectDocument, ...(current[projectId] ?? [])],
      }))
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'No se pudo subir el PDF.'
      setError(`${message}. Si falta configurar Supabase, ejecuta supabase/add_project_documents.sql.`)
    } finally {
      setUploadingDocumentId(null)
    }
  }

  function openProjectCard(event: React.MouseEvent<HTMLElement>, projectId: string) {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, button, a, [data-no-project-open]')) return
    setSelectedProjectEditing(false)
    setSelectedProjectId(projectId)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const searchedProjects = q
      ? projects.filter((project) => [project.name, project.description, project.note, project.requester_area, project.stack, project.repository_url, project.repository_url_secondary, project.website_url, project.status, project.priority].filter(Boolean).join(' ').toLowerCase().includes(q))
      : projects

    return filterAndSortProjects(searchedProjects, projectFilter)
  }, [projectFilter, projects, search])
  const selectedProject = selectedProjectId ? projects.find((project) => project.id === selectedProjectId) ?? null : null
  const selectedProjectDocuments = selectedProject ? projectDocuments[selectedProject.id] ?? [] : []

  return (
    <AppShell title="Proyectos" subtitle="Informacion cargada de cada proyecto" search={search} onSearchChange={setSearch}>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
        variants={staggerContainerVariants}
      >
      {error && <motion.div variants={fadeInUpVariants} className={`mb-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-900/60 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>{error}</motion.div>}

      <motion.div variants={fadeInUpVariants} className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative z-30">
          {filterMenuOpen && <button type="button" aria-label="Cerrar filtros" className="fixed inset-0 z-20 cursor-default" onClick={() => setFilterMenuOpen(false)} />}
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            aria-expanded={filterMenuOpen}
            aria-haspopup="menu"
            onClick={() => setFilterMenuOpen((open) => !open)}
            className={`relative z-30 inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold shadow-sm transition-colors ${
              isDark
                ? 'border-slate-700 bg-slate-900 text-slate-100 hover:border-blue-500/60 hover:bg-slate-800'
                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-slate-50'
            }`}
          >
            <Funnel className="h-4 w-4 text-blue-500" />
            <span>Filtrar</span>
            <span className={`max-w-40 truncate font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{projectFilterLabel(projectFilter)}</span>
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${filterMenuOpen ? 'rotate-180' : ''}`} />
          </motion.button>

          {filterMenuOpen && (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`absolute left-0 z-30 mt-2 w-72 overflow-hidden rounded-lg border p-2 shadow-xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
            >
              {projectFilterGroups.map((group, groupIndex) => (
                <div key={group.label} className={groupIndex > 0 ? `mt-2 border-t pt-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}` : ''}>
                  <p className={`px-2 pb-1 text-[11px] font-bold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{group.label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.options.map((option) => {
                      const selected = filterKey(projectFilter) === filterKey(option.filter)
                      return (
                        <button
                          key={filterKey(option.filter)}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() => {
                            setProjectFilter(option.filter)
                            setFilterMenuOpen(false)
                          }}
                          className={`flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            selected
                              ? isDark
                                ? 'bg-blue-500/15 font-semibold text-blue-300'
                                : 'bg-[#eaf3ff] font-semibold text-[#1554c7]'
                              : isDark
                                ? 'text-slate-300 hover:bg-slate-800'
                                : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{option.label}</span>
                          {selected && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ProjectCreateButton onCreated={() => window.location.reload()} isDark={isDark} />
        </div>
      </motion.div>

      {loading ? (
        <motion.div variants={fadeInUpVariants} className={`rounded-lg border p-6 text-sm ${cardClass} ${mutedClass}`}>Cargando proyectos...</motion.div>
      ) : filtered.length === 0 ? (
        <motion.div variants={fadeInUpVariants} className={`rounded-lg border p-6 text-sm ${cardClass} ${mutedClass}`}>No hay proyectos cargados.</motion.div>
      ) : (
        <motion.div variants={staggerContainerVariants} className="grid gap-4 xl:grid-cols-2">
          {filtered.map((project, index) => {
            const participants = participantsByProject[project.id] ?? []
            return (
            <motion.article
              key={project.id}
              variants={fadeInUpVariants}
              custom={Math.min(index * 0.035, 0.18)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.22 }}
              whileHover={{ scale: 1.02, y: -2, transition: { duration: 0.18, ease: 'easeOut' } }}
              whileTap={{ scale: 0.995 }}
              className={`group cursor-pointer rounded-lg border p-5 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)] transition-shadow duration-300 hover:shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] [content-visibility:auto] [contain-intrinsic-size:180px] ${projectPriorityCardClass(project.priority, isDark)}`}
              onClick={(event) => openProjectCard(event, project.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedProjectEditing(false)
                  setSelectedProjectId(project.id)
                }
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className={`truncate text-lg font-bold ${titleClass}`}>{project.name}</h3>
                  <p className={`mt-1 text-sm ${mutedClass}`}>{project.requester_area ?? 'Sin area'} - {project.stack ?? 'Sin stack'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`inline-flex h-9 items-center rounded-md border px-3 text-xs font-semibold ${statusTone(project.status, isDark)}`}>{project.status}</span>
                </div>
              </div>

              {participants.length > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="-space-x-2 flex">
                    {participants.slice(0, 5).map((participant) => (
                      <ParticipantAvatar key={participant.key} participant={participant} isDark={isDark} />
                    ))}
                  </div>
                  <span className={`text-xs font-semibold ${mutedClass}`}>
                    {participants.length === 1 ? '1 integrante activo' : `${participants.length} integrantes activos`}
                  </span>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                  <span>{project.priority}</span>
                  <span>{savingProgressId === project.id ? 'Guardando...' : `${project.progress}%`}</span>
                </div>
                <div className={`h-2 overflow-hidden rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                  <div className="h-full rounded-full bg-[#1677f2]" style={{ width: `${project.progress}%` }} />
                </div>
              </div>

              {project.note && <p className={`mt-3 line-clamp-2 text-sm leading-6 ${bodyClass}`}>{project.note}</p>}
              {project.website_url && (
                <motion.a
                  whileHover={{ y: -1, scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#1677f2] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1268d6]"
                  href={project.website_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  title={`Abrir web de ${project.name}`}
                >
                  <Globe2 className="h-4 w-4" />
                  Ir a web
                </motion.a>
              )}
            </motion.article>
            )
          })}
        </motion.div>
      )}
      </motion.div>

      {selectedProject && (
        <div
          className="prezi-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          onClick={() => {
            setSelectedProjectEditing(false)
            setSelectedProjectId(null)
          }}
        >
          <section
            className={`prezi-bubble-in max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border shadow-2xl ${isDark ? 'border-slate-800 bg-slate-950 text-slate-100' : 'border-slate-200 bg-white text-slate-950'}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5 backdrop-blur ${isDark ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200 bg-white/95'}`}>
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {selectedProjectEditing ? (
                    <StatusDropdown value={selectedProject.status} isDark={isDark} onChange={(status) => updateProject(selectedProject.id, 'status', status)} />
                  ) : (
                    <span className={`inline-flex h-9 items-center rounded-md border px-3 text-xs font-semibold ${statusTone(selectedProject.status, isDark)}`}>{selectedProject.status}</span>
                  )}
                  <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                    {selectedProject.priority}
                  </span>
                </div>
                {selectedProjectEditing ? (
                  <input
                    className={`w-full rounded-md border border-transparent bg-transparent text-2xl font-bold outline-none transition focus:border-blue-300 focus:px-2 ${titleClass}`}
                    value={selectedProject.name}
                    onChange={(event) => setProjects((current) => current.map((item) => (item.id === selectedProject.id ? { ...item, name: event.target.value } : item)))}
                    onBlur={(event) => updateProject(selectedProject.id, 'name', event.target.value.trim() || selectedProject.name)}
                  />
                ) : (
                  <h2 className={`text-2xl font-bold ${titleClass}`}>{selectedProject.name}</h2>
                )}
                <p className={`mt-2 text-sm ${mutedClass}`}>{selectedProject.requester_area ?? 'Sin area'} - {selectedProject.stack ?? 'Sin stack'}</p>
                {(participantsByProject[selectedProject.id] ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="-space-x-2 flex">
                      {(participantsByProject[selectedProject.id] ?? []).map((participant) => (
                        <ParticipantAvatar key={participant.key} participant={participant} size="md" isDark={isDark} />
                      ))}
                    </div>
                    <span className={`text-xs font-semibold ${mutedClass}`}>
                      Equipo detectado por commits
                    </span>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedProject.website_url && !selectedProjectEditing && (
                  <a
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[#1677f2] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1268d6]"
                    href={selectedProject.website_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Globe2 className="h-4 w-4" />
                    Ir a web
                  </a>
                )}
                <button
                  type="button"
                  className={`flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                    selectedProjectEditing
                      ? isDark
                        ? 'border-blue-800 bg-blue-950/40 text-blue-300 hover:bg-blue-950/60'
                        : 'border-blue-200 bg-blue-50 text-[#1769e0] hover:bg-blue-100'
                      : isDark
                        ? 'border-slate-700 text-slate-300 hover:bg-slate-900'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedProjectEditing((current) => !current)}
                  title={selectedProjectEditing ? 'Guardar cambios' : 'Editar proyecto'}
                >
                  <Pencil className="h-4 w-4" />
                  {selectedProjectEditing ? 'Guardar' : 'Editar'}
                </button>
                <button
                  type="button"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-900' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  onClick={() => {
                    setSelectedProjectEditing(false)
                    setSelectedProjectId(null)
                  }}
                  title="Cerrar detalle"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <div className={`rounded-lg border p-4 ${panelClass}`}>
                  <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Descripcion</p>
                  <p className={`mt-3 text-sm leading-7 ${bodyClass}`}>{selectedProject.description || 'Sin descripcion cargada.'}</p>
                </div>

                <div className={`block rounded-lg border p-4 ${panelClass}`}>
                  <div className="flex items-center justify-between gap-4">
                    <span className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Nota interna</span>
                    {savingField === `${selectedProject.id}-note` && <span className={`text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`}>Guardando...</span>}
                  </div>
                  {selectedProjectEditing ? (
                    <textarea
                      className={`mt-3 min-h-36 w-full resize-y rounded-md border px-3 py-2 text-sm leading-6 outline-none ${inputClass}`}
                      placeholder="Estado corto, mantenimiento pendiente, observaciones del equipo..."
                      value={selectedProject.note ?? ''}
                      onChange={(event) => setProjects((current) => current.map((item) => (item.id === selectedProject.id ? { ...item, note: event.target.value } : item)))}
                      onBlur={(event) => updateProject(selectedProject.id, 'note', event.target.value.trim() || null)}
                    />
                  ) : (
                    <p className={`mt-3 text-sm leading-7 ${selectedProject.note ? bodyClass : mutedClass}`}>
                      {selectedProject.note || 'Sin nota cargada.'}
                    </p>
                  )}
                </div>

                <div className={`rounded-lg border p-4 ${panelClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Pagina web</p>
                    {savingField === `${selectedProject.id}-website_url` && <span className={`text-xs font-semibold ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`}>Guardando...</span>}
                  </div>
                  {selectedProjectEditing ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        className={`h-10 min-w-0 flex-1 rounded-md border px-3 text-sm font-medium outline-none ${inputClass}`}
                        placeholder="https://proyecto.vercel.app"
                        value={selectedProject.website_url ?? ''}
                        onChange={(event) => setProjects((current) => current.map((item) => (item.id === selectedProject.id ? { ...item, website_url: event.target.value } : item)))}
                        onBlur={(event) => updateProject(selectedProject.id, 'website_url', normalizeWebsiteUrl(event.target.value))}
                      />
                      {selectedProject.website_url && (
                        <a
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 text-blue-300 hover:bg-slate-900' : 'border-slate-200 text-[#1769e0] hover:bg-white'}`}
                          href={normalizeWebsiteUrl(selectedProject.website_url) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir pagina web"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ) : selectedProject.website_url ? (
                    <a
                      className="mt-3 inline-flex items-center gap-2 break-all text-sm font-semibold text-[#1769e0] hover:underline dark:text-blue-300"
                      href={selectedProject.website_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Globe2 className="h-4 w-4 shrink-0" />
                      {selectedProject.website_url}
                    </a>
                  ) : (
                    <p className={`mt-3 text-sm ${mutedClass}`}>Sin pagina web cargada.</p>
                  )}
                </div>

                <div className={`rounded-lg border p-4 ${panelClass}`}>
                  <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Repositorios</p>
                  {selectedProjectEditing ? (
                    <div className="mt-3 grid gap-3">
                      {[
                        ['repository_url', 'Repo 1'],
                        ['repository_url_secondary', 'Repo 2'],
                      ].map(([field, label]) => {
                        const repoField = field as 'repository_url' | 'repository_url_secondary'
                        const value = selectedProject[repoField] ?? ''
                        const showSecondaryInput = repoField === 'repository_url_secondary' && (value || addingSecondaryRepoIds.includes(selectedProject.id))
                        if (repoField === 'repository_url_secondary' && !showSecondaryInput) {
                          return (
                            <button
                              key={field}
                              type="button"
                              className={`inline-flex h-10 w-fit items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                                isDark ? 'border-slate-700 text-blue-300 hover:bg-slate-900' : 'border-slate-200 text-[#1769e0] hover:bg-white'
                              }`}
                              onClick={() => setAddingSecondaryRepoIds((current) => (current.includes(selectedProject.id) ? current : [...current, selectedProject.id]))}
                            >
                              <Plus className="h-4 w-4" />
                              Agregar Repo 2
                            </button>
                          )
                        }

                        return (
                          <label key={field} className="grid gap-1.5">
                            <span className={`text-xs font-semibold ${labelClass}`}>{label}</span>
                            <div className="flex items-center gap-2">
                              <input
                                className={`h-10 min-w-0 flex-1 rounded-md border px-3 text-sm font-medium outline-none ${inputClass}`}
                                placeholder={`${label} - link`}
                                value={value}
                                onChange={(event) => setProjects((current) => current.map((item) => (item.id === selectedProject.id ? { ...item, [field]: event.target.value } : item)))}
                                onBlur={(event) => updateProject(selectedProject.id, repoField, event.target.value.trim() || null)}
                              />
                              {value && (
                                <a
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 text-blue-300 hover:bg-slate-900' : 'border-slate-200 text-[#1769e0] hover:bg-white'}`}
                                  href={value}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`Abrir ${label}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {[
                        [selectedProject.repository_url, 'Repo 1'],
                        [selectedProject.repository_url_secondary, 'Repo 2'],
                      ].map(([url, label]) =>
                        url ? (
                          <a key={label} className="block break-all text-sm font-semibold leading-6 text-[#1769e0] hover:underline" href={url} target="_blank" rel="noreferrer">
                            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}: </span>
                            {url}
                          </a>
                        ) : null,
                      )}
                      {!selectedProject.repository_url && !selectedProject.repository_url_secondary && <p className={`text-sm ${mutedClass}`}>Sin repositorios cargados.</p>}
                    </div>
                  )}
                </div>

                <div className={`rounded-lg border p-4 ${panelClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>PDFs del proyecto</p>
                      <p className={`mt-0.5 text-xs ${mutedClass}`}>Documentacion asociada al proyecto.</p>
                    </div>
                    <label
                      className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                        isDark ? 'border-slate-700 text-blue-300 hover:bg-slate-900' : 'border-slate-200 text-[#1769e0] hover:bg-white'
                      } ${uploadingDocumentId === selectedProject.id ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingDocumentId === selectedProject.id ? 'Subiendo...' : 'Agregar PDF'}
                      <input
                        className="hidden"
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={uploadingDocumentId === selectedProject.id}
                        onChange={(event) => {
                          void uploadProjectPdf(selectedProject.id, event.target.files?.[0] ?? null)
                          event.currentTarget.value = ''
                        }}
                      />
                    </label>
                  </div>

                  {selectedProjectDocuments.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {selectedProjectDocuments.map((document) => (
                        <a
                          key={document.id}
                          className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition ${
                            isDark ? 'border-slate-800 bg-slate-900/70 hover:bg-slate-900' : 'border-slate-200 bg-white/80 hover:bg-white'
                          }`}
                          href={document.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <FileText className={`h-4 w-4 shrink-0 ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`} />
                            <span className={`truncate text-sm font-semibold ${titleClass}`}>{document.file_name}</span>
                          </span>
                          <span className={`shrink-0 text-xs ${mutedClass}`}>{formatFileSize(document.size_bytes)}</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-3 text-sm ${mutedClass}`}>Sin PDFs cargados.</p>
                  )}
                </div>

                <div className={`rounded-lg border p-4 ${panelClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <GitCommitHorizontal className={`h-4 w-4 ${isDark ? 'text-blue-300' : 'text-[#1769e0]'}`} />
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Modificaciones recientes</p>
                    </div>
                    <span className={`text-xs ${mutedClass}`}>{(commitsByProject[selectedProject.id] ?? []).length} commits</span>
                  </div>

                  {(commitsByProject[selectedProject.id] ?? []).length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {(commitsByProject[selectedProject.id] ?? []).map((commit) => (
                        <a
                          key={`${commit.repo}-${commit.sha}`}
                          className={`block rounded-md border px-3 py-2 transition ${
                            isDark ? 'border-slate-800 bg-slate-900/70 hover:bg-slate-900' : 'border-slate-200 bg-white/80 hover:bg-white'
                          }`}
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <p className={`text-sm font-semibold leading-5 ${titleClass}`}>{commit.message}</p>
                          <p className={`mt-1 text-xs ${mutedClass}`}>
                            {commit.repoLabel} - {commit.author} - {formatCommitDate(commit.date)}
                          </p>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className={`mt-3 text-sm ${mutedClass}`}>No hay commits recientes en los repositorios vinculados.</p>
                  )}
                </div>
              </div>

              <aside className="space-y-5">
                <div className={`rounded-lg border p-4 ${panelClass}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Desarrollo</p>
                      <p className={`mt-0.5 text-xs ${mutedClass}`}>Avance general del proyecto</p>
                    </div>
                    <p className={`rounded-md px-2.5 py-1 text-sm font-bold ${isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-[#eaf3ff] text-[#1554c7]'}`}>
                      {savingProgressId === selectedProject.id ? 'Guardando...' : `${selectedProject.progress}%`}
                    </p>
                  </div>
                  {selectedProjectEditing ? (
                    <input
                      className="progress-slider mt-5 w-full"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={selectedProject.progress}
                      onChange={(event) => updateProgress(selectedProject.id, Number(event.target.value))}
                      style={{
                        background: `linear-gradient(to right, #1677f2 0%, #1677f2 ${selectedProject.progress}%, ${isDark ? '#1e293b' : '#e2e8f0'} ${selectedProject.progress}%, ${isDark ? '#1e293b' : '#e2e8f0'} 100%)`,
                      }}
                      aria-label={`Progreso de ${selectedProject.name}`}
                    />
                  ) : (
                    <div className={`mt-5 h-3 overflow-hidden rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <div className="h-full rounded-full bg-[#1677f2]" style={{ width: `${selectedProject.progress}%` }} />
                    </div>
                  )}
                </div>

                <div className={`grid gap-3 rounded-lg border p-4 ${panelClass}`}>
                  <div>
                    <p className={`text-xs font-semibold ${labelClass}`}>Prioridad</p>
                    {selectedProjectEditing ? (
                      <select className={`mt-1 h-10 w-full rounded-md border px-2 font-semibold outline-none ${inputClass}`} value={selectedProject.priority} onChange={(event) => updateProject(selectedProject.id, 'priority', event.target.value)}>
                        {priorities.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{selectedProject.priority}</p>
                    )}
                  </div>

                  <div>
                    <p className={`text-xs font-semibold ${labelClass}`}>Entrega</p>
                    {selectedProjectEditing ? (
                      <input
                        className={`mt-1 h-10 w-full rounded-md border px-2 font-semibold outline-none ${inputClass}`}
                        type="date"
                        value={selectedProject.estimated_delivery ?? ''}
                        onChange={(event) => updateProject(selectedProject.id, 'estimated_delivery', event.target.value || null)}
                      />
                    ) : (
                      <p className={`mt-1 text-sm font-semibold ${titleClass}`}>{selectedProject.estimated_delivery || 'Sin fecha'}</p>
                    )}
                  </div>
                </div>

                {selectedProjectEditing && (
                  <button
                    type="button"
                    className={`flex h-11 w-full items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${
                      isDark ? 'border-red-900/60 bg-red-950/30 text-red-300 hover:bg-red-950/60' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                    onClick={() => deleteProject(selectedProject)}
                    disabled={deletingId === selectedProject.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar proyecto
                  </button>
                )}
              </aside>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}
