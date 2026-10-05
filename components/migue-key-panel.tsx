'use client'

import { Check, Copy, KeyRound, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

const CODE = 'rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200'

// Genera la clave de un Migue y la muestra una sola vez, lista para pasarle al equipo del bot.
// hasKey: ya tiene una; generar otra la reemplaza y la anterior deja de funcionar.
export function MigueKeyPanel({ slug, projectName, hasKey, onCreated }: { slug: string; projectName: string; hasKey: boolean; onCreated?: () => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/migue/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string }
      if (!response.ok || !body.token) throw new Error(body.error ?? 'No se pudo generar la clave.')
      setToken(body.token)
      setConfirming(false)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la clave.')
    } finally {
      setBusy(false)
    }
  }

  const envText = token ? `MIGUE_API_KEY=${token}\nMIGUE_DASHBOARD_URL=${window.location.origin}` : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(envText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('No se pudo copiar: seleccionalo y copialo a mano.')
    }
  }

  if (token) {
    return (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Copiala ahora: la clave no se vuelve a mostrar. Pasasela por privado al equipo de {projectName}, nunca en un chat grupal ni en un commit.
        </p>
        <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-xs font-semibold">Variables del bot (entorno de produccion)</span>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => void copy()}
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre className="overflow-x-auto px-3 py-2 font-mono text-xs text-slate-800 dark:text-slate-100">{envText}</pre>
        </div>
        <p>
          El equipo del bot sigue la guia <code className={CODE}>docs/migue-conexion.md</code>: con la primera conversacion que llegue aparecen aca sus numeros.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
      <p>
        {hasKey
          ? 'Este Migue ya tiene clave. Si se perdio, genera una nueva: la anterior deja de funcionar en el momento.'
          : `La clave identifica a este Migue cuando le manda sus conversaciones al dashboard. Se genera una vez y se le pasa al equipo de ${projectName}.`}
      </p>
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</p>}
      {hasKey && confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-950 dark:text-white">El bot va a dejar de reportar hasta que cargue la clave nueva.</span>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60" disabled={busy} onClick={() => void generate()}>
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            Reemplazar la clave
          </button>
          <button type="button" className="h-9 rounded-md border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md dia-primary-bg px-3 text-sm font-semibold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => (hasKey ? setConfirming(true) : void generate())}
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
          {hasKey ? 'Generar una clave nueva' : 'Generar la clave'}
        </button>
      )}
    </div>
  )
}
