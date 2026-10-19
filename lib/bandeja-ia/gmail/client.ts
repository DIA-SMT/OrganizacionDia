// Cliente minimo de Gmail API, SOLO SERVIDOR y SOLO LECTURA. Lo usan la sincronizacion y la
// vista del correo del detalle; solo existe si readGmailCredentials devuelve credenciales.
// A proposito no tiene metodos para enviar, responder, borrar, mover ni etiquetar correos.
// El unico POST a Gmail es users.watch, que registra la suscripcion de Pub/Sub y no
// modifica mensajes. El token de acceso vive solo en memoria del servidor.

import type { GmailCredentials } from './config.ts'
import type { GmailFullMessage } from './message-body.ts'
import type { GmailMetadataMessage } from './sync-plan.ts'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIMEOUT_MS = 10_000
const METADATA_HEADERS = ['From', 'Subject', 'Date', 'Message-ID', 'Content-Type']

export class GmailApiError extends Error {
  readonly status: number
  // Motivo tecnico que devuelve Google (ej: "rateLimitExceeded", "insufficientPermissions").
  readonly reason: string | null
  // Explicacion de Google, ya recortada.
  readonly detail: string | null

  constructor(status: number, message: string, reason: string | null = null, detail: string | null = null) {
    super(message)
    this.status = status
    this.reason = reason
    this.detail = detail
  }
}

// El cuerpo de error de Gmail no trae datos de correos: solo codigo, motivo y explicacion.
async function gmailError(response: Response): Promise<GmailApiError> {
  try {
    const payload = (await response.json()) as { error?: { message?: string; errors?: { reason?: string }[]; status?: string } }
    const reason = payload.error?.errors?.[0]?.reason ?? payload.error?.status ?? null
    const detail = payload.error?.message?.slice(0, 200) ?? null
    return new GmailApiError(response.status, detail ? `Gmail respondió ${response.status}: ${detail}` : `Gmail respondió ${response.status}`, reason, detail)
  } catch {
    return new GmailApiError(response.status, `Gmail respondió ${response.status}`)
  }
}

export function createGmailReader(credentials: GmailCredentials) {
  if (typeof window !== 'undefined') throw new Error('El cliente de Gmail solo corre en el servidor.')

  let accessToken: { value: string; expiresAt: number } | null = null

  async function token(): Promise<string> {
    if (accessToken && accessToken.expiresAt - 60_000 > Date.now()) return accessToken.value
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      // Solo el codigo y la explicacion de Google (ej: invalid_grant, "Token has been expired
      // or revoked."); el cuerpo de error no incluye la credencial.
      let detail: string | null = null
      try {
        const payload = (await response.json()) as { error?: string; error_description?: string }
        detail = [payload.error, payload.error_description].filter(Boolean).join(': ').slice(0, 200) || null
      } catch {
        // Sin cuerpo legible.
      }
      throw new GmailApiError(response.status === 400 ? 401 : response.status, 'No se pudo renovar el token de Gmail', detail, detail)
    }
    const payload = (await response.json()) as { access_token: string; expires_in: number }
    accessToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 }
    return accessToken.value
  }

  async function request<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${GMAIL_API}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw await gmailError(response)
    return (await response.json()) as T
  }

  return {
    // Sincronizacion inicial: ids de la bandeja de entrada que cumplen la consulta (ver initialSyncQuery).
    listInboxMessageIds(query: string, pageToken?: string) {
      const params = new URLSearchParams({ q: query, maxResults: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      return request<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(`/messages?${params}`)
    },

    // Sincronizacion incremental desde el ultimo historyId (404 = expiro: resincronizar).
    listHistory(startHistoryId: string, pageToken?: string) {
      const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      return request<{ history?: { messagesAdded?: { message: { id: string; threadId: string } }[] }[]; historyId: string; nextPageToken?: string }>(
        `/history?${params}`,
      )
    },

    // Solo encabezados: format=metadata no descarga el cuerpo ni los adjuntos.
    getMessageMetadata(id: string) {
      const params = new URLSearchParams({ format: 'metadata' })
      for (const header of METADATA_HEADERS) params.append('metadataHeaders', header)
      return request<GmailMetadataMessage>(`/messages/${encodeURIComponent(id)}?${params}`)
    },

    // Conversacion completa, para mostrarla en el detalle del asunto. No se guarda.
    getThread(threadId: string) {
      return request<{ id: string; messages?: GmailFullMessage[] }>(`/threads/${encodeURIComponent(threadId)}?format=full`)
    },

    // Contenido de una imagen incrustada (cid:) de un mensaje.
    getAttachment(messageId: string, attachmentId: string) {
      return request<{ size: number; data: string }>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)
    },

    getProfile() {
      return request<{ emailAddress: string; historyId: string }>('/profile')
    },

    // Registra (o renueva) las notificaciones push de la bandeja de entrada en Pub/Sub.
    watchInbox() {
      return request<{ historyId: string; expiration: string }>('/watch', {
        method: 'POST',
        body: { topicName: credentials.pubsubTopic, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' },
      })
    },
  }
}

export type GmailReader = ReturnType<typeof createGmailReader>
