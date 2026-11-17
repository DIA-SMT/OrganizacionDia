import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import '@fontsource-variable/dm-sans'
import { AuthProvider } from '@/context/AuthContext'
import { LenisProvider } from '@/components/lenis-provider'
import { TeamGate } from '@/components/team-gate'
import { VirtualAssistant } from '@/components/virtual-assistant'
import './globals.css'

export const metadata: Metadata = {
  title: 'Organizacion DIA',
  description: 'Gestion interna de proyectos de programacion',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
}

export const viewport: Viewport = { themeColor: '#0066ff' }

// Titulos en Outfit (OFL) autoalojada, igual que Applaza: el build no depende de Google Fonts.
const display = localFont({
  src: [{ path: './fonts/Outfit-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-outfit',
  display: 'swap',
  fallback: ['DM Sans Variable', 'system-ui', 'sans-serif'],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={display.variable}>
      <body>
        <AuthProvider>
          <LenisProvider />
          <TeamGate />
          {children}
          <VirtualAssistant />
        </AuthProvider>
      </body>
    </html>
  )
}
