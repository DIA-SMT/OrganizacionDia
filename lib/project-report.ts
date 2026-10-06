// Informe institucional de proyectos (app/informe). Aca vive la parte pura: que proyectos
// entran, como se agrupan, que se destaca y como se reparten los bloques en hojas A4.
// La pantalla (components/project-report-screen.tsx) solo trae los datos y dibuja.

export const REPORT_STATUSES = ['En Producción', 'QA', 'En desarrollo'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const REPORT_SECTION_TITLES: Record<ReportStatus, string> = {
  'En Producción': 'Proyectos en producción',
  QA: 'Proyectos en pruebas (QA)',
  'En desarrollo': 'Proyectos en desarrollo',
}

const ACTIVITY_DAYS = 30
const UPCOMING_DAYS = 30
const PRIORITY_WEIGHT: Record<string, number> = { Critica: 4, Alta: 3, Media: 2, Baja: 1 }

export type ReportProjectRow = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  website_url: string | null
  production_url: string | null
  note: string | null
  status: string
  priority: string
  progress: number | null
  estimated_delivery: string | null
}

export type ReportInput = {
  projects: ReportProjectRow[]
  members: Array<{ id: string; full_name: string }>
  projectMembers: Array<{ project_id: string; member_id: string }>
  tasks: Array<{ id: string; project_id: string; status: string }>
  blockers: Array<{ task_id: string; reason: string }>
  commits: Array<{ project_id: string; committed_at: string | null; author: string }>
}

export type DeliveryState = 'vencida' | 'proxima' | 'en-plazo'

export type ReportProject = {
  id: string
  name: string
  description: string | null
  area: string | null
  site: string | null
  note: string | null
  status: ReportStatus
  priority: string
  progress: number
  delivery: string | null
  deliveryState: DeliveryState | null
  team: string[]
  commits: number
  contributors: number
  lastCommitAt: string | null
  tasksOpen: number
  tasksDone: number
  openBlockers: string[]
}

export type ProjectReport = {
  sections: Array<{ status: ReportStatus; title: string; projects: ReportProject[] }>
  totals: {
    projects: number
    byStatus: Record<ReportStatus, number>
    averageProgress: number
    commits: number
    activeProjects: number
    contributors: number
    tasksOpen: number
    openBlockers: number
  }
  overdue: ReportProject[]
  upcoming: ReportProject[]
  inactive: ReportProject[]
  mostActive: ReportProject[]
  missing: { description: number; area: number; delivery: number; team: number }
}

export function isReportStatus(status: string): status is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(status)
}

// Fecha local en formato YYYY-MM-DD, comparable con las columnas date de Postgres.
export function localIsoDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function withProtocol(url: string | null) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function deliveryStateFor(status: ReportStatus, delivery: string | null, now: Date): DeliveryState | null {
  // Lo que ya esta en produccion se entrego: la fecha estimada deja de ser una alerta.
  if (!delivery || status === 'En Producción') return null
  const today = localIsoDate(now)
  if (delivery < today) return 'vencida'
  if (delivery <= localIsoDate(addDays(now, UPCOMING_DAYS))) return 'proxima'
  return 'en-plazo'
}

