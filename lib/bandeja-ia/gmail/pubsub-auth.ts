// Verificacion del JWT OIDC con el que Pub/Sub firma cada push. Sin esto, cualquiera que
// conozca la URL podria disparar sincronizaciones. Se valida con WebCrypto (RS256) contra
// las claves publicas de Google; no hace falta ninguna dependencia nueva.

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']
// Tolerancia de reloj entre Google y el servidor.
const CLOCK_SKEW_SECONDS = 60

export type Jwk = JsonWebKey & { kid?: string }

export type JwtCheck = {
  audience: string
  // Cuenta de servicio de la suscripcion push. Si se configura, el token tiene que ser de ella.
  serviceAccountEmail?: string
  now: Date
  getKeys: () => Promise<Jwk[]>
}

export type JwtResult = { ok: true; email: string | null } | { ok: false; reason: string }

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as Record<string, unknown>
  } catch {
    return null
  }
}

export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function verifyPubSubJwt(token: string | null, check: JwtCheck): Promise<JwtResult> {
  if (!token) return { ok: false, reason: 'Falta el token' }
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'Token mal formado' }

  const header = decodeJson(parts[0])
  const payload = decodeJson(parts[1])
  if (!header || !payload) return { ok: false, reason: 'Token mal formado' }
  if (header.alg !== 'RS256') return { ok: false, reason: 'Algoritmo no permitido' }

  const keys = await check.getKeys()
  const jwk = keys.find((key) => key.kid === header.kid)
  if (!jwk) return { ok: false, reason: 'Clave desconocida' }

  const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(parts[2]) as BufferSource,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as BufferSource,
  )
  if (!valid) return { ok: false, reason: 'Firma invalida' }

  const nowSeconds = Math.floor(check.now.getTime() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) return { ok: false, reason: 'Token vencido' }
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_SECONDS > nowSeconds) return { ok: false, reason: 'Token del futuro' }
  if (!GOOGLE_ISSUERS.includes(String(payload.iss))) return { ok: false, reason: 'Emisor invalido' }
  if (payload.aud !== check.audience) return { ok: false, reason: 'Audiencia invalida' }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  if (check.serviceAccountEmail) {
    if (!email || email !== check.serviceAccountEmail.trim().toLowerCase() || payload.email_verified !== true) {
      return { ok: false, reason: 'Cuenta de servicio no autorizada' }
    }
  }

  return { ok: true, email }
}

// Claves de Google con cache en memoria (rotan cada algunos dias).
let cachedKeys: { keys: Jwk[]; expiresAt: number } | null = null

export async function fetchGoogleKeys(): Promise<Jwk[]> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys
  const response = await fetch(GOOGLE_JWKS_URL, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('No se pudieron leer las claves de Google')
  const payload = (await response.json()) as { keys: Jwk[] }
  cachedKeys = { keys: payload.keys, expiresAt: Date.now() + 60 * 60 * 1000 }
  return payload.keys
}
