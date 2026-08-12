export type OverlapStatus = 'Pendiente' | 'Confirmado' | 'Descartado'

export type OverlapDetail = {
  id: string
  score: number
  match_reason: string
  status: OverlapStatus
  reviewed_at: string | null
  created_at: string
  project_a_id: string
  project_a_name: string
  team_a_name: string
  team_a_slug: string
  team_a_color: string | null
  project_b_id: string
  project_b_name: string
  team_b_name: string
  team_b_slug: string
  team_b_color: string | null
  reviewed_by_name: string | null
}

export type SimilarProject = {
  project_id: string
  project_name: string
  project_status: string
  team_id: string
  team_name: string
  team_slug: string
  score: number
  match_reason: string
}

export function formatOverlapScore(score: number): string {
  const bounded = Math.max(0, Math.min(1, Number(score) || 0))
  return `${Math.round(bounded * 100)}%`
}

const statusOrder: Record<string, number> = { Pendiente: 0, Confirmado: 1, Descartado: 2 }

export function sortOverlaps<T extends { status: string; score: number; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
    if (statusDiff !== 0) return statusDiff

    const scoreDiff = Number(b.score) - Number(a.score)
    if (scoreDiff !== 0) return scoreDiff

    return b.created_at.localeCompare(a.created_at)
  })
}
