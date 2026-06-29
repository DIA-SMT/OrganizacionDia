'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { motion } from 'framer-motion'
import { Code2, FileText, GitPullRequest, History, LayoutDashboard, LogOut, Search, Sun, Moon, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type AppShellProps = {
  title: string
  subtitle: string
  search?: string
  onSearchChange?: (value: string) => void
  children: React.ReactNode
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Proyectos', icon: Code2 },
  { href: '/tasks', label: 'Tareas', icon: GitPullRequest },
  { href: '/team', label: 'Equipo', icon: Users },
  { href: '/expedientes', label: 'Expedientes', icon: FileText },
  { href: '/commit-history', label: 'Historial', icon: History },
  { href: '/papelera', label: 'Papelera', icon: Trash2 },
]

export function AppShell({ title, subtitle, search = '', onSearchChange, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, authConfigured, signOut } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem('organizacion-dia-theme')
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem('organizacion-dia-theme', next)
      window.dispatchEvent(new CustomEvent('organizacion-dia-theme-change', { detail: next }))
      return next
    })
  }
  useEffect(() => {
    if (!authConfigured || loading || user) return
    router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [authConfigured, loading, pathname, router, user])

  const isDark = theme === 'dark'
  const shellClass = isDark ? 'dark bg-slate-950 text-slate-100' : 'dia-bg text-slate-950'
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'
  const textMutedClass = isDark ? 'text-slate-400' : 'text-slate-500'

  if (authConfigured && (loading || !user)) {
    return (
      <main className={`relative isolate flex min-h-screen items-center justify-center transition-colors ${shellClass}`}>
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${isDark ? 'border-slate-800 bg-slate-900 text-slate-300' : 'border-slate-200 dia-surface-bg text-slate-600'}`}>
          Verificando sesion...
        </div>
      </main>
    )
  }

  return (
    <main className={`relative isolate min-h-screen overflow-x-hidden transition-colors ${shellClass}`}>
      <CursorAiBackground isDark={isDark} />
      <div className="relative z-10 flex min-h-screen">
        <aside
          className={`sticky top-0 flex min-h-screen shrink-0 self-stretch flex-col border-r px-3 py-4 transition-[width] duration-200 ${sidebarCollapsed ? 'w-16' : 'w-56'} ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 dia-surface-glass'}`}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
          onFocusCapture={() => setSidebarCollapsed(false)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSidebarCollapsed(true)
          }}
        >
          <div className={`mb-6 px-1 py-1 ${sidebarCollapsed ? 'flex justify-center' : 'flex items-center justify-between gap-2'}`}>
            <div className={`flex min-w-0 items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="flex aspect-square h-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#061e3d] ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="h-full w-full object-cover" src="/logo-dia.png" alt="DIA" />
            </div>
            {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className={`text-sm font-bold ${textStrongClass}`}>DIA</p>
              <p className="text-xs leading-tight text-slate-400">Direccion de Inteligencia Artificial</p>
            </div>
            )}
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || (item.href === '/expedientes' && pathname.startsWith('/expedientes/'))
              const activeClass = isDark ? 'bg-blue-500/15 text-blue-300' : 'dia-surface-raised-bg dia-primary-text'
              const idleClass = isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              const itemClass = `flex w-full items-center rounded-lg py-2 text-sm font-medium transition ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? activeClass : idleClass}`

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={itemClass}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`border-b backdrop-blur ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 dia-surface-glass'}`}>
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div>
                <h1 className={`text-xl font-bold ${textStrongClass}`}>{title}</h1>
                <p className={`text-sm ${textMutedClass}`}>{subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {onSearchChange && (
                  <label className={`hidden h-10 items-center gap-2 rounded-md border px-3 text-sm md:flex ${isDark ? 'border-slate-700 bg-slate-950 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                    <Search className="h-4 w-4" />
                    <input className="w-56 bg-transparent outline-none placeholder:text-inherit" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar" />
                  </label>
                )}
                <button className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`} onClick={toggleTheme} title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                {user && (
                  <button className={`hidden h-10 items-center gap-2 rounded-md border px-3 text-sm md:flex ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`} onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                    Salir
                  </button>
                )}
              </div>
            </div>
          </header>

          <motion.div
            key={pathname}
            className="flex-1 px-5 py-5"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </section>
      </div>

    </main>
  )
}
