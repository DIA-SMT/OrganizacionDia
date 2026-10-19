// Configuracion de la integracion con Gmail. SOLO SERVIDOR: lee secretos de process.env.
// Ninguna de estas variables puede llevar el prefijo NEXT_PUBLIC_ (terminaria en el
// navegador); si aparece alguna asi, el estado lo informa y la integracion no arranca.

// Acceso de solo lectura. Alternativa mas restrictiva: gmail.metadata (sin cuerpos), si
// alcanza con remitente, asunto y fecha.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

export const GMAIL_REQUIRED_ENV = [
  'BANDEJA_IA_GMAIL_CLIENT_ID',
  'BANDEJA_IA_GMAIL_CLIENT_SECRET',
  'BANDEJA_IA_GMAIL_REFRESH_TOKEN',
  'BANDEJA_IA_GMAIL_MAILBOX',
  'BANDEJA_IA_PUBSUB_TOPIC',
  'BANDEJA_IA_PUBSUB_AUDIENCE',
  'BANDEJA_IA_CRON_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

export type GmailEnvName = (typeof GMAIL_REQUIRED_ENV)[number]

type Env = Record<string, string | undefined>

export type GmailIntegrationStatus = {
  // Interruptor explicito: BANDEJA_IA_GMAIL_ENABLED=true. Arranca apagado.
  flagEnabled: boolean
  // Que variables estan cargadas (nunca sus valores).
  configured: Record<GmailEnvName, boolean>
  missing: GmailEnvName[]
  // Variables de Bandeja IA expuestas por error al navegador.
  exposedPublicVars: string[]
  alertsFlag: boolean
  telegramFlag: boolean
  // Recomendada, no obligatoria: restringe el push a la cuenta de servicio de la suscripcion.
  serviceAccountConfigured: boolean
  // Lista para sincronizar: interruptor encendido, todo configurado y nada expuesto.
  ready: boolean
}

export function readGmailStatus(env: Env = process.env): GmailIntegrationStatus {
  const configured = Object.fromEntries(GMAIL_REQUIRED_ENV.map((name) => [name, Boolean(env[name]?.trim())])) as Record<GmailEnvName, boolean>
  const missing = GMAIL_REQUIRED_ENV.filter((name) => !configured[name])
  const exposedPublicVars = Object.keys(env).filter((name) => /^NEXT_PUBLIC_.*(BANDEJA|GMAIL|PUBSUB|TELEGRAM)/i.test(name))
  const flagEnabled = env.BANDEJA_IA_GMAIL_ENABLED === 'true'

  return {
    flagEnabled,
    configured,
    missing,
    exposedPublicVars,
    alertsFlag: env.BANDEJA_IA_ALERTS_ENABLED === 'true',
    telegramFlag: env.BANDEJA_IA_TELEGRAM_ENABLED === 'true',
    serviceAccountConfigured: Boolean(env.BANDEJA_IA_PUBSUB_SERVICE_ACCOUNT?.trim()),
    ready: flagEnabled && missing.length === 0 && exposedPublicVars.length === 0,
  }
}

export type GmailCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
  mailbox: string
  pubsubTopic: string
  pubsubAudience: string
  // Opcional: email de la cuenta de servicio de la suscripcion push. Si esta, el push
  // tiene que venir firmado por esa cuenta y no por cualquier otra del mismo Google.
  pubsubServiceAccount: string | null
  cronSecret: string
}

// Devuelve credenciales solo si la integracion esta lista; si no, null (y nadie llama a Google).
export function readGmailCredentials(env: Env = process.env): GmailCredentials | null {
  if (typeof window !== 'undefined') throw new Error('Las credenciales de Gmail solo se leen en el servidor.')
  if (!readGmailStatus(env).ready) return null
  return {
    clientId: env.BANDEJA_IA_GMAIL_CLIENT_ID!,
    clientSecret: env.BANDEJA_IA_GMAIL_CLIENT_SECRET!,
    refreshToken: env.BANDEJA_IA_GMAIL_REFRESH_TOKEN!,
    mailbox: env.BANDEJA_IA_GMAIL_MAILBOX!.trim().toLowerCase(),
    pubsubTopic: env.BANDEJA_IA_PUBSUB_TOPIC!,
    pubsubAudience: env.BANDEJA_IA_PUBSUB_AUDIENCE!.trim(),
    pubsubServiceAccount: env.BANDEJA_IA_PUBSUB_SERVICE_ACCOUNT?.trim() || null,
    cronSecret: env.BANDEJA_IA_CRON_SECRET!,
  }
}
