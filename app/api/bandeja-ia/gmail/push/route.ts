import { bearerToken, fetchGoogleKeys, verifyPubSubJwt } from '@/lib/bandeja-ia/gmail/pubsub-auth'
import { syncContext, syncNow } from '@/lib/bandeja-ia/gmail/runner'
import { isStaleNotification, parsePubSubPush } from '@/lib/bandeja-ia/gmail/sync-plan'

export const runtime = 'nodejs'
export const maxDuration = 60

// Push de Pub/Sub: Gmail avisa que cambio la bandeja de entrada. Ruta publica (sin sesion):
// se autentica con el JWT OIDC que firma Google para la suscripcion.
// Respuestas: 2xx = Pub/Sub da el aviso por recibido; otro codigo = lo reintenta.
const ack = () => new Response(null, { status: 204 })

export async function POST(request: Request) {
  const context = syncContext()
  // Integracion apagada: se confirma igual para que Pub/Sub no reintente en bucle.
  if (!('credentials' in context)) return ack()

  const auth = await verifyPubSubJwt(bearerToken(request.headers.get('authorization')), {
    audience: context.credentials.pubsubAudience,
    serviceAccountEmail: context.credentials.pubsubServiceAccount ?? undefined,
    now: new Date(),
    getKeys: fetchGoogleKeys,
  })
  if (!auth.ok) return Response.json({ error: 'No autorizado.' }, { status: 401 })

  const notification = parsePubSubPush(await request.json().catch(() => null), context.credentials.mailbox)
  // Mensaje con otra forma o de otra casilla: no hay nada que hacer con el.
  if (!notification) return ack()

  // Idempotencia: cada push se registra una vez. Si ya se proceso, se confirma y listo.
  const { db } = context
  const { data: existing } = await db
    .from('bandeja_ia_pubsub_events')
    .select('processed_at')
    .eq('pubsub_message_id', notification.pubsubMessageId)
    .maybeSingle()
  if (existing?.processed_at) return ack()
  if (!existing) {
    await db
      .from('bandeja_ia_pubsub_events')
      .upsert(
        { pubsub_message_id: notification.pubsubMessageId, mailbox_address: notification.emailAddress, history_id: notification.historyId },
        { onConflict: 'pubsub_message_id', ignoreDuplicates: true },
      )
  }

  const markProcessed = () =>
    db.from('bandeja_ia_pubsub_events').update({ processed_at: new Date().toISOString() }).eq('pubsub_message_id', notification.pubsubMessageId)

  // Aviso viejo (ya cubierto por una sincronizacion posterior).
  const state = await context.store.getState(context.credentials.mailbox)
  if (isStaleNotification(notification.historyId, state?.lastHistoryId ?? null)) {
    await markProcessed()
    return ack()
  }

  const summary = await syncNow(context, 'pubsub')
  if (!summary.ok) return Response.json({ error: 'La sincronización falló; Pub/Sub lo va a reintentar.' }, { status: 500 })

  await markProcessed()
  return ack()
}
