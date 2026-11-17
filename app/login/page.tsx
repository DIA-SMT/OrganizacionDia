'use client'

import { AUTH_INPUT_CLASS, AUTH_LINK_BUTTON_CLASS, AUTH_PRIMARY_BUTTON_CLASS, AuthLayout } from '@/components/auth-layout'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ArrowRight, Loader2, LogIn } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginShell() {
  return (
    <AuthLayout>
      <Loader2 className="mx-auto h-6 w-6 animate-spin dia-primary-text" />
    </AuthLayout>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    const code = searchParams.get('code')
    const type = searchParams.get('type')
    const nextParam = searchParams.get('next')

    if (code) {
      const callbackUrl = new URL('/api/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('code', code)
      callbackUrl.searchParams.set('next', nextParam || (type === 'recovery' || !type ? '/reset-password' : '/'))
      if (type) callbackUrl.searchParams.set('type', type)
      router.replace(callbackUrl.pathname + callbackUrl.search)
    }
  }, [router, searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!supabase) {
      setError('Falta configurar .env.local con las claves de Supabase del proyecto Organizacion DIA.')
      return
    }

    setLoading(true)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) throw loginError
      router.refresh()
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleLogin}>
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--tint-blue)] text-[var(--brand-blue)]" aria-hidden="true">
          <LogIn className="h-5 w-5" />
        </span>
        <h2 className="mt-5 text-[26px] font-bold text-[var(--brand-navy)]">Iniciar sesión</h2>
        <p className="mt-1.5 text-sm text-slate-500">Ingresá tus credenciales para entrar al dashboard.</p>

        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-[#2f4566]">Correo electrónico</span>
            <input
              className={AUTH_INPUT_CLASS}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dev@municipio.gob.ar"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-[#2f4566]">Contraseña</span>
            <input
              className={AUTH_INPUT_CLASS}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        <button className={`mt-6 ${AUTH_PRIMARY_BUTTON_CLASS}`} type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {loading ? 'Conectando...' : 'Ingresar'}
        </button>

        <button type="button" onClick={() => router.push('/forgot-password')} className={`mt-3 ${AUTH_LINK_BUTTON_CLASS}`}>
          Olvidé mi contraseña
        </button>
      </form>
    </AuthLayout>
  )
}
