import assert from 'node:assert/strict'
import test from 'node:test'

const asunto = {
  id: 'a1',
  classification: { priority: 'critica' as const, category: 'fecha_limite' as const, reasons: [], detectedDates: [], requiresResponse: true },
}

const enabled = { gmailEnabled: true, alertsEnabled: true, telegramEnabled: true }

test('la alerta no incluye remitente, asunto ni extracto', async () => {
  const { buildSafeNotification, telegramText } = await import('./notifications.ts')

  const sensitive = {
    ...asunto,
    title: 'URGENTE: informe reservado para la Intendencia',
    summary: 'Pedido confidencial de datos',
    message: { fromName: 'Despacho Ejemplo', fromAddress: 'despacho@organismo.example', snippet: 'Remitir antes del viernes' },
  }
  const notification = buildSafeNotification(sensitive, 'nuevo_importante', 'telegram')
  const text = telegramText(notification, 'https://dashboard.example/')

  for (const value of [sensitive.title, sensitive.summary, sensitive.message.fromName, sensitive.message.fromAddress, sensitive.message.snippet]) {
    assert.equal(text.includes(value), false, `no debe filtrar: ${value}`)
  }
  assert.match(text, /https:\/\/dashboard\.example\/bandeja-ia\/asunto\/a1$/)
})

test('nada se envia mientras la integracion este deshabilitada', async () => {
  const { buildSafeNotification, shouldDispatch } = await import('./notifications.ts')

  const notification = buildSafeNotification(asunto, 'nuevo_importante', 'dashboard')
  assert.equal(shouldDispatch(notification, { ...enabled, gmailEnabled: false }).send, false)
  assert.equal(shouldDispatch(notification, { ...enabled, alertsEnabled: false }).send, false)
  assert.equal(shouldDispatch(buildSafeNotification(asunto, 'nuevo_importante', 'telegram'), { ...enabled, telegramEnabled: false }).send, false)
  assert.equal(shouldDispatch(notification, enabled).send, true)
})

test('lo normal o informativo no genera alerta de nuevo asunto', async () => {
  const { buildSafeNotification, shouldDispatch } = await import('./notifications.ts')

  const normal = { ...asunto, classification: { ...asunto.classification, priority: 'normal' as const } }
  assert.equal(shouldDispatch(buildSafeNotification(normal, 'nuevo_importante', 'dashboard'), enabled).send, false)
  assert.equal(shouldDispatch(buildSafeNotification(normal, 'vencimiento', 'dashboard'), enabled).send, true)
})

test('la clave de deduplicacion es estable por asunto, tipo y canal', async () => {
  const { buildSafeNotification } = await import('./notifications.ts')

  assert.equal(buildSafeNotification(asunto, 'vencimiento', 'telegram').dedupeKey, 'vencimiento:a1:telegram')
})
