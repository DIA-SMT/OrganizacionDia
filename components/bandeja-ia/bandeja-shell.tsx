'use client'

import { AppShell } from '@/components/app-shell'
import { cardClass, secondaryButtonClass } from '@/components/bandeja-ia/bandeja-ui'
import { useBandejaAccess } from '@/components/bandeja-ia/use-bandeja-access'
import type { BandejaAccessDeniedReason, BandejaAccessSource } from '@/lib/bandeja-ia/access'
import type { BandejaData } from '@/lib/bandeja-ia/repository'
import { refreshBandeja, useBandejaStore } from '@/lib/bandeja-ia/store'
import type { BandejaRole } from '@/lib/bandeja-ia/types'
import { History, Inbox, LayoutGrid, MailX, RefreshCw, Settings, ShieldX, TriangleAlert, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext } from 'react'

export type BandejaActor = { id: string; name: string; role: BandejaRole }

type BandejaContextValue = { role: BandejaRole; actor: BandejaActor; source: BandejaAccessSource; data: BandejaData }

const BandejaContext = createContext<BandejaContextValue | null>(null)

// Solo se usa dentro de BandejaShell, que renderiza el contenido cuando hay permiso y datos.
export function useBandeja(): BandejaContextValue {
  const value = useContext(BandejaContext)
  if (!value) throw new Error('useBandeja se usa dentro de BandejaShell')
  return value
}

const TABS: { href: string; label: string; icon: LucideIcon; match: (pathname: string) => boolean }[] = [
  { href: '/bandeja-ia', label: 'Panel', icon: LayoutGrid, match: (pathname) => pathname === '/bandeja-ia' },
  {
    href: '/bandeja-ia/bandeja',
    label: 'Bandeja',
    icon: Inbox,
    match: (pathname) => pathname.startsWith('/bandeja-ia/bandeja') || pathname.startsWith('/bandeja-ia/asunto'),
  },
  { href: '/bandeja-ia/historial', label: 'Historial', icon: History, match: (pathname) => pathname.startsWith('/bandeja-ia/historial') },
  { href: '/bandeja-ia/configuracion', label: 'Configuración', icon: Settings, match: (pathname) => pathname.startsWith('/bandeja-ia/configuracion') },
]

const DENIED_MESSAGES: Record<BandejaAccessDeniedReason, string> = {
  'sin-sesion': 'Tu sesión venció. Volvé a iniciar sesión.',
  equipo: 'Bandeja IA es un módulo interno de la Dirección de Inteligencia Artificial.',
  'sin-permiso': 'Tu usuario no tiene una autorización específica para Bandeja IA. Pedísela a quien administra el módulo.',
  'sin-configuracion': 'Supabase no está configurado en este entorno.',
  error: 'No se pudieron verificar los permisos. Probá de nuevo en unos minutos.',
}

function ModuleTabs() {
  const pathname = usePathname()
  return (
    <nav className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Secciones de Bandeja IA">
      {TABS.map((tab) => {
        const active = tab.match(pathname)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
              active
                ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

function StatusBar({ gmailEnabled, refreshing }: { gmailEnabled: boolean; refreshing: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-start gap-3">
        <MailX className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {gmailEnabled ? 'Gmail conectado' : 'Gmail todavía no está conectado'}
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            {gmailEnabled
              ? 'Los asuntos llegan desde la casilla institucional.'
              : 'La bandeja se va a completar cuando se autorice y habilite la integración.'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Fechas y horarios en hora de Tucumán.</p>
        </div>
      </div>
      <button type="button" className={secondaryButtonClass} onClick={() => void refreshBandeja()} disabled={refreshing}>
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        Actualizar
      </button>
    </div>
  )
}

export function BandejaShell({
  title,
  subtitle,
  search,
  onSearchChange,
  children,
}: {
  title: string
  subtitle: string
  search?: string
  onSearchChange?: (value: string) => void
  children: React.ReactNode
}) {
  const access = useBandejaAccess()
  const store = useBandejaStore(access.status === 'allowed' ? access.actorId : null)

  if (access.status !== 'allowed') {
    return (
      <AppShell title="Bandeja IA" subtitle="Correo institucional: alertas, responsables y seguimiento">
        {access.status === 'loading' ? (
          <div className={`${cardClass} p-6 text-sm text-slate-500 dark:text-slate-400`}>Verificando permisos de Bandeja IA...</div>
        ) : (
          <div className={`${cardClass} mx-auto max-w-xl p-6 text-center`}>
            <ShieldX className="mx-auto h-10 w-10 text-red-500" />
            <h2 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Acceso denegado</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{DENIED_MESSAGES[access.reason]}</p>
            <Link href="/" className={`${secondaryButtonClass} mt-4`}>
              Volver al Dashboard
            </Link>
          </div>
        )}
      </AppShell>
    )
  }

  const value: BandejaContextValue | null = store.data
    ? {
        role: access.role,
        source: access.source,
        actor: { id: access.actorId, name: access.actorName, role: access.role },
        data: store.data,
      }
    : null

  return (
    <AppShell title={title} subtitle={subtitle} search={search} onSearchChange={onSearchChange}>
      {!value ? (
        store.status === 'error' ? (
          <div className={`${cardClass} mx-auto max-w-xl p-6 text-center`}>
            <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
            <h2 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">No se pudo leer Bandeja IA</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{store.error}</p>
            <button type="button" className={`${secondaryButtonClass} mt-4`} onClick={() => void refreshBandeja()}>
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        ) : (
          <div className={`${cardClass} p-6 text-sm text-slate-500 dark:text-slate-400`}>Cargando Bandeja IA...</div>
        )
      ) : (
        <BandejaContext.Provider value={value}>
          <StatusBar gmailEnabled={value.data.settings.gmailEnabled} refreshing={store.refreshing} />
          {store.error && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100" role="alert">
              {store.error}
            </div>
          )}
          <ModuleTabs />
          {children}
        </BandejaContext.Provider>
      )}
    </AppShell>
  )
}
