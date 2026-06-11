import type { Metadata } from 'next'
import { AuthProvider } from '@/context/AuthContext'
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          {children}
          <VirtualAssistant />
        </AuthProvider>
      </body>
    </html>
  )
}
