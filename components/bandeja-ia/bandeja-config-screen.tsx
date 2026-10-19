'use client'

import { BandejaShell, useBandeja } from '@/components/bandeja-ia/bandeja-shell'
import { PriorityBadge, SectionCard, secondaryButtonClass } from '@/components/bandeja-ia/bandeja-ui'
import { canAdminister } from '@/lib/bandeja-ia/access'
import { saveRule } from '@/lib/bandeja-ia/repository'
import { CATEGORY_LABELS } from '@/lib/bandeja-ia/rules'
import { refreshBandeja, runBandejaAction } from '@/lib/bandeja-ia/store'
import { formatBandejaDateTime } from '@/lib/bandeja-ia/time'
import { BellOff, CheckCircle2, CircleDashed, ListFilter, Lock, MailX, RefreshCw, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

type GmailStatus = {
  flagEnabled: boolean
  configured: Record<string, boolean>
  missing: string[]
  exposedPublicVars: string[]
  alertsFlag: boolean
  telegramFlag: boolean
  ready: boolean
  serviceAccountConfigured: boolean
  sync: {
    status: string
    watch_expiration: string | null
    needs_full_sync: boolean
    consecutive_failures: number
    next_retry_at: string | null
    last_sync_at: string | null
    last_full_sync_at: string | null
    last_error: string | null
  } | null
  runs: {
    kind: string
    trigger: string
    status: string
    messages_found: number
    messages_stored: number
    error: string | null
    started_at: string
  }[]
}

type SyncResponse = {
  ok: boolean
  skipped?: boolean
  reason?: string
  kind?: string
  found?: number
  stored?: number
  createdAsuntos?: number
  partial?: boolean
  error?: string | null
  warnings?: string[]
}

const SYNC_STATUS_LABELS: Record<string, string> = {
  desconectado: 'Sin conectar',
  sincronizando: 'Sincronizando',
  ok: 'Funcionando',
  error: 'Con errores (se reintenta solo)',
  reconectar: 'Hay que volver a autorizar la casilla',
}

const TRIGGER_LABELS: Record<string, string> = { pubsub: 'aviso de Gmail', cron: 'cron', manual: 'manual' }

function useGmailStatus() {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/bandeja-ia/gmail/status', { cache: 'no-store' })
        if (!response.ok) throw new Error()
        const payload = (await response.json()) as GmailStatus
        if (!cancelled) {
          setStatus(payload)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [version])

  return { status, error, reload: () => setVersion((current) => current + 1) }
}

function GmailSection({ admin }: { admin: boolean }) {
  const { data } = useBandeja()
  const { status, error, reload } = useGmailStatus()
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function syncNow() {
    setSyncing(true)
    setResult(null)
    try {
      const response = await fetch('/api/bandeja-ia/gmail/cron', { method: 'POST', cache: 'no-store' })
      const payload = (await response.json()) as SyncResponse & { error?: string }
      if (payload.skipped) setResult({ ok: false, text: payload.reason ?? 'La integración está deshabilitada.' })
      else if (!payload.ok) setResult({ ok: false, text: payload.error ?? 'La sincronización falló.' })
      else if (payload.kind === 'esperar') setResult({ ok: true, text: 'Hay un reintento programado; probá de nuevo en unos minutos.' })
      else {
        const parts = [`${payload.stored ?? 0} correos nuevos`, `${payload.createdAsuntos ?? 0} asuntos creados`]
        if (payload.partial) parts.push('quedaron correos para la próxima corrida')
        setResult({ ok: true, text: `Sincronización ${payload.kind === 'inicial' ? 'inicial' : 'incremental'}: ${parts.join(', ')}.${payload.warnings?.length ? ` ${payload.warnings.join(' ')}` : ''}` })
      }
    } catch {
      setResult({ ok: false, text: 'No se pudo contactar al servidor.' })
    } finally {
      setSyncing(false)
      reload()
      void refreshBandeja()
    }
  }

  const sync = status?.sync ?? null

  return (
    <SectionCard
      title="Integración con Gmail"
      icon={MailX}
      description={status?.ready ? 'Solo lectura sobre la casilla institucional.' : 'Se activa con BANDEJA_IA_GMAIL_ENABLED=true y todas las variables cargadas.'}
    >
      <div className="space-y-4 px-5 py-4">
        {error && <p className="text-sm text-red-600 dark:text-red-300">No se pudo leer el estado de la integración.</p>}
        {!status && !error && <p className="text-sm text-slate-500 dark:text-slate-400">Consultando estado...</p>}
        <ul className="space-y-2">
          {status && <Flag on={status.flagEnabled} label="Interruptor del servidor BANDEJA_IA_GMAIL_ENABLED" />}
          <Flag on={data.settings.gmailEnabled} label={data.settings.mailboxAddress ? `Casilla conectada: ${data.settings.mailboxAddress}` : 'Casilla conectada'} />
        </ul>

        {status && status.exposedPublicVars.length > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Hay variables expuestas al navegador: {status.exposedPublicVars.join(', ')}. Quitales el prefijo NEXT_PUBLIC_.
          </p>
        )}

        {sync && (
          <dl className="grid gap-x-4 gap-y-2 rounded-md bg-slate-50 px-3 py-3 text-xs sm:grid-cols-2 dark:bg-slate-950/60">
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Estado</dt>
              <dd className={`font-semibold ${sync.status === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : sync.status === 'reconectar' || sync.status === 'error' ? 'text-red-600 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'}`}>
                {SYNC_STATUS_LABELS[sync.status] ?? sync.status}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Última sincronización</dt>
              <dd className="text-slate-700 dark:text-slate-200">{formatBandejaDateTime(sync.last_sync_at)}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Aviso de Gmail vence</dt>
              <dd className="text-slate-700 dark:text-slate-200">{formatBandejaDateTime(sync.watch_expiration)}</dd>
            </div>
            <div>
              <dt className="font-semibold uppercase tracking-wide text-slate-400">Fallas seguidas</dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {sync.consecutive_failures}
                {sync.next_retry_at ? ` · reintenta ${formatBandejaDateTime(sync.next_retry_at)}` : ''}
              </dd>
            </div>
            {sync.last_error && (
              <div className="sm:col-span-2">
                <dt className="font-semibold uppercase tracking-wide text-slate-400">Último aviso</dt>
                <dd className="text-amber-700 dark:text-amber-300">{sync.last_error}</dd>
              </div>
            )}
          </dl>
        )}

        {status && status.runs.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Últimas corridas</p>
            <ul className="space-y-1 text-xs">
              {status.runs.map((run) => (
                <li key={run.started_at} className="flex flex-wrap justify-between gap-2 text-slate-600 dark:text-slate-300">
                  <span>
                    {formatBandejaDateTime(run.started_at)} · {run.kind} · {TRIGGER_LABELS[run.trigger] ?? run.trigger}
                  </span>
                  <span className={run.status === 'error' ? 'text-red-600 dark:text-red-300' : ''}>
                    {run.status === 'error' ? run.error ?? 'error' : `${run.messages_stored} nuevos`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Variables del servidor</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {[...Object.entries(status.configured), ['BANDEJA_IA_PUBSUB_SERVICE_ACCOUNT (recomendada)', status.serviceAccountConfigured] as const].map(([name, ok]) => (
                <li key={name} className="flex min-w-0 items-center gap-1.5 text-xs">
                  {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <CircleDashed className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                  <code className="truncate text-slate-600 dark:text-slate-300">{name}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result && (
          <p
            className={`rounded-md px-3 py-2 text-sm ${
              result.ok ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200'
            }`}
            role="status"
          >
            {result.text}
          </p>
        )}

        {admin && (
          <button type="button" className={`${secondaryButtonClass} w-full`} disabled={syncing || !status?.ready} onClick={() => void syncNow()} title={status?.ready ? undefined : 'Falta habilitar la integración'}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        )}

        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
          <li>OAuth 2.0 de solo lectura sobre una única casilla institucional.</li>
          <li>Tokens y secretos solo en el servidor; nunca en el navegador.</li>
          <li>Sin respuestas automáticas, sin borrar ni modificar correos.</li>
        </ul>
      </div>
    </SectionCard>
  )
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span
        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
          on ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {on ? 'Encendido' : 'Apagado'}
      </span>
    </li>
  )
}

function ReclassifyButton({ onDone }: { onDone: (text: string, ok: boolean) => void }) {
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      const response = await fetch('/api/bandeja-ia/reclasificar', { method: 'POST', cache: 'no-store' })
      const payload = (await response.json()) as { ok?: boolean; reviewed?: number; updated?: number; failed?: number; basesPorPausarse?: number; posiblesEventos?: number; error?: string }
      if (!response.ok && response.status !== 207) {
        onDone(payload.error ?? 'No se pudo reclasificar.', false)
      } else {
        const parts = [`${payload.updated ?? 0} de ${payload.reviewed ?? 0} asuntos actualizados`]
        if (payload.basesPorPausarse) parts.push(`${payload.basesPorPausarse} avisos de Supabase`)
        if (payload.posiblesEventos) parts.push(`${payload.posiblesEventos} posibles eventos`)
        if (payload.failed) parts.push(`${payload.failed} no se pudieron guardar`)
        onDone(`Reclasificación: ${parts.join(', ')}.`, !payload.failed)
      }
    } catch {
      onDone('No se pudo contactar al servidor.', false)
    } finally {
      setRunning(false)
      void refreshBandeja()
    }
  }

  return (
    <button type="button" className={secondaryButtonClass} disabled={running} onClick={() => void run()}>
      <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
      {running ? 'Reclasificando...' : 'Reclasificar asuntos'}
    </button>
  )
}

type RunAction = (action: () => Promise<unknown>, success: string) => Promise<boolean>

function ConfigContent() {
  const { data, role } = useBandeja()
  const admin = canAdminister(role)
  const { status } = useGmailStatus()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const runAction: RunAction = async (action, success) => {
    setBusy(true)
    const failure = await runBandejaAction(action)
    setBusy(false)
    setFeedback(failure ? { ok: false, text: failure } : { ok: true, text: success })
    return !failure
  }

  return (
    <div className="space-y-5">
      {!admin && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Lock className="h-4 w-4 shrink-0" />
          Solo quien tiene rol de Administración en Bandeja IA puede cambiar esta configuración.
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.ok
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
          }`}
          role="status"
        >
          {feedback.text}
        </div>
      )}

      <SectionCard title="Reglas de clasificación" icon={ListFilter} description="Se aplican sobre remitente, asunto y extracto. No leen cuerpos ni adjuntos y no usan IA externa.">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.rules.map((rule, index) => (
            <li key={rule.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{rule.name}</span>
                  {rule.priority && <PriorityBadge priority={rule.priority} />}
                  {rule.category && <span className="text-xs text-slate-500 dark:text-slate-400">→ {CATEGORY_LABELS[rule.category]}</span>}
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{rule.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {rule.keywords.map((keyword) => (
                    <span key={keyword} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              <label className={`flex items-center gap-2 text-sm font-semibold ${admin ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} text-slate-600 dark:text-slate-300`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={rule.active}
                  disabled={!admin || busy}
                  onChange={() =>
                    void runAction(() => saveRule({ ...rule, active: !rule.active }, index), `Regla "${rule.name}" ${rule.active ? 'desactivada' : 'activada'}.`)
                  }
                />
                {rule.active ? 'Activa' : 'Inactiva'}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <p className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
            Los cambios se aplican solos a los correos nuevos. Para aplicarlos a los asuntos que ya existen, usá “Reclasificar”: cambia la categoría de
            todos y la prioridad solo de los que nadie confirmó a mano.
          </p>
          {admin && <ReclassifyButton onDone={(text, ok) => setFeedback({ ok, text })} />}
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <GmailSection admin={admin} />

        <SectionCard title="Notificaciones" icon={BellOff} description="No se envía ninguna alerta real hasta habilitarlas de forma explícita.">
          <div className="space-y-4 px-5 py-4">
            <ul className="space-y-2">
              <Flag on={data.settings.alertsEnabled && Boolean(status?.alertsFlag)} label="Alertas en el Dashboard" />
              <Flag on={data.settings.telegramEnabled && Boolean(status?.telegramFlag)} label="Telegram (integración futura)" />
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Las alertas solo dicen prioridad y categoría, con un enlace al Dashboard. Nunca incluyen remitente, asunto ni contenido del correo. Se
              alertan los asuntos críticos y altos y los vencimientos próximos (hora de Tucumán).
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

export function BandejaConfigScreen() {
  return (
    <BandejaShell title="Configuración de Bandeja IA" subtitle="Reglas de clasificación e integración">
      <ConfigContent />
    </BandejaShell>
  )
}
