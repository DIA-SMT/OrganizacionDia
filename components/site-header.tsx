'use client'

import { BrandLockup } from '@/components/brand-lockup'
import { useBandejaAccess } from '@/components/bandeja-ia/use-bandeja-access'
import { useAuth } from '@/context/AuthContext'
import { BANDEJA_ROUTE } from '@/lib/bandeja-ia/access'
import { countImportantPendingInDb } from '@/lib/bandeja-ia/repository'
import { BANDEJA_UPDATED_EVENT } from '@/lib/bandeja-ia/store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { canAccessRoute, filterNavItemsForTeam, isTeamRestricted } from '@/lib/team-access'
import {
  Bot,
  Code2,
  Database,
  FileDown,
  FileText,
  GitPullRequest,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  Radar,
  Search,
  Sun,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type NavItem = { href: string; label: string; icon: LucideIcon }

// Fuente unica de la navegacion: la usan el dashboard y el resto de pantallas.
const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: Code2 },
  { href: '/radar', label: 'Radar', icon: Radar },
  { href: '/migue', label: 'Migue', icon: Bot },
  { href: '/tasks', label: 'Tareas', icon: GitPullRequest },
  { href: '/team', label: 'Equipo', icon: Users },
  { href: '/expedientes', label: 'Expedientes', icon: FileText },
  // Solo visible con permiso especifico de Bandeja IA (ver useBandejaAccess).
  { href: BANDEJA_ROUTE, label: 'Bandeja IA', icon: Mail },
  { href: '/cuentas-supabase', label: 'Cuentas Supabase', icon: Database },
  { href: '/commit-history', label: 'Historial', icon: History },
  { href: '/papelera', label: 'Papelera', icon: Trash2 },
]

type SiteHeaderProps = {
  isDark: boolean
  onToggleTheme: () => void
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
}

function userDisplayName(user: ReturnType<typeof useAuth>['user']) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const fromMetadata = [metadata.full_name, metadata.name].find((value) => typeof value === 'string' && value.trim())
  if (typeof fromMetadata === 'string') return fromMetadata.trim()
  return user?.email?.split('@')[0] ?? ''
}

function initials(name: string) {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)
  return letters.toUpperCase()
}

