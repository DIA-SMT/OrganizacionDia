type ProjectCommitRequest = {
  projects?: Array<{
    id: string
    repositoryUrl?: string | null
    repositoryUrlSecondary?: string | null
  }>
}

type GithubCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: {
      name: string | null
      date: string | null
    } | null
  }
  author?: {
    login?: string
  } | null
}

type ProjectCommitActivity = {
  sha: string
  message: string
  author: string
  date: string | null
  url: string
  repo: string
  repoLabel: string
}

function parseGithubRepo(url: string | null | undefined) {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (!parsed.hostname.includes('github.com')) return null

    const [owner, rawRepo] = parsed.pathname.replace(/^\/+/, '').split('/')
    if (!owner || !rawRepo) return null

    return {
      owner,
      repo: rawRepo.replace(/\.git$/, ''),
    }
  } catch {
    return null
  }
}

function firstCommitLine(message: string) {
  return message.split('\n')[0]?.trim() || 'Commit sin descripcion'
}

async function fetchRepoCommits(repoUrl: string | null | undefined, repoLabel: string, headers: HeadersInit) {
  const repo = parseGithubRepo(repoUrl)
  if (!repo) return []

  const since = new Date()
  since.setDate(since.getDate() - 3)

  const response = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=5&since=${encodeURIComponent(since.toISOString())}`,
    {
      headers,
      next: { revalidate: 300 },
    },
  )

  if (!response.ok) return []

  const commits = (await response.json()) as GithubCommit[]
  return commits.map((commit) => ({
    sha: commit.sha,
    message: firstCommitLine(commit.commit.message),
    author: commit.author?.login ?? commit.commit.author?.name ?? 'Sin autor',
    date: commit.commit.author?.date ?? null,
    url: commit.html_url,
    repo: `${repo.owner}/${repo.repo}`,
    repoLabel,
  }))
}

export async function POST(request: Request) {
  const body = (await request.json()) as ProjectCommitRequest
  const projects = body.projects ?? []
  const token = process.env.GITHUB_TOKEN

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Organizacion-DIA',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  if (token) headers.Authorization = `Bearer ${token}`

  const entries = await Promise.all(
    projects.map(async (project) => {
      const commits = (
        await Promise.all([
          fetchRepoCommits(project.repositoryUrl, 'Repo 1', headers),
          fetchRepoCommits(project.repositoryUrlSecondary, 'Repo 2', headers),
        ])
      )
        .flat()
        .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
        .slice(0, 6)

      return [project.id, commits] as const
    }),
  )

  return Response.json({
    commitsByProject: Object.fromEntries(entries) as Record<string, ProjectCommitActivity[]>,
    configured: Boolean(token),
  })
}
