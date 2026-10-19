import assert from 'node:assert/strict'
import test from 'node:test'

const AUDIENCE = 'https://organizacion-dia.vercel.app/api/bandeja-ia/gmail/push'
const NOW = new Date('2026-10-19T13:00:00Z')
const nowSeconds = Math.floor(NOW.getTime() / 1000)

const b64url = (data: Uint8Array | string) =>
  Buffer.from(typeof data === 'string' ? data : data).toString('base64url')

async function keyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'clave-1' }
  return { privateKey: pair.privateKey, jwk }
}

async function sign(privateKey: CryptoKey, payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'clave-1', typ: 'JWT' }) {
  const head = b64url(JSON.stringify(header))
  const body = b64url(JSON.stringify(payload))
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(signature)}`
}

const validPayload = {
  iss: 'https://accounts.google.com',
  aud: AUDIENCE,
  email: 'bandeja-ia-push@proyecto.iam.gserviceaccount.com',
  email_verified: true,
  iat: nowSeconds - 10,
  exp: nowSeconds + 3600,
}

test('acepta un token valido de la cuenta de servicio esperada', async () => {
  const { verifyPubSubJwt } = await import('./pubsub-auth.ts')
  const { privateKey, jwk } = await keyPair()

  const result = await verifyPubSubJwt(await sign(privateKey, validPayload), {
    audience: AUDIENCE,
    serviceAccountEmail: 'Bandeja-IA-Push@proyecto.iam.gserviceaccount.com',
    now: NOW,
    getKeys: async () => [jwk],
  })
  assert.deepEqual(result, { ok: true, email: 'bandeja-ia-push@proyecto.iam.gserviceaccount.com' })
})

test('rechaza audiencia, emisor, vencimiento y cuenta incorrectos', async () => {
  const { verifyPubSubJwt } = await import('./pubsub-auth.ts')
  const { privateKey, jwk } = await keyPair()
  const check = { audience: AUDIENCE, serviceAccountEmail: validPayload.email, now: NOW, getKeys: async () => [jwk] }

  const cases: [Record<string, unknown>, string][] = [
    [{ ...validPayload, aud: 'https://otro.example/push' }, 'Audiencia invalida'],
    [{ ...validPayload, iss: 'https://evil.example' }, 'Emisor invalido'],
    [{ ...validPayload, exp: nowSeconds - 3600 }, 'Token vencido'],
    [{ ...validPayload, email: 'otra@proyecto.iam.gserviceaccount.com' }, 'Cuenta de servicio no autorizada'],
    [{ ...validPayload, email_verified: false }, 'Cuenta de servicio no autorizada'],
  ]
  for (const [payload, reason] of cases) {
    assert.deepEqual(await verifyPubSubJwt(await sign(privateKey, payload), check), { ok: false, reason })
  }
})

test('rechaza firmas falsas, claves desconocidas y algoritmos distintos de RS256', async () => {
  const { verifyPubSubJwt } = await import('./pubsub-auth.ts')
  const real = await keyPair()
  const attacker = await keyPair()
  const check = { audience: AUDIENCE, now: NOW, getKeys: async () => [real.jwk] }

  assert.deepEqual(await verifyPubSubJwt(await sign(attacker.privateKey, validPayload), check), { ok: false, reason: 'Firma invalida' })
  assert.deepEqual(await verifyPubSubJwt(await sign(real.privateKey, validPayload, { alg: 'RS256', kid: 'otra' }), check), { ok: false, reason: 'Clave desconocida' })
  assert.deepEqual(await verifyPubSubJwt(await sign(real.privateKey, validPayload, { alg: 'none', kid: 'clave-1' }), check), { ok: false, reason: 'Algoritmo no permitido' })
  assert.deepEqual(await verifyPubSubJwt('no.es.unjwt', check), { ok: false, reason: 'Token mal formado' })
  assert.deepEqual(await verifyPubSubJwt(null, check), { ok: false, reason: 'Falta el token' })
})

test('lee el token del encabezado Authorization', async () => {
  const { bearerToken } = await import('./pubsub-auth.ts')

  assert.equal(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.equal(bearerToken('bearer   xyz'), 'xyz')
  assert.equal(bearerToken('Basic abc'), null)
  assert.equal(bearerToken(null), null)
})
