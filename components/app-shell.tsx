'use client'

import { useAuth } from '@/context/AuthContext'
import { CursorAiBackground } from '@/components/cursor-ai-background'
import { SiteHeader } from '@/components/site-header'
import { motion } from 'framer-motion'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type AppShellProps = {
  title: string
  subtitle: string
  /** Antetitulo sobre el titulo de la pantalla. */
  eyebrow?: string
  search?: string
  onSearchChange?: (value: string) => void
  children: React.ReactNode
}

export const THEME_STORAGE_KEY = 'organizacion-dia-theme'
export const THEME_CHANGE_EVENT = 'organizacion-dia-theme-change'

/** Tema claro/oscuro guardado en el navegador, compartido entre pantallas. */
export function useDiaTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }))
      return next
    })
  }

  return { isDark: theme === 'dark', toggleTheme }
}

export function AppShell({ title, subtitle, eyebrow = 'Organización DIA', search = '', onSearchChange, children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, authConfigured } = useAuth()
  const { isDark, toggleTheme } = useDiaTheme()

  useEffect(() => {
    if (!authConfigured || loading || user) return
    router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [authConfigured, loading, pathname, router, user])

  const shellClass = isDark ? 'dark bg-slate-950 text-slate-100' : 'dia-bg text-slate-950'

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
      <SiteHeader isDark={isDark} onToggleTheme={toggleTheme} search={search} onSearchChange={onSearchChange} />

      <motion.div
        key={pathname}
        className="relative z-10 mx-auto w-full max-w-[1500px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.38, ease: 'easeOut' }}
      >
        <div className="mb-7">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={`mt-2 text-3xl font-bold sm:text-[2rem] ${isDark ? 'text-white' : 'text-[var(--brand-navy)]'}`}>{title}</h1>
          <p className={`mt-1.5 text-[15px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </main>
  )
}
