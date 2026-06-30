'use client'

import { Check, ChevronDown, Users } from 'lucide-react'
import { useState } from 'react'

export type MemberChoice = {
  id: string
  label: string
  avatarUrl?: string | null
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase() || '?'
}

function MemberAvatar({ member, size = 'sm' }: { member: MemberChoice; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'md' ? 'h-8 w-8 text-[10px]' : 'h-6 w-6 text-[9px]'

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-bold text-blue-700 ring-2 ring-white dark:bg-blue-500/20 dark:text-blue-200 dark:ring-slate-900 ${sizeClass}`}>
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full w-full object-cover" src={member.avatarUrl} alt="" />
      ) : (
        initials(member.label)
      )}
    </span>
  )
}

export function MemberMultiSelect({
  members,
  selectedIds,
  onChange,
  label = 'Responsables',
  disabled = false,
}: {
  members: MemberChoice[]
  selectedIds: string[]
  onChange: (memberIds: string[]) => void
  label?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedMembers = members.filter((member) => selectedIds.includes(member.id))

  function toggleMember(memberId: string) {
    onChange(selectedIds.includes(memberId) ? selectedIds.filter((id) => id !== memberId) : [...selectedIds, memberId])
  }

  return (
    <div className="relative">
      <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 transition hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-55 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:border-blue-500/50"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-blue-500" />
          <span className="truncate">{selectedMembers.length > 0 ? `${selectedMembers.length} responsables` : 'Sin responsables'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {selectedMembers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedMembers.map((member) => (
            <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <MemberAvatar member={member} />
              {member.label}
            </span>
          ))}
        </div>
      )}

      {open && !disabled && (
        <>
          <button type="button" aria-label="Cerrar responsables" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div data-lenis-prevent role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {members.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500 dark:text-slate-400">No hay integrantes activos.</p>
            ) : (
              members.map((member) => {
                const selected = selectedIds.includes(member.id)
                return (
                  <button
                    key={member.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition ${
                      selected
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => toggleMember(member.id)}
                  >
                    <MemberAvatar member={member} size="md" />
                    <span className="min-w-0 flex-1 truncate font-semibold">{member.label}</span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function TaskAssigneeList({ members }: { members: MemberChoice[] }) {
  if (members.length === 0) return <span className="text-xs text-slate-400 dark:text-slate-500">Sin responsables</span>

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2">
      <div className="flex -space-x-1.5">
        {members.slice(0, 4).map((member) => <MemberAvatar key={member.id} member={member} />)}
      </div>
      <span className="truncate text-xs font-medium text-slate-500 dark:text-slate-400" title={members.map((member) => member.label).join(', ')}>
        {members.map((member) => member.label).join(', ')}
      </span>
    </div>
  )
}
