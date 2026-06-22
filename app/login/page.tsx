'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ArrowRight, Code2, Loader2 } from 'lucide-react'
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
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f6] px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-[#1677f2]" />
      </section>
    </main>
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
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f6] px-4">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:grid-cols-[1fr_0.85fr]">
        <div className="hidden bg-[#103b3a] p-10 text-white md:block">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white/10">
            <Code2 className="h-6 w-6" />
          </div>
          <h1 className="mt-10 text-3xl font-bold">Organizacion DIA</h1>
          <p className="mt-3 text-sm leading-6 text-blue-50/80">
            Gestion interna para proyectos de programacion, revision, testing y entregas del equipo.
          </p>
        </div>

        <form onSubmit={handleLogin} className="p-8 md:p-10">
          <p className="text-xs font-semibold uppercase text-[#1769e0]">Acceso interno</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">Iniciar sesion</h2>
          <p className="mt-2 text-sm text-slate-500">Ingresa tus credenciales para entrar al dashboard.</p>

          {error && <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Correo electronico</span>
              <input
                className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#1677f2] focus:ring-2 focus:ring-blue-100"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@municipio.gob.ar"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Contrasena</span>
              <input
                className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#1677f2] focus:ring-2 focus:ring-blue-100"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>

          <button
            className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1677f2] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? 'Conectando...' : 'Ingresar'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/forgot-password')}
            className="mt-4 w-full text-center text-sm font-medium text-[#1769e0]"
          >
            Olvide mi contrasena
          </button>
        </form>
      </section>
    </main>
  )
}
