import { getSupabaseAdminClient } from '@/lib/supabase/admin'

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

type CachedCommitRow = {
  project_id: string
  sha: string
  message: string
  author: string
  author_login: string | null
  author_avatar_url: string | null
  committed_at: string | null
  commit_url: string
  repository: string
  repository_label: string
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

async function loadCachedCommits(projectIds: string[], days: number | null, limitPerProject: number) {
  const supabase = getSupabaseAdminClient()
  if (!supabase || projectIds.length === 0) return {} as Record<string, ProjectCommitActivity[]>

  let query = supabase
    .from('project_commits')
    .select('project_id, sha, message, author, author_login, author_avatar_url, committed_at, commit_url, repository, repository_label')
    .in('project_id', projectIds)
    .order('committed_at', { ascending: false })
    .limit(Math.max(50, projectIds.length * limitPerProject * 2))

  if (days) query = query.gte('committed_at', new Date(Date.now() - days * 86400000).toISOString())
  const { data, error } = await query
  if (error) return {}

  const grouped: Record<string, ProjectCommitActivity[]> = {}
  for (const row of (data ?? []) as CachedCommitRow[]) {
    const list = grouped[row.project_id] ?? []
    if (list.length >= limitPerProject * 2) continue
    list.push({
      sha: row.sha,
      message: row.message,
      author: row.author,
      authorLogin: row.author_login,
      authorAvatarUrl: row.author_avatar_url,
      date: row.committed_at,
      url: row.commit_url,
      repo: row.repository,
      repoLabel: row.repository_label,
    })
    grouped[row.project_id] = list
  }
  return grouped
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

  const liveByProject = Object.fromEntries(entries) as Record<string, ProjectCommitActivity[]>
  const supabase = getSupabaseAdminClient()
  const rowsToCache = entries.flatMap(([projectId, commits]) => commits.map((commit) => ({
    project_id: projectId,
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    author_login: commit.authorLogin,
    author_avatar_url: commit.authorAvatarUrl,
    committed_at: commit.date,
    commit_url: commit.url,
    repository: commit.repo,
    repository_label: commit.repoLabel,
    synced_at: new Date().toISOString(),
  })))

  if (supabase && rowsToCache.length > 0) {
    await supabase.from('project_commits').upsert(rowsToCache, { onConflict: 'project_id,sha' })
  }

  const cachedByProject = await loadCachedCommits(projects.map((project) => project.id), days, limitPerRepo)
  const commitsByProject = Object.fromEntries(projects.map((project) => {
    const merged = new Map<string, ProjectCommitActivity>()
    for (const commit of [...(liveByProject[project.id] ?? []), ...(cachedByProject[project.id] ?? [])]) {
      merged.set(commit.sha, commit)
    }
    return [project.id, Array.from(merged.values())
      .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
      .slice(0, limitPerRepo * 2)]
  }))

  return Response.json({
    commitsByProject,
    configured: Boolean(token),
    cached: Object.values(cachedByProject).some((commits) => commits.length > 0),
  })
}
