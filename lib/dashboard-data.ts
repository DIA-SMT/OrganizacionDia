export type DashboardProject = {
  name: string
  area: string
  stack: string
  status: string
  priority: string
  progress: number
  delivery: string | null
  repositoryUrl?: string | null
  repositoryUrlSecondary?: string | null
  updatedAt?: string
  description?: string | null
  private?: boolean
}

export type DashboardTask = {
  title: string
  project: string
  owner: string
}

export type PipelineColumn = {
  title: string
  tone: string
  tasks: DashboardTask[]
}
