'use client'

import { useAuth } from '@/context/AuthContext'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { filterNavItemsForTeam, isTeamRestricted } from '@/lib/team-access'
import {
  Code2,
  Database,
  FileText,
  GitPullRequest,
  History,
  LayoutDashboard,
  Radar,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type NavItem = { href: string; label: string; icon: LucideIcon }

// Fuente unica de la navegacion: la usan el dashboard y el resto de pantallas.
const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: Code2 },
  { href: '/radar', label: 'Radar', icon: Radar },
  { href: '/tasks', label: 'Tareas', icon: GitPullRequest },
  { href: '/team', label: 'Equipo', icon: Users },
  { href: '/expedientes', label: 'Expedientes', icon: FileText },
  { href: '/cuentas-supabase', label: 'Cuentas Supabase', icon: Database },
  { href: '/commit-history', label: 'Historial', icon: History },
  { href: '/papelera', label: 'Papelera', icon: Trash2 },
]

export function Sidebar({ isDark }: { isDark: boolean }) {
  const pathname = usePathname()
  const { user, teamSlug, teamName } = useAuth()
  const [collapsed, setCollapsed] = useState(true)
  const [pendingOverlaps, setPendingOverlaps] = useState(0)

  const isExternalTeam = isTeamRestricted(teamSlug)
  const visibleNavItems = filterNavItemsForTeam(teamSlug, navItems)
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'

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

  return (
    <aside
      className={`sticky top-0 flex min-h-screen shrink-0 self-stretch flex-col border-r px-3 py-4 transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-56'} ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 dia-surface-glass'}`}
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      onFocusCapture={() => setCollapsed(false)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setCollapsed(true)
      }}
    >
      <div className={`mb-6 px-1 py-1 ${collapsed ? 'flex justify-center' : 'flex items-center justify-between gap-2'}`}>
        <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex aspect-square h-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#061e3d] ring-1 ring-white/10">
            <Image className="h-full w-full object-cover" src="/logo-dia.png" alt="DIA" width={64} height={64} priority={false} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className={`text-sm font-bold ${textStrongClass}`}>{isExternalTeam ? teamName ?? 'Equipo' : 'DIA'}</p>
              <p className="text-xs leading-tight text-slate-400">
                {isExternalTeam ? 'Catalogo de proyectos' : 'Direccion de Inteligencia Artificial'}
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="space-y-1">
        {visibleNavItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href === '/expedientes' && pathname.startsWith('/expedientes/'))
          const activeClass = isDark ? 'bg-blue-500/15 text-blue-300' : 'dia-surface-raised-bg dia-primary-text'
          const idleClass = isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          const itemClass = `flex w-full items-center rounded-lg py-2 text-sm font-medium transition ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? activeClass : idleClass}`

          const showOverlapsBadge = item.href === '/radar' && pendingOverlaps > 0

          return (
            <Link key={item.href} href={item.href} className={itemClass} title={collapsed ? item.label : undefined} aria-label={item.label}>
              <span className="relative shrink-0">
                <Icon className="h-4 w-4 shrink-0" />
                {showOverlapsBadge && collapsed && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500" />}
              </span>
              {!collapsed && (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {showOverlapsBadge && (
                    <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{pendingOverlaps}</span>
                  )}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
