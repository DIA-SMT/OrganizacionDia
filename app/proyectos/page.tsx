import { ProjectsScreen } from '@/components/projects-screen'

type ProjectsPageProps = {
  searchParams?: Promise<{
    buscar?: string
    estado?: string
    proyecto?: string
  }>
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = (await searchParams) ?? {}
  const routeKey = `${params.buscar ?? ''}-${params.estado ?? ''}-${params.proyecto ?? ''}`

  return (
    <ProjectsScreen
      key={routeKey}
      initialSearch={params.buscar ?? ''}
      initialStatusFilter={params.estado ?? null}
      initialSelectedProjectId={params.proyecto ?? null}
    />
  )
}
