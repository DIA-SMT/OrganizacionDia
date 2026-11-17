'use client'

import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BUTTON_CLASS, AuthLayout } from '@/components/auth-layout'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [validSession, setValidSession] = useState<boolean | null>(null)
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    async function checkSession() {
      if (!supabase) {
        setValidSession(false)
        return
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setValidSession(Boolean(session))
    }
    checkSession()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!supabase) {
      setError('Falta configurar Supabase.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden')
      return
    }

    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
      window.setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contrasena')
    } finally {
      setLoading(false)
    }
  }

  if (validSession === null) {
    return (
      <main className="flex min-h-screen items-center justify-center dia-bg">
        <Loader2 className="h-6 w-6 animate-spin dia-primary-text" />
      </main>
    )
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h2 className="text-[26px] font-bold text-[var(--brand-navy)]">Nueva contraseña</h2>
        <p className="mt-1.5 text-sm text-slate-500">Definí una nueva contraseña para tu cuenta.</p>
        {!validSession && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">No hay una sesión de recuperación válida.</div>}
        {success && (
          <div className="mt-5 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Contraseña actualizada. Redirigiendo...
          </div>
        )}
        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-[#2f4566]">Nueva contraseña</span>
            <input className={AUTH_INPUT_CLASS} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-[#2f4566]">Confirmar contraseña</span>
            <input className={AUTH_INPUT_CLASS} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </label>
        </div>
        <button className={`mt-6 ${AUTH_PRIMARY_BUTTON_CLASS}`} disabled={loading || !validSession}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Restablecer
        </button>
      </form>
    </AuthLayout>
  )
}