export function SiteHeader({ isDark, onToggleTheme, search = '', onSearchChange, searchPlaceholder = 'Buscar' }: SiteHeaderProps) {
  const pathname = usePathname()
  const { user, teamSlug, teamName, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingOverlaps, setPendingOverlaps] = useState(0)
  const bandejaAccess = useBandejaAccess()
  const bandejaAllowed = bandejaAccess.status === 'allowed'
  const [pendingBandeja, setPendingBandeja] = useState(0)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const isExternalTeam = isTeamRestricted(teamSlug)
  const visibleNavItems = filterNavItemsForTeam(teamSlug, navItems).filter(
    (item) => item.href !== BANDEJA_ROUTE || bandejaAllowed,
  )
  const canDownloadReport = canAccessRoute(teamSlug, '/informe')
  const displayName = userDisplayName(user)

  // Aviso de cruces entre equipos: contador de pendientes en el item Radar.
  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function fetchPendingOverlaps() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { count, error: overlapsError } = await supabase
        .from('project_overlaps_detail')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pendiente')

      // Base sin migrar (add_project_overlaps.sql pendiente): sin badge.
      if (!cancelled && !overlapsError) setPendingOverlaps(count ?? 0)
    }

    void fetchPendingOverlaps()

    return () => {
      cancelled = true
    }
  }, [user, pathname])

  // Bandeja IA: asuntos importantes pendientes. Se actualiza al navegar y despues de cada
  // accion del modulo (evento BANDEJA_UPDATED_EVENT).
  useEffect(() => {
    if (!bandejaAllowed) return

    let cancelled = false

    async function fetchPendingBandeja() {
      try {
        const count = await countImportantPendingInDb()
        if (!cancelled) setPendingBandeja(count)
      } catch {
        // Sin badge si la consulta falla.
      }
    }

    void fetchPendingBandeja()
    window.addEventListener(BANDEJA_UPDATED_EVENT, fetchPendingBandeja)

    return () => {
      cancelled = true
      window.removeEventListener(BANDEJA_UPDATED_EVENT, fetchPendingBandeja)
    }
  }, [bandejaAllowed, pathname])

  // El menu de celular se cierra al navegar y con Escape, y devuelve el foco al boton.
  useEffect(() => {
    const timer = window.setTimeout(() => setMenuOpen(false), 0)
    return () => window.clearTimeout(timer)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  function isActive(href: string) {
    return (
      pathname === href ||
      ((href === '/expedientes' || href === BANDEJA_ROUTE) && pathname.startsWith(`${href}/`))
    )
  }

  function badgeFor(href: string) {
    if (href === '/radar' && pendingOverlaps > 0) return { count: pendingOverlaps, className: 'bg-amber-500 text-[var(--brand-navy)]', hint: 'cruces pendientes' }
    if (href === BANDEJA_ROUTE && bandejaAllowed && pendingBandeja > 0) return { count: pendingBandeja, className: 'bg-red-600 text-white', hint: 'importantes pendientes' }
    return null
  }

  const iconButtonClass = `flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-[var(--tint-blue)] hover:text-[var(--brand-blue)]'
  }`
  const outlineButtonClass = `hidden h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition md:flex ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-[var(--tint-blue)] hover:text-[var(--brand-blue)]'
  }`

  return (
    <header className={`sticky top-0 z-40 border-b ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white shadow-[0_1px_0_rgb(9_35_76/3%)]'}`}>
      <div className="mx-auto flex h-[72px] max-w-[1500px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="-ml-1 flex min-w-0 items-center rounded-xl p-1" aria-label="Ir al dashboard">
          <BrandLockup
            appName={isExternalTeam ? teamName ?? 'Equipo' : 'Organización DIA'}
            appSubtitle={isExternalTeam ? 'Catálogo de proyectos' : 'Municipalidad de San Miguel de Tucumán'}
            isDark={isDark}
          />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {onSearchChange && (
            <label
              className={`hidden h-10 items-center gap-2 rounded-full border px-4 text-sm md:flex ${
                isDark ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500 focus-within:border-[var(--brand-blue)]'
              }`}
            >
              <Search className="h-4 w-4 text-[var(--brand-blue)]" aria-hidden="true" />
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                className="w-44 bg-transparent outline-none placeholder:text-inherit xl:w-56"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
              />
            </label>
          )}

          {canDownloadReport && (
            // El informe se abre en otra pestania y dispara solo el dialogo para guardar el PDF.
            <a href="/informe?descargar=1" target="_blank" rel="noopener" className={`${outlineButtonClass} lg:hidden xl:flex`}>
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Informe
            </a>
          )}

          <button
            className={iconButtonClass}
            onClick={onToggleTheme}
            title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {user && (
            <>
              <span className="hidden items-center gap-2 lg:flex" title={user.email ?? undefined}>
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full text-xs font-bold ${
                    isDark ? 'bg-slate-800 text-blue-300' : 'bg-[var(--tint-blue)] text-[var(--brand-blue)]'
                  }`}
                  aria-hidden="true"
                >
                  {initials(displayName)}
                </span>
                <span className="hidden max-w-36 min-w-0 2xl:block">
                  <strong className={`block truncate text-sm ${isDark ? 'text-white' : 'text-[var(--brand-navy)]'}`}>{displayName}</strong>
                  <small className="block truncate text-xs text-slate-500">{teamName ?? 'DIA'}</small>
                </span>
              </span>
              <button className={outlineButtonClass} onClick={signOut}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Salir
              </button>
            </>
          )}

          <button
            ref={menuButtonRef}
            className={`${iconButtonClass} lg:hidden`}
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            aria-controls="menu-principal-celular"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Navegacion de escritorio: segunda franja con las secciones en pildoras. */}
      <nav aria-label="Secciones" className={`hidden border-t lg:block ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="mx-auto max-w-[1500px] overflow-x-auto px-6 [scrollbar-width:none] lg:px-10 [&::-webkit-scrollbar]:hidden">
          <ul className="mx-auto flex w-max items-center gap-0.5 py-1.5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              const badge = badgeFor(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="nav-pill"
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    aria-label={badge ? `${item.label} (${badge.count} ${badge.hint})` : undefined}
                  >
                    <Icon className="hidden h-[17px] w-[17px] 2xl:block" aria-hidden="true" />
                    {item.label}
                    {badge && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${badge.className}`} aria-hidden="true">
                        {badge.count}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* Menu de tablet y celular: panel desde la derecha, como el portal municipal. */}
      {menuOpen && (
        <button
          className="fixed inset-0 z-40 bg-[rgb(9_35_76/45%)] backdrop-blur-[2px] lg:hidden"
          aria-label="Cerrar menú"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div
        id="menu-principal-celular"
        role="dialog"
        aria-modal="true"
        aria-label="Menú principal"
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(340px,88vw)] flex-col rounded-l-3xl px-5 pb-4 pt-5 shadow-[-16px_0_45px_rgb(9_35_76/22%)] transition-transform duration-200 lg:hidden ${
          menuOpen ? 'translate-x-0' : 'pointer-events-none invisible translate-x-[105%]'
        } ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-[var(--brand-navy)]'}`}
      >
        <div className="flex items-center justify-between gap-3 pb-2">
          <BrandLockup appName={isExternalTeam ? teamName ?? 'Equipo' : 'Organización DIA'} appSubtitle="Menú" logoOnly isDark={isDark} />
          <button
            ref={closeButtonRef}
            className={iconButtonClass}
            onClick={() => {
              setMenuOpen(false)
              menuButtonRef.current?.focus()
            }}
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {onSearchChange && (
          <label className={`mt-3 flex h-11 items-center gap-2 rounded-full border px-4 text-sm md:hidden ${isDark ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            <Search className="h-4 w-4 text-[var(--brand-blue)]" aria-hidden="true" />
            <span className="sr-only">{searchPlaceholder}</span>
            <input
              className="w-full bg-transparent outline-none placeholder:text-inherit"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
        )}

        <nav aria-label="Secciones" className="-mx-1 mt-2 flex-1 overflow-y-auto">
          <ul>
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              const badge = badgeFor(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex min-h-[52px] items-center gap-3 border-b px-2 font-[family-name:var(--font-display)] text-base font-bold ${
                      isDark ? 'border-slate-800' : 'border-slate-200'
                    } ${active ? (isDark ? 'text-blue-300' : 'text-[var(--brand-blue)]') : ''}`}
                  >
                    {active && <span aria-hidden="true" className="absolute -left-4 bottom-3 top-3 w-1 rounded-r bg-[var(--brand-yellow)]" />}
                    <Icon className={`h-5 w-5 shrink-0 ${active ? '' : 'text-slate-400'}`} aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {badge && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>
                        {badge.count}
                        <span className="sr-only"> {badge.hint}</span>
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {canDownloadReport && (
          <a
            href="/informe?descargar=1"
            target="_blank"
            rel="noopener"
            className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--brand-blue)] text-[15px] font-bold text-white shadow-[0_10px_22px_rgb(0_102_255/25%)] hover:bg-[var(--brand-deep)]"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Descargar informe
          </a>
        )}

        {user && (
          <div className={`mt-4 flex items-center gap-3 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${isDark ? 'bg-slate-800 text-blue-300' : 'bg-[var(--tint-blue)] text-[var(--brand-blue)]'}`} aria-hidden="true">
              {initials(displayName)}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{displayName}</strong>
              <small className="block truncate text-xs text-slate-500">{teamName ?? 'DIA'}</small>
            </span>
            <button className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10" onClick={signOut}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
