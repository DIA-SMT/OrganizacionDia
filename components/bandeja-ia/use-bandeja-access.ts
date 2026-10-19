'use client'

import { useAuth } from '@/context/AuthContext'
import type { BandejaAccessDeniedReason, BandejaAccessSource } from '@/lib/bandeja-ia/access'
import { isTeamRestricted } from '@/lib/team-access'
import type { BandejaRole } from '@/lib/bandeja-ia/types'
import { useEffect, useSyncExternalStore } from 'react'

export type BandejaAccessState =
  | { status: 'loading' }
  | { status: 'allowed'; role: BandejaRole; source: BandejaAccessSource; actorId: string; actorName: string }
  | { status: 'denied'; reason: BandejaAccessDeniedReason }

const LOADING: BandejaAccessState = { status: 'loading' }
const DENIED_TEAM: BandejaAccessState = { status: 'denied', reason: 'equipo' }
const DENIED_CONFIG: BandejaAccessState = { status: 'denied', reason: 'sin-configuracion' }

// Una consulta por usuario y por carga de la app: la comparten el sidebar y las pantallas.
const cache = new Map<string, BandejaAccessState>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function loadAccess(userId: string) {
  if (cache.has(userId) || inflight.has(userId)) return
  inflight.add(userId)
  let next: BandejaAccessState
  try {
    const response = await fetch('/api/bandeja-ia/access', { cache: 'no-store' })
    const payload = (await response.json()) as {
      allowed: boolean
      role?: BandejaRole
      source?: BandejaAccessSource
      reason?: BandejaAccessDeniedReason
      actorId?: string
      actorName?: string
    }
    next =
      payload.allowed && payload.role && payload.source
        ? { status: 'allowed', role: payload.role, source: payload.source, actorId: payload.actorId ?? userId, actorName: payload.actorName ?? 'Integrante' }
        : { status: 'denied', reason: payload.reason ?? 'sin-permiso' }
  } catch {
    // Ante cualquier falla, cerrado: sin acceso.
    next = { status: 'denied', reason: 'error' }
  }
  inflight.delete(userId)
  cache.set(userId, next)
  for (const listener of listeners) listener()
}

export function useBandejaAccess(): BandejaAccessState {
  const { user, loading, authConfigured, teamSlug } = useAuth()
  const userId = user?.id ?? null
  const externalTeam = isTeamRestricted(teamSlug)

  useEffect(() => {
    if (userId && !externalTeam) void loadAccess(userId)
  }, [userId, externalTeam])

  const cached = useSyncExternalStore(
    subscribe,
    () => (userId ? cache.get(userId) ?? LOADING : LOADING),
    () => LOADING,
  )

  if (!authConfigured) return DENIED_CONFIG
  if (loading || !userId) return LOADING
  // Equipos externos: ni siquiera se consulta (la ruta ademas esta cerrada por team-access).
  if (externalTeam) return DENIED_TEAM
  return cached
}
