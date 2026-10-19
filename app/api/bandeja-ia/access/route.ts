import { resolveBandejaAccess } from '@/lib/bandeja-ia/server-access'

export const runtime = 'nodejs'

export async function GET() {
  const access = await resolveBandejaAccess()
  const status = !access.allowed && access.reason === 'sin-sesion' ? 401 : 200
  return Response.json(access, { status, headers: { 'Cache-Control': 'no-store' } })
}
