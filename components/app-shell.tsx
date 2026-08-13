'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { Sidebar } from '@/components/sidebar'
import { motion } from 'framer-motion'
import { LogOut, Search, Sun, Moon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type AppShellProps = {
  title: string
  subtitle: string
  search?: string
  onSearchChange?: (value: string) => void
  children: React.ReactNode
}

export function AppShell({ title, subtitle, search = '', onSearchChange, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, authConfigured, signOut } = useAuth()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

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
        <Sidebar isDark={isDark} />

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
