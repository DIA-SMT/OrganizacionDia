'use client'

import { useAuth } from '@/context/AuthContext'
import { canAccessRoute, homeRouteForTeam } from '@/lib/team-access'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Redirige a los equipos externos fuera de los modulos internos de DIA.
// La proteccion de datos real es RLS; esto es solo experiencia de uso.
export function TeamGate() {
  const { user, loading, authConfigured, teamSlug } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!authConfigured || loading || !user) return
    if (!canAccessRoute(teamSlug, pathname)) {
      router.replace(homeRouteForTeam(teamSlug))
    }
  }, [authConfigured, loading, pathname, router, teamSlug, user])

  return null
}
