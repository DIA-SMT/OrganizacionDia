// Lectura del contenido de una conversacion de Gmail para mostrarla tal cual en el detalle
// del asunto. SOLO SERVIDOR. El contenido se pide a Gmail en el momento y no se guarda.
// Funciones puras salvo la decodificacion (Buffer/TextDecoder de Node).

export type GmailPart = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export type GmailFullMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPart
}

export type EmailAttachment = { filename: string; mimeType: string; size: number }

export type InlineImage = { contentId: string; mimeType: string; size: number; data: string | null; attachmentId: string | null }

export type ParsedEmail = {
  id: string
  from: string
  to: string
  cc: string
  date: string | null
  subject: string
  html: string | null
  text: string | null
  attachments: EmailAttachment[]
  inline: InlineImage[]
  sentByMailbox: boolean
}

// Topes para no mandarle al navegador un correo descomunal.
export const MAX_BODY_CHARS = 1_500_000

function header(headers: GmailPart['headers'], name: string): string {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function charsetOf(contentType: string): string {
  const match = contentType.match(/charset="?([^";\s]+)"?/i)
  return match ? match[1].toLowerCase() : 'utf-8'
}

// Gmail devuelve el contenido en base64url, en el charset original del correo.
export function decodeBody(data: string, charset = 'utf-8'): string {
  const bytes = Buffer.from(data, 'base64url')
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }
}

function walk(part: GmailPart, result: { html: string | null; text: string | null; attachments: EmailAttachment[]; inline: InlineImage[] }) {
  if (part.parts?.length) {
    for (const child of part.parts) walk(child, result)
    return
  }

  const mimeType = (part.mimeType ?? 'application/octet-stream').toLowerCase()
  const contentId = header(part.headers, 'Content-ID').replace(/^<|>$/g, '').trim()
  const disposition = header(part.headers, 'Content-Disposition').toLowerCase()
  const isInlineImage = Boolean(contentId) && mimeType.startsWith('image/') && !disposition.startsWith('attachment')

  if (isInlineImage) {
    result.inline.push({ contentId, mimeType, size: part.body?.size ?? 0, data: part.body?.data ?? null, attachmentId: part.body?.attachmentId ?? null })
    return
  }

  if (part.filename) {
    result.attachments.push({ filename: part.filename, mimeType, size: part.body?.size ?? 0 })
    return
  }

  const data = part.body?.data
  if (!data) return
  const charset = charsetOf(header(part.headers, 'Content-Type'))
  // Con varias partes de texto (por ejemplo un reenvio), se juntan en orden.
  if (mimeType === 'text/html') result.html = (result.html ?? '') + decodeBody(data, charset)
  else if (mimeType === 'text/plain') result.text = (result.text ?? '') + decodeBody(data, charset)
}

export function parseMessage(message: GmailFullMessage, mailbox: string): ParsedEmail {
  const headers = message.payload?.headers
  const result = { html: null as string | null, text: null as string | null, attachments: [] as EmailAttachment[], inline: [] as InlineImage[] }
  if (message.payload) walk(message.payload, result)

  const from = header(headers, 'From')
  const internalDate = message.internalDate ? Number(message.internalDate) : NaN

  return {
    id: message.id,
    from,
    to: header(headers, 'To'),
    cc: header(headers, 'Cc'),
    date: Number.isFinite(internalDate) ? new Date(internalDate).toISOString() : null,
    subject: header(headers, 'Subject') || '(sin asunto)',
    html: result.html ? result.html.slice(0, MAX_BODY_CHARS) : null,
    text: result.text ? result.text.slice(0, MAX_BODY_CHARS) : null,
    attachments: result.attachments,
    inline: result.inline,
    sentByMailbox: (message.labelIds ?? []).includes('SENT') || from.toLowerCase().includes(mailbox.toLowerCase()),
  }
}

// Las imagenes incrustadas (logos, firmas) se referencian como cid:...; se reemplazan por
// data: para que se vean sin pedir nada afuera.
export function replaceCidReferences(html: string, images: Map<string, string>): string {
  return html.replace(/(["'(])cid:([^"')\s]+)/gi, (match, prefix: string, id: string) => {
    const dataUri = images.get(decodeURIComponent(id)) ?? images.get(id)
    return dataUri ? `${prefix}${dataUri}` : `${prefix}data:,`
  })
}

// Enlace a la conversacion en Gmail web, en la cuenta de la casilla.
export function gmailThreadUrl(mailbox: string, threadId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${encodeURIComponent(threadId)}`
}

// Documento aislado para el iframe: sin scripts (sandbox), los links abren en otra pestana y
// las imagenes externas quedan bloqueadas por CSP salvo que se pidan.
export function buildEmailDocument(html: string, options: { allowRemoteImages: boolean }): string {
  const remote = options.allowRemoteImages ? ' https: http:' : ''
  const csp = [
    "default-src 'none'",
    `img-src data:${remote}`,
    `style-src 'unsafe-inline'${options.allowRemoteImages ? ' https:' : ''}`,
    `font-src data:${options.allowRemoteImages ? ' https:' : ''}`,
    "form-action 'none'",
  ].join('; ')

  const styles = (html.match(/<style[\s\S]*?<\/style>/gi) ?? []).join('\n')
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const body = (bodyMatch ? bodyMatch[1] : html)
    // Defensa extra (el sandbox ya bloquea scripts y la navegacion del Dashboard).
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(meta|base|link)\b[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html,body{margin:0;background:#ffffff}body{padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#0b1635;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}</style>${styles}</head><body>${body}</body></html>`
}
