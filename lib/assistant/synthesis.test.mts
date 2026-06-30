import assert from 'node:assert/strict'
import test from 'node:test'

test('mantiene la evidencia cuando OpenRouter no esta configurado', async () => {
  const { synthesizeAssistantAnswer } = await import('./synthesis.ts')
  const answer = await synthesizeAssistantAnswer({ question: 'que paso', evidence: 'Dato verificado', apiKey: '' })
  assert.equal(answer, 'Dato verificado')
})

test('envia solamente pregunta, evidencia y fuentes a OpenRouter', async () => {
  const { synthesizeAssistantAnswer } = await import('./synthesis.ts')
  const originalFetch = globalThis.fetch
  let requestBody = ''
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body ?? '')
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Respuesta sintetizada' } }] }), { status: 200 })
  }

  try {
    const answer = await synthesizeAssistantAnswer({
      question: 'ultimos commits',
      evidence: 'Commit real',
      sources: ['GitHub'],
      apiKey: 'test-key',
    })
    assert.equal(answer, 'Respuesta sintetizada')
    assert.match(requestBody, /ultimos commits/)
    assert.match(requestBody, /Commit real/)
    assert.match(requestBody, /GitHub/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
