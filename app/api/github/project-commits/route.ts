export const dynamic = 'force-dynamic'
export const revalidate = 0

type ProjectCommitRequest = {
  projects?: Array<{
    id: string
    repositoryUrl?: string | null
    repositoryUrlSecondary?: string | null
  }>
  days?: number | null
  allTime?: boolean
  limitPerRepo?: number
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
    committer?: {
      name: string | null
      date: string | null
    } | null
  }
  author?: {
    login?: string
    avatar_url?: string
  } | null
}

type ProjectCommitActivity = {
  sha: string
  message: string
  author: string
  authorLogin: string | null
  authorAvatarUrl: string | null
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

async function fetchRepoCommits(repoUrl: string | null | undefined, repoLabel: string, headers: HeadersInit, days: number | null, limitPerRepo: number) {
  const repo = parseGithubRepo(repoUrl)
  if (!repo) return []

  const since = days
    ? (() => {
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date
      })()
    : null
  const sinceParam = since ? `&since=${encodeURIComponent(since.toISOString())}` : ''

  const commits: GithubCommit[] = []
  let page = 1
  const perPage = Math.min(100, Math.max(20, limitPerRepo))

  while (commits.length < limitPerRepo) {
    const response = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=${perPage}&page=${page}${sinceParam}&_=${Date.now()}`,
      {
        headers,
        cache: 'no-store',
      },
    )

    if (!response.ok) break

    const pageCommits = (await response.json()) as GithubCommit[]
    commits.push(...pageCommits)

    if (pageCommits.length < perPage || days) break
    page += 1
  }

  return commits.slice(0, limitPerRepo).map((commit) => ({
    sha: commit.sha,
    message: firstCommitLine(commit.commit.message),
    author: commit.author?.login ?? commit.commit.author?.name ?? 'Sin autor',
    authorLogin: commit.author?.login ?? null,
    authorAvatarUrl: commit.author?.avatar_url ?? null,
    date: commit.commit.author?.date ?? commit.commit.committer?.date ?? null,
    url: commit.html_url,
    repo: `${repo.owner}/${repo.repo}`,
    repoLabel,
  }))
}

export async function POST(request: Request) {
  const body = (await request.json()) as ProjectCommitRequest
  const projects = body.projects ?? []
  const days = body.allTime ? null : typeof body.days === 'number' ? body.days : 3
  const limitPerRepo = Math.min(300, Math.max(10, body.limitPerRepo ?? (body.allTime ? 300 : 30)))
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
          fetchRepoCommits(project.repositoryUrl, 'Repo 1', headers, days, limitPerRepo),
          fetchRepoCommits(project.repositoryUrlSecondary, 'Repo 2', headers, days, limitPerRepo),
        ])
      )
        .flat()
        .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
        .slice(0, limitPerRepo * 2)

      return [project.id, commits] as const
    }),
  )

  return Response.json({
    commitsByProject: Object.fromEntries(entries) as Record<string, ProjectCommitActivity[]>,
    configured: Boolean(token),
  })
}
