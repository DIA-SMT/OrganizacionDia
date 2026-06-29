'use client'

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
    <main className="flex min-h-screen items-center justify-center dia-bg px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Nueva contrasena</h1>
        <p className="mt-2 text-sm text-slate-500">Define una nueva contrasena para tu cuenta.</p>
        {!validSession && <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">No hay una sesion de recuperacion valida.</div>}
        {success && (
          <div className="mt-5 flex gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <CheckCircle2 className="h-4 w-4" />
            Contrasena actualizada. Redirigiendo...
          </div>
        )}
        {error && <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-6 space-y-4">
          <input className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" type="password" placeholder="Nueva contrasena" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <input className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" type="password" placeholder="Confirmar contrasena" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </div>
        <button className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md dia-primary-bg text-sm font-semibold text-white disabled:opacity-60" disabled={loading || !validSession}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Restablecer
        </button>
      </form>
    </main>
  )
}
