'use client'

import { AUTH_INPUT_CLASS, AUTH_LINK_BUTTON_CLASS, AUTH_PRIMARY_BUTTON_CLASS, AuthLayout } from '@/components/auth-layout'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!supabase) {
      setError('Falta configurar .env.local con Supabase.')
      return
    }

    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/api/auth/callback?next=/reset-password`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (resetError) throw resetError
      setSuccess(true)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit}>
        <h2 className="text-[26px] font-bold text-[var(--brand-navy)]">Recuperar contraseña</h2>
        <p className="mt-1.5 text-sm text-slate-500">Te enviamos un enlace para crear una nueva contraseña.</p>
        {success && (
          <div className="mt-5 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Correo enviado. Revisá tu bandeja de entrada.
          </div>
        )}
        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
        <label className="mt-6 block">
          <span className="text-[13px] font-semibold text-[#2f4566]">Correo electrónico</span>
          <input className={AUTH_INPUT_CLASS} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className={`mt-6 ${AUTH_PRIMARY_BUTTON_CLASS}`} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar enlace
        </button>
        <button type="button" onClick={() => router.push('/login')} className={`mt-3 ${AUTH_LINK_BUTTON_CLASS}`}>
          <ArrowLeft className="h-4 w-4" />
          Volver al login
        </button>
      </form>
    </AuthLayout>
  )
}
