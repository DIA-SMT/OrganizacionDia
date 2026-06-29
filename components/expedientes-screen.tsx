'use client'

import { AppShell } from '@/components/app-shell'
import { expedientePriorityWeight, formatExpedienteDate, type ExpedienteRow } from '@/lib/expedientes'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Archive, ArrowLeft, ExternalLink, FileText, RefreshCw, ScanText } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const filterStatusOptions = ['Todos', 'Nuevo', 'Leído', 'En revisión']
const editableStatusOptions = ['Nuevo', 'Leído', 'En revisión', 'Archivado']
const priorityOptions = ['Alta', 'Media', 'Baja']

function statusClass(status: string) {
  if (status === 'Nuevo') return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
  if (status === 'En revisión') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  if (status === 'Archivado') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
  return 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700'
}

function priorityClass(priority: string) {
  if (priority === 'Alta') return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'
  if (priority === 'Media') return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
}

function dateAgeStyle(value: string, newestTime: number, oldestTime: number) {
  const time = new Date(value).getTime()
  const range = Math.max(1, newestTime - oldestTime)
  const ageRatio = Math.min(1, Math.max(0, (newestTime - time) / range))
  const hue = Math.round(140 * (1 - ageRatio))

  return {
    color: `hsl(${hue} 72% 32%)`,
    backgroundColor: `hsl(${hue} 82% 94%)`,
    borderColor: `hsl(${hue} 68% 78%)`,
  }
}

