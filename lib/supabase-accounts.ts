export type SupabaseAccount = {
  id: string
  alias_number: number
  email: string | null
  label: string | null
  notes: string | null
  project_limit: number
  active: boolean
  created_at: string
}

export type AccountProject = {
  id: string
  name: string
  status: string
  active: boolean
  supabase_account_id: string | null
}

export function sortAccounts<T extends { alias_number: number }>(accounts: T[], direction: 'asc' | 'desc' = 'asc'): T[] {
  const factor = direction === 'desc' ? -1 : 1
  return [...accounts].sort((a, b) => (a.alias_number - b.alias_number) * factor)
}

export function latestAccount<T extends { alias_number: number }>(accounts: T[]): T | null {
  if (accounts.length === 0) return null
  return accounts.reduce((latest, account) => (account.alias_number > latest.alias_number ? account : latest))
}

// Proximo alias libre: el maximo + 1 (arranca en 1 si no hay cuentas).
export function nextAliasNumber(accounts: Pick<SupabaseAccount, 'alias_number'>[]): number {
  return accounts.reduce((max, account) => Math.max(max, account.alias_number), 0) + 1
}

// Sugiere el correo del proximo alias reemplazando el patron +N del ultimo cargado.
// Si el ultimo correo no tiene ese patron, no arriesga una sugerencia.
export function suggestNextEmail(accounts: SupabaseAccount[]): string {
  const latest = latestAccount(accounts)
  if (!latest?.email) return ''

  const next = nextAliasNumber(accounts)
  const replaced = latest.email.replace(/\+\d+(?=@)/, `+${next}`)
  return replaced === latest.email ? '' : replaced
}

export function countActiveProjects(accountId: string, projects: AccountProject[]): number {
  return projects.filter((project) => project.active && project.supabase_account_id === accountId).length
}

export function isAccountFull(account: SupabaseAccount, projects: AccountProject[]): boolean {
  return countActiveProjects(account.id, projects) >= account.project_limit
}

export function unassignedProjects(projects: AccountProject[]): AccountProject[] {
  return projects.filter((project) => project.active && !project.supabase_account_id)
}
