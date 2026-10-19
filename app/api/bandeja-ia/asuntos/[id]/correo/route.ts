import { GmailApiError } from '@/lib/bandeja-ia/gmail/client'
import { gmailThreadUrl, parseMessage, replaceCidReferences, type ParsedEmail } from '@/lib/bandeja-ia/gmail/message-body'
import { gmailReader, syncContext } from '@/lib/bandeja-ia/gmail/runner'
import { resolveBandejaAccess } from '@/lib/bandeja-ia/server-access'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// No se guarda en ningun lado (ni en la base ni en caches intermedios).
const NO_STORE = { 'Cache-Control': 'no-store, private' }

// Imagenes incrustadas (logos, firmas): se traen hasta un tope para no demorar la vista.
const MAX_INLINE_IMAGES = 12
const MAX_INLINE_BYTES = 600_000

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE })

// Contenido completo de la conversacion de un asunto, leido de Gmail en el momento.
// Solo para quien tiene permiso de Bandeja IA y puede ver ese asunto (RLS).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolveBandejaAccess()
  if (!access.allowed) return reply({ error: 'No autorizado.' }, 403)

  const { id } = await params
  const supabase = await createClient()
  if (!supabase) return reply({ error: 'Supabase no está configurado.' }, 500)

  const { data: asunto } = await supabase.from('bandeja_ia_asuntos').select('id, gmail_thread_id').eq('id', id).maybeSingle()
  if (!asunto) return reply({ error: 'No se encontró el asunto.' }, 404)
  if (!asunto.gmail_thread_id) return reply({ error: 'Este asunto no tiene un correo vinculado.' }, 404)

  const context = syncContext()
  if (!('credentials' in context)) return reply({ error: context.reason }, 409)

  const mailbox = context.credentials.mailbox
  const threadId = asunto.gmail_thread_id as string
  const reader = gmailReader(context.credentials)

  try {
    const thread = await reader.getThread(threadId)
    const messages: ParsedEmail[] = (thread.messages ?? []).map((message) => parseMessage(message, mailbox))

    // Reemplaza cid: por las imagenes incrustadas de cada mensaje.
    let fetched = 0
    for (const message of messages) {
      if (!message.html || message.inline.length === 0) continue
      const images = new Map<string, string>()
      for (const image of message.inline) {
        if (image.size > MAX_INLINE_BYTES) continue
        let data = image.data
        if (!data && image.attachmentId && fetched < MAX_INLINE_IMAGES) {
          fetched += 1
          data = (await reader.getAttachment(message.id, image.attachmentId)).data
        }
        if (data) images.set(image.contentId, `data:${image.mimeType};base64,${Buffer.from(data, 'base64url').toString('base64')}`)
      }
      message.html = replaceCidReferences(message.html, images)
    }

    return reply({
      gmailUrl: gmailThreadUrl(mailbox, threadId),
      messages: messages.map((message) => ({
        id: message.id,
        from: message.from,
        to: message.to,
        cc: message.cc,
        date: message.date,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments,
        sentByMailbox: message.sentByMailbox,
      })),
    })
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) {
      return reply({ error: 'La conversación ya no está en la casilla (puede haberse borrado).', gmailUrl: gmailThreadUrl(mailbox, threadId) }, 404)
    }
    if (error instanceof GmailApiError && error.status === 401) {
      return reply({ error: 'Hay que volver a autorizar la casilla para leer el correo.' }, 502)
    }
    return reply({ error: 'No se pudo leer el correo desde Gmail. Probá de nuevo en unos minutos.', gmailUrl: gmailThreadUrl(mailbox, threadId) }, 502)
  }
}
