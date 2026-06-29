export function uniqueMemberIds(memberIds: string[]) {
  return [...new Set(memberIds.filter(Boolean))].sort()
}

export function getAssigneeChanges(currentMemberIds: string[], nextMemberIds: string[]) {
  const current = uniqueMemberIds(currentMemberIds)
  const next = uniqueMemberIds(nextMemberIds)
  const currentSet = new Set(current)
  const nextSet = new Set(next)

  return {
    added: next.filter((memberId) => !currentSet.has(memberId)),
    removed: current.filter((memberId) => !nextSet.has(memberId)),
    next,
  }
}
