import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Los .glb (modelos 3D) y /vendor (decodificador de esos modelos) son estaticos de /public,
  // como las imagenes: no pasan por la sesion.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|vendor/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb)$).*)'],
}
