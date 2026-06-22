'use client'

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
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Recuperar contrasena</h1>
        <p className="mt-2 text-sm text-slate-500">Te enviaremos un enlace para crear una nueva contrasena.</p>
        {success && (
          <div className="mt-5 flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <CheckCircle2 className="h-4 w-4" />
            Correo enviado. Revisa tu bandeja de entrada.
          </div>
        )}
        {error && <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <label className="mt-6 block">
          <span className="text-sm font-medium text-slate-700">Correo electronico</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#1677f2] focus:ring-2 focus:ring-blue-100"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1677f2] text-sm font-semibold text-white" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar enlace
        </button>
        <button type="button" onClick={() => router.push('/login')} className="mt-4 flex w-full items-center justify-center gap-2 text-sm font-medium text-slate-500">
          <ArrowLeft className="h-4 w-4" />
          Volver al login
        </button>
      </form>
    </main>
  )
}
