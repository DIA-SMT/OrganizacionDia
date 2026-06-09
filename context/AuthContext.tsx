'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type { TeamRole } from '@/types/domain'

type MemberLookup = {
  id: string
  role: string
}

type AuthContextType = {
  user: User | null
  session: Session | null
  role: TeamRole | null
  memberId: string | null
  loading: boolean
  authConfigured: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  memberId: null,
  loading: true,
  authConfigured: false,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<TeamRole | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!supabase) {
      return
    }

    loadingTimeoutRef.current = window.setTimeout(() => setLoading(false), 8000)

    async function loadMember(currentUser: User | null) {
      if (!supabase || !currentUser) {
        setRole(null)
        setMemberId(null)
        return
      }

      let member: MemberLookup | null = null

      const { data: byAuthUser } = await supabase
        .from('members')
        .select('id, role')
        .eq('auth_user_id', currentUser.id)
        .eq('active', true)
        .maybeSingle()

      member = byAuthUser as MemberLookup | null

      const userEmail = currentUser.email?.trim()

      if (!member && userEmail) {
        const { data: byEmail } = await supabase
          .from('members')
          .select('id, role')
          .ilike('email', userEmail)
          .eq('active', true)
          .maybeSingle()

        member = byEmail as MemberLookup | null
      }

      if (!member) {
        setRole('Viewer')
        setMemberId(null)
        return
      }

      setRole(normalizeRole(member.role))
      setMemberId(member.id)
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
          } else if (res.status === 401) {
            setSession(null)
            setUser(null)
            setRole(null)
            setMemberId(null)
            lastUserId.current = null
          }
        } catch {
          // Local session is enough to keep the UI responsive.
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        setSession(null)
        setUser(null)
        setRole(null)
        setMemberId(null)
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
        setRole(null)
        setMemberId(null)
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
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        memberId,
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