export function buildProjectReport(input: ReportInput, now: Date): ProjectReport {
  const since = addDays(now, -ACTIVITY_DAYS).toISOString()
  const memberNames = new Map(input.members.map((member) => [member.id, member.full_name]))

  const teamByProject = new Map<string, string[]>()
  for (const row of input.projectMembers) {
    const name = memberNames.get(row.member_id)
    if (!name) continue
    teamByProject.set(row.project_id, [...(teamByProject.get(row.project_id) ?? []), name])
  }

  const projectByTask = new Map(input.tasks.map((task) => [task.id, task.project_id]))
  const blockersByProject = new Map<string, string[]>()
  for (const blocker of input.blockers) {
    const projectId = projectByTask.get(blocker.task_id)
    if (!projectId) continue
    blockersByProject.set(projectId, [...(blockersByProject.get(projectId) ?? []), blocker.reason])
  }

  const commitsByProject = new Map<string, Array<{ at: string; author: string }>>()
  const allAuthors = new Set<string>()
  for (const commit of input.commits) {
    if (!commit.committed_at || commit.committed_at < since) continue
    const author = commit.author.trim().toLowerCase()
    allAuthors.add(author)
    commitsByProject.set(commit.project_id, [...(commitsByProject.get(commit.project_id) ?? []), { at: commit.committed_at, author }])
  }

  const projects: ReportProject[] = input.projects.flatMap((row) => {
    if (!isReportStatus(row.status)) return []

    const commits = commitsByProject.get(row.id) ?? []
    const tasks = input.tasks.filter((task) => task.project_id === row.id)
    const tasksDone = tasks.filter((task) => task.status === 'Terminada').length

    return [
      {
        id: row.id,
        name: row.name,
        description: cleanText(row.description),
        area: cleanText(row.requester_area),
        site: withProtocol(cleanText(row.production_url) ?? cleanText(row.website_url)),
        note: cleanText(row.note),
        status: row.status,
        priority: row.priority,
        progress: Math.min(100, Math.max(0, row.progress ?? 0)),
        delivery: row.estimated_delivery,
        deliveryState: deliveryStateFor(row.status, row.estimated_delivery, now),
        team: [...(teamByProject.get(row.id) ?? [])].sort((a, b) => a.localeCompare(b, 'es')),
        commits: commits.length,
        contributors: new Set(commits.map((commit) => commit.author)).size,
        lastCommitAt: commits.reduce<string | null>((latest, commit) => (!latest || commit.at > latest ? commit.at : latest), null),
        tasksOpen: tasks.length - tasksDone,
        tasksDone,
        openBlockers: blockersByProject.get(row.id) ?? [],
      },
    ]
  })

  const byPriorityThenName = (a: ReportProject, b: ReportProject) =>
    (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0) || a.name.localeCompare(b.name, 'es')

  const sections = REPORT_STATUSES.map((status) => ({
    status,
    title: REPORT_SECTION_TITLES[status],
    projects: projects.filter((project) => project.status === status).sort(byPriorityThenName),
  })).filter((section) => section.projects.length > 0)

  const byDelivery = (a: ReportProject, b: ReportProject) => (a.delivery ?? '').localeCompare(b.delivery ?? '') || a.name.localeCompare(b.name, 'es')
  const total = projects.length

  return {
    sections,
    totals: {
      projects: total,
      byStatus: Object.fromEntries(REPORT_STATUSES.map((status) => [status, projects.filter((project) => project.status === status).length])) as Record<ReportStatus, number>,
      averageProgress: total === 0 ? 0 : Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / total),
      commits: projects.reduce((sum, project) => sum + project.commits, 0),
      activeProjects: projects.filter((project) => project.commits > 0).length,
      contributors: allAuthors.size,
      tasksOpen: projects.reduce((sum, project) => sum + project.tasksOpen, 0),
      openBlockers: projects.reduce((sum, project) => sum + project.openBlockers.length, 0),
    },
    overdue: projects.filter((project) => project.deliveryState === 'vencida').sort(byDelivery),
    upcoming: projects.filter((project) => project.deliveryState === 'proxima').sort(byDelivery),
    inactive: projects.filter((project) => project.status !== 'En Producción' && project.commits === 0).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    mostActive: projects
      .filter((project) => project.commits > 0)
      .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name, 'es'))
      .slice(0, 5),
    missing: {
      description: projects.filter((project) => !project.description).length,
      area: projects.filter((project) => !project.area).length,
      delivery: projects.filter((project) => !project.delivery && project.status !== 'En Producción').length,
      team: projects.filter((project) => project.team.length === 0).length,
    },
  }
}

// Reparte bloques de alto conocido en hojas. keepWithNext marca los titulos: nunca quedan
// solos al pie de una hoja. Un bloque mas alto que una hoja vacia va solo en la suya.
export function paginateBlocks(heights: number[], firstCapacity: number, capacity: number, keepWithNext: boolean[] = []) {
  const pages: number[][] = [[]]
  let remaining = firstCapacity

  for (let index = 0; index < heights.length; index += 1) {
    const needed = keepWithNext[index] && index + 1 < heights.length ? heights[index] + heights[index + 1] : heights[index]
    const current = pages[pages.length - 1]

    if (needed > remaining && current.length > 0) {
      pages.push([])
      remaining = capacity
    }

    pages[pages.length - 1].push(index)
    remaining -= heights[index]
  }

  return pages
}

export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

// A mano y no con Intl: cada navegador abrevia distinto ("21 de ago de 2026", "21 ago. 2026").
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Las columnas date llegan como YYYY-MM-DD y se toman tal cual para que no corran un dia;
// los timestamps (ultimo commit) se muestran en la hora local.
export function formatReportDate(value: string | null) {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) return `${Number(dateOnly[3])} ${MONTHS[Number(dateOnly[2]) - 1].slice(0, 3)} ${dateOnly[1]}`

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`
}

export function formatLongDate(date: Date) {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`
}

export function formatMonthYear(date: Date) {
  const month = MONTHS[date.getMonth()]
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} de ${date.getFullYear()}`
}
