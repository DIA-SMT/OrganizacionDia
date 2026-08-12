export type CatalogProject = {
  id: string
  name: string
  description: string | null
  requester_area: string | null
  functional_owner: string | null
  stack: string | null
  repository_url: string | null
  repository_url_secondary: string | null
  website_url: string | null
  status: string
  priority: string
  start_date: string | null
  estimated_delivery: string | null
  team_id: string
  team_slug: string
  team_name: string
  team_color: string | null
  technical_owner_name: string | null
  updated_at: string
}

export type CatalogTeamOption = {
  slug: string
  name: string
  color: string | null
  count: number
}

export function getTeamOptions(projects: Pick<CatalogProject, 'team_slug' | 'team_name' | 'team_color'>[]): CatalogTeamOption[] {
  const bySlug = new Map<string, CatalogTeamOption>()

  for (const project of projects) {
    const existing = bySlug.get(project.team_slug)
    if (existing) {
      existing.count += 1
    } else {
      bySlug.set(project.team_slug, {
        slug: project.team_slug,
        name: project.team_name,
        color: project.team_color,
        count: 1,
      })
    }
  }

  return Array.from(bySlug.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

type SearchableCatalogProject = Pick<
  CatalogProject,
  'name' | 'description' | 'stack' | 'requester_area' | 'functional_owner' | 'technical_owner_name' | 'team_name' | 'team_slug' | 'status'
>

export function filterCatalog<T extends SearchableCatalogProject>(
  projects: T[],
  teamSlug: string | null,
  search: string
): T[] {
  const query = search.trim().toLowerCase()

  return projects
    .filter((project) => {
      if (teamSlug && project.team_slug !== teamSlug) return false
      if (!query) return true
      return [
        project.name,
        project.description,
        project.stack,
        project.requester_area,
        project.functional_owner,
        project.technical_owner_name,
        project.team_name,
        project.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
