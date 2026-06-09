type GithubRepo = {
  name: string
  description: string | null
  html_url: string
  language: string | null
  updated_at: string
  archived: boolean
  private: boolean
}

function priorityFromRepo(repo: GithubRepo) {
  if (repo.archived) return 'Baja'
  if (repo.name.toLowerCase().includes('dia')) return 'Alta'
  return 'Media'
}

function statusFromRepo(repo: GithubRepo) {
  if (repo.archived) return 'Pausado'
  return 'En desarrollo'
}

export async function GET() {
  const org = process.env.GITHUB_ORG || 'DIA-SMT'
  const token = process.env.GITHUB_TOKEN

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Organizacion-DIA',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`https://api.github.com/orgs/${org}/repos?per_page=100&type=all&sort=updated`, {
    headers,
    next: { revalidate: 300 },
  })

  if (!response.ok) {
    return Response.json(
      {
        projects: [],
        configured: Boolean(token),
        error: response.status === 404 ? 'No se pudo acceder a la organizacion. Si es privada, configura GITHUB_TOKEN.' : 'No se pudieron cargar repositorios desde GitHub.',
      },
      { status: 200 }
    )
  }

  const repos = (await response.json()) as GithubRepo[]
  const projects = repos.map((repo) => ({
    name: repo.name,
    area: org,
    stack: repo.language || 'Sin stack',
    status: statusFromRepo(repo),
    priority: priorityFromRepo(repo),
    progress: repo.archived ? 100 : 20,
    delivery: null,
    repositoryUrl: repo.html_url,
    updatedAt: repo.updated_at,
    description: repo.description,
    private: repo.private,
  }))

  return Response.json({ projects, configured: Boolean(token), error: null }, { status: 200 })
}
