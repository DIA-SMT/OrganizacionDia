import { canAdminister } from '@/lib/bandeja-ia/access'
import { syncContext, syncNow } from '@/lib/bandeja-ia/gmail/runner'
import { resolveBandejaAccess } from '@/lib/bandeja-ia/server-access'
import { timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }

function sameSecret(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Respaldo del push y renovacion del aviso de Gmail. Dos formas de entrar:
// - el cron (.github/workflows/bandeja-ia-gmail-sync.yml) con x-sync-secret = BANDEJA_IA_CRON_SECRET;
// - "Sincronizar ahora" desde Configuracion, con sesion y rol admin de Bandeja IA.
export async function POST(request: Request) {
  let trigger: 'cron' | 'manual' = 'cron'
  if (!sameSecret(request.headers.get('x-sync-secret'), process.env.BANDEJA_IA_CRON_SECRET)) {
    const access = await resolveBandejaAccess()
    if (!access.allowed || !canAdminister(access.role)) return Response.json({ error: 'No autorizado.' }, { status: 401, headers: NO_STORE })
    trigger = 'manual'
  }

  const context = syncContext()
  // Apagada: 200 para que el cron no quede en rojo mientras no se habilite.
  if (!('credentials' in context)) {
    return Response.json({ ok: false, skipped: true, reason: context.reason, missing: context.missing }, { headers: NO_STORE })
  }

  const summary = await syncNow(context, trigger, { ignoreBackoff: trigger === 'manual' })
  return Response.json(summary, { status: summary.ok ? 200 : 502, headers: NO_STORE })
}
