export type ProjectFilter =
  | { kind: 'all' }
  | { kind: 'active' }
  | { kind: 'finished' }
  | { kind: 'paused' }
  | { kind: 'status'; value: string }
  | { kind: 'priority'; value: string }

type FilterableProject = {
  name: string
  status: string
  priority: string
}

function priorityWeight(priority: string) {
  if (priority === 'Critica') return 4
  if (priority === 'Alta') return 3
  if (priority === 'Media') return 2
  return 1
}

function matchesFilter(project: FilterableProject, filter: ProjectFilter) {
  if (filter.kind === 'all') return true
  if (filter.kind === 'active') return project.status !== 'En Producción' && project.status !== 'Pausado'
  if (filter.kind === 'finished') return project.status === 'En Producción'
  if (filter.kind === 'paused') return project.status === 'Pausado'
  if (filter.kind === 'status') return project.status === filter.value
  return project.priority === filter.value
}

export function filterAndSortProjects<T extends FilterableProject>(projects: T[], filter: ProjectFilter) {
  return projects.filter((project) => matchesFilter(project, filter)).sort((a, b) => {
    const pausedDiff = Number(a.status === 'Pausado') - Number(b.status === 'Pausado')
    if (pausedDiff !== 0) return pausedDiff

    const priorityDiff = priorityWeight(b.priority) - priorityWeight(a.priority)
    if (priorityDiff !== 0) return priorityDiff

    return a.name.localeCompare(b.name, 'es')
  })
}
