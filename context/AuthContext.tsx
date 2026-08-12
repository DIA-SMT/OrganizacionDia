'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type { TeamRole } from '@/types/domain'

type MemberLookup = {
  id: string
  role: string
  team_id: string | null
  teams: { slug: string; name: string } | null
}

type AuthContextType = {
  user: User | null
  session: Session | null
  role: TeamRole | null
  memberId: string | null
  teamId: string | null
  teamSlug: string | null
  teamName: string | null
  loading: boolean
  authConfigured: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  memberId: null,
  teamId: null,
  teamSlug: null,
  teamName: null,
  loading: true,
  authConfigured: false,
  signOut: async () => {},
})

const MEMBER_SELECT = 'id, role, team_id, teams:team_id (slug, name)'
const LEGACY_MEMBER_SELECT = 'id, role'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<TeamRole | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teamSlug, setTeamSlug] = useState<string | null>(null)
  const [teamName, setTeamName] = useState<string | null>(null)
  const supabase = getSupabaseBrowserClient()
  const [loading, setLoading] = useState(Boolean(supabase))
  const lastUserId = useRef<string | null>(null)
  const loadingTimeoutRef = useRef<number | null>(null)

  function normalizeRole(value: string | null | undefined): TeamRole {
    const normalized = String(value ?? '').trim()
    if (normalized === 'Admin' || normalized === 'PM' || normalized === 'Dev' || normalized === 'QA' || normalized === 'Viewer') {
      return normalized
    }
    return 'Viewer'
  }

  function clearMember() {
    setRole(null)
    setMemberId(null)
    setTeamId(null)
    setTeamSlug(null)
    setTeamName(null)
  }

  useEffect(() => {
    if (!supabase) {
      return
    }

    loadingTimeoutRef.current = window.setTimeout(() => setLoading(false), 8000)

    async function lookupMember(column: 'auth_user_id' | 'email', value: string): Promise<MemberLookup | null> {
      if (!supabase) return null

      function buildQuery(select: string) {
        const query = supabase!.from('members').select(select).eq('active', true)
        return column === 'auth_user_id' ? query.eq('auth_user_id', value) : query.ilike('email', value)
      }

      const { data, error } = await buildQuery(MEMBER_SELECT).maybeSingle()

      if (!error) {
        return data as MemberLookup | null
      }

      // Base sin migrar (add_teams.sql pendiente): reintenta sin datos de equipo.
      const { data: legacy } = await buildQuery(LEGACY_MEMBER_SELECT).maybeSingle()

      if (!legacy) {
        return null
      }

      return { ...(legacy as Omit<MemberLookup, 'team_id' | 'teams'>), team_id: null, teams: null }
    }

    async function loadMember(currentUser: User | null) {
      if (!supabase || !currentUser) {
        clearMember()
        return
      }

      let member = await lookupMember('auth_user_id', currentUser.id)

      const userEmail = currentUser.email?.trim()

      if (!member && userEmail) {
        member = await lookupMember('email', userEmail)
      }

      if (!member) {
        setRole('Viewer')
        setMemberId(null)
        setTeamId(null)
        setTeamSlug(null)
        setTeamName(null)
        return
      }

      setRole(normalizeRole(member.role))
      setMemberId(member.id)
      setTeamId(member.team_id)
      setTeamSlug(member.teams?.slug ?? null)
      setTeamName(member.teams?.name ?? null)
    }

    async function initializeAuth() {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession()

        setSession(currentSession)
        setUser(currentSession?.user ?? null)
        lastUserId.current = currentSession?.user?.id ?? null
        await loadMember(currentSession?.user ?? null)

        try {
          const controller = new AbortController()
          const t = window.setTimeout(() => controller.abort(), 8000)
          const res = await fetch('/api/auth/me', {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          })
          window.clearTimeout(t)

          if (res.ok) {
            const payload = await res.json()
            setRole(payload.role ?? 'Viewer')
            setMemberId(payload.memberId ?? null)
            setTeamId(payload.teamId ?? null)
            setTeamSlug(payload.teamSlug ?? null)
            setTeamName(payload.teamName ?? null)
          } else if (res.status === 401) {
            setSession(null)
            setUser(null)
            clearMember()
            lastUserId.current = null
          }
        } catch {
          // Local session is enough to keep the UI responsive.
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        setSession(null)
        setUser(null)
        clearMember()
      } finally {
        setLoading(false)
        if (loadingTimeoutRef.current) {
          window.clearTimeout(loadingTimeoutRef.current)
          loadingTimeoutRef.current = null
        }
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, newSession: Session | null) => {
      const eventName = event as string
      if (event === 'SIGNED_OUT' || eventName === 'TOKEN_REFRESH_REVOKED') {
        setSession(null)
        setUser(null)
        clearMember()
        lastUserId.current = null
        setLoading(false)
        return
      }

      if (newSession?.user?.id !== lastUserId.current) {
        setSession(newSession)
        setUser(newSession?.user ?? null)
        lastUserId.current = newSession?.user?.id ?? null
        await loadMember(newSession?.user ?? null)
      }

      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
      if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current)
    }
  }, [supabase])

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setRole(null)
    setMemberId(null)
    setTeamId(null)
    setTeamSlug(null)
    setTeamName(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        memberId,
        teamId,
        teamSlug,
        teamName,
        loading,
        authConfigured: Boolean(supabase),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