export function ExpedientesScreen({ archivedOnly = false }: { archivedOnly?: boolean }) {
  const [expedientes, setExpedientes] = useState<ExpedienteRow[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [generatingBriefId, setGeneratingBriefId] = useState<string | null>(null)
  const syncInProgressRef = useRef(false)

  const fetchExpedientes = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    setLoading(true)
    let query = supabase
      .from('expedientes')
      .select('id, drive_file_id, name, summary, drive_url, mime_type, size_bytes, drive_created_at, drive_modified_at, detected_at, status, priority, brief_generated_at, brief_error, created_at, updated_at')
      .order('drive_created_at', { ascending: false })

    query = archivedOnly ? query.eq('status', 'Archivado') : query.neq('status', 'Archivado')
    const { data } = await query

    setExpedientes((data ?? []) as ExpedienteRow[])
    setLoading(false)
  }, [archivedOnly])

  useEffect(() => {
    void Promise.resolve().then(fetchExpedientes)
  }, [fetchExpedientes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expedientes
      .filter((expediente) => {
        const matchesStatus = status === 'Todos' || expediente.status === status
        const matchesSearch = !q || [expediente.name, expediente.summary, expediente.status, expediente.priority].join(' ').toLowerCase().includes(q)
        return matchesStatus && matchesSearch
      })
      .sort((a, b) => {
        const priorityDiff = expedientePriorityWeight(b.priority) - expedientePriorityWeight(a.priority)
        if (priorityDiff !== 0) return priorityDiff
        return new Date(b.drive_created_at).getTime() - new Date(a.drive_created_at).getTime()
      })
  }, [expedientes, search, status])

  const dateRange = useMemo(() => {
    const times = expedientes.map((item) => new Date(item.drive_created_at).getTime()).filter(Number.isFinite)
    return {
      newest: times.length > 0 ? Math.max(...times) : 0,
      oldest: times.length > 0 ? Math.min(...times) : 0,
    }
  }, [expedientes])

  const syncDrive = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (syncInProgressRef.current) return
    syncInProgressRef.current = true
    setSyncing(true)
    if (!silent) setMessage(null)

    try {
      const response = await fetch('/api/drive/expedientes/sync', { method: 'POST' })
      const contentType = response.headers.get('content-type') ?? ''
      const payload = contentType.includes('application/json')
        ? ((await response.json()) as { synced?: number; error?: string })
        : { error: await response.text() }
      if (!response.ok) throw new Error(payload.error || 'No se pudo sincronizar Drive.')

      setLastSyncAt(new Date().toISOString())
      if (!silent) setMessage(`${payload.synced ?? 0} expedientes sincronizados desde Drive.`)
      await fetchExpedientes()
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : 'No se pudo sincronizar Drive.')
    } finally {
      setSyncing(false)
      syncInProgressRef.current = false
    }
  }, [fetchExpedientes])

  useEffect(() => {
    if (archivedOnly) return

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncDrive({ silent: true })
      }
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [archivedOnly, syncDrive])

  async function updateStatus(expedienteId: string, nextStatus: string) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setExpedientes((current) => current.map((item) => (item.id === expedienteId ? { ...item, status: nextStatus } : item)))
    const { error } = await supabase.from('expedientes').update({ status: nextStatus }).eq('id', expedienteId)
    if (!error && (nextStatus === 'Archivado') !== archivedOnly) {
      setExpedientes((current) => current.filter((item) => item.id !== expedienteId))
    }
  }

  async function updatePriority(expedienteId: string, nextPriority: string) {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setExpedientes((current) => current.map((item) => (item.id === expedienteId ? { ...item, priority: nextPriority } : item)))
    await supabase.from('expedientes').update({ priority: nextPriority }).eq('id', expedienteId)
  }

  async function generateBrief(expedienteId: string) {
    if (generatingBriefId) return
    setGeneratingBriefId(expedienteId)
    setMessage(null)

    try {
      const response = await fetch(`/api/drive/expedientes/${expedienteId}/brief`, { method: 'POST' })
      const payload = (await response.json()) as {
        expediente?: Pick<ExpedienteRow, 'id' | 'summary' | 'brief_generated_at' | 'brief_error'>
        suggestedPriority?: string
        pagesProcessed?: number
        error?: string
      }
      if (!response.ok || !payload.expediente) throw new Error(payload.error || 'No se pudo generar el brief.')

      setExpedientes((current) =>
        current.map((item) => (item.id === expedienteId ? { ...item, ...payload.expediente } : item)),
      )
      setMessage(`Brief guardado en el expediente. OCR aplicado sobre ${payload.pagesProcessed ?? 0} paginas. Prioridad sugerida: ${payload.suggestedPriority ?? 'Media'}.`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'No se pudo generar el brief.'
      setMessage(errorMessage)
      setExpedientes((current) =>
        current.map((item) => (item.id === expedienteId ? { ...item, brief_error: errorMessage } : item)),
      )
    } finally {
      setGeneratingBriefId(null)
    }
  }

  return (
    <AppShell
      title={archivedOnly ? 'Expedientes archivados' : 'Expedientes'}
      subtitle={archivedOnly ? 'Documentos retirados de la bandeja activa' : 'PDFs detectados desde la carpeta de Drive'}
      search={search}
      onSearchChange={setSearch}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{filtered.length} expedientes visibles</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {archivedOnly
              ? 'Los expedientes vuelven a la bandeja activa al cambiar su estado.'
              : `Sincronizacion automatica cada 1 minuto${lastSyncAt ? ` - ultima: ${formatExpedienteDate(lastSyncAt)}` : ''}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={archivedOnly ? '/expedientes' : '/expedientes/archivados'}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {archivedOnly ? <ArrowLeft className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {archivedOnly ? 'Volver a expedientes' : 'Archivados'}
          </Link>
          {!archivedOnly && (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md dia-primary-bg px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              disabled={syncing}
              onClick={() => void syncDrive()}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
            </button>
          )}
        </div>
      </div>

      {!archivedOnly && (
        <div className="mb-4 flex flex-wrap gap-2">
          {filterStatusOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                status === option
                  ? 'border-blue-200 dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              onClick={() => setStatus(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200">
          {message}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Cargando expedientes...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">No hay expedientes para mostrar.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((expediente) => (
            <article key={expediente.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 dia-primary-text dark:text-blue-300" />
                    <h2 className="truncate text-base font-bold text-slate-950 dark:text-white">{expediente.name}</h2>
                  </div>
                  <p
                    className="mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
                    style={dateAgeStyle(expediente.drive_created_at, dateRange.newest, dateRange.oldest)}
                    title="Los expedientes mas nuevos aparecen en verde y los mas antiguos se acercan gradualmente al rojo."
                  >
                    Creado en Drive: {formatExpedienteDate(expediente.drive_created_at)}
                  </p>
                  <p className={`mt-1 text-xs ${expediente.brief_error ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
                    {expediente.brief_error
                      ? `Brief OCR pendiente: ${expediente.brief_error}`
                      : expediente.brief_generated_at
                        ? `Brief OCR guardado: ${formatExpedienteDate(expediente.brief_generated_at)}`
                        : 'Brief OCR pendiente'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${priorityClass(expediente.priority)}`}>{expediente.priority}</span>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass(expediente.status)}`}>{expediente.status}</span>
                </div>
              </div>

              {expediente.brief_generated_at && expediente.summary ? (
                <p className="mt-4 line-clamp-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{expediente.summary}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                    value={expediente.priority}
                    onChange={(event) => void updatePriority(expediente.id, event.target.value)}
                    title="Prioridad"
                  >
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                    value={expediente.status}
                    onChange={(event) => void updateStatus(expediente.id, event.target.value)}
                    title="Estado"
                  >
                    {editableStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md dia-primary-bg px-3 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={generatingBriefId === expediente.id}
                    onClick={() => void generateBrief(expediente.id)}
                  >
                    <ScanText className={`h-4 w-4 ${generatingBriefId === expediente.id ? 'animate-pulse' : ''}`} />
                    {generatingBriefId === expediente.id
                      ? 'Analizando...'
                      : expediente.brief_generated_at || expediente.brief_error
                        ? 'Regenerar brief'
                        : 'Generar brief'}
                  </button>
                </div>
                <a className="inline-flex items-center gap-1.5 text-sm font-semibold dia-primary-text hover:underline dark:text-blue-300" href={expediente.drive_url} target="_blank" rel="noreferrer">
                  Ver en Drive
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  )
}
