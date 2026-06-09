'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { Bell, Code2, FlaskConical, GitPullRequest, LayoutDashboard, LogOut, Search, Settings, Sun, Moon, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  { href: '/testing', label: 'Testing', icon: FlaskConical },
  { href: '/team', label: 'Equipo', icon: Users },
  { href: '/papelera', label: 'Papelera', icon: Trash2 },
]

export function AppShell({ title, subtitle, search = '', onSearchChange, children }: AppShellProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const isDark = theme === 'dark'
  const shellClass = isDark ? 'dark bg-slate-950 text-slate-100' : 'bg-[#f6f8fb] text-slate-950'
  const textStrongClass = isDark ? 'text-white' : 'text-slate-950'
  const textMutedClass = isDark ? 'text-slate-400' : 'text-slate-500'

  return (
    <main className={`relative isolate min-h-screen overflow-hidden transition-colors ${shellClass}`}>
      <CursorAiBackground isDark={isDark} />
      <div className="relative z-10 flex min-h-screen">
        <aside className={`hidden w-64 border-r px-4 py-5 lg:block ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'}`}>
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#103b3a] text-white">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-sm font-bold ${textStrongClass}`}>Organizacion DIA</p>
              <p className="text-xs text-slate-400">Equipo de desarrollo</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href
              const activeClass = isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#e9f8f1] text-[#08784f]'
              const idleClass = isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'

              return (
                <Link key={item.href} href={item.href} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${active ? activeClass : idleClass}`}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className={`border-b backdrop-blur ${isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/90'}`}>
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
                <button className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <Bell className="h-4 w-4" />
                </button>
                <button className={`flex h-10 w-10 items-center justify-center rounded-md border ${isDark ? 'border-slate-700 bg-slate-950 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`} onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 px-5 py-5">{children}</div>
        </section>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
          <aside className={`h-full w-full max-w-md border-l p-5 shadow-xl ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`text-lg font-bold ${textStrongClass}`}>Configuracion</h2>
                <p className={`mt-1 text-sm ${textMutedClass}`}>Ajustes generales del panel.</p>
              </div>
              <button className={`rounded-md px-3 py-2 text-sm ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`} onClick={() => setSettingsOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className={`mt-6 rounded-lg border p-4 ${isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-[#fbfcfd]'}`}>
              <p className={`font-semibold ${textStrongClass}`}>Sesion</p>
              <p className={`mt-2 text-sm ${textMutedClass}`}>Email: {user?.email ?? 'Sin sesion'}</p>
              <p className={`mt-1 text-sm ${textMutedClass}`}>Permisos: funciones habilitadas para todos los usuarios con acceso</p>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}
