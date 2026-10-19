import assert from 'node:assert/strict'
import test from 'node:test'

const b64 = (text: string, encoding: BufferEncoding = 'utf8') => Buffer.from(text, encoding).toString('base64url')
const MAILBOX = 'direccionia@smt.gob.ar'

test('elige el HTML, lista adjuntos y separa las imagenes incrustadas', async () => {
  const { parseMessage } = await import('./message-body.ts')

  const parsed = parseMessage(
    {
      id: 'm1',
      threadId: 't1',
      internalDate: String(Date.parse('2026-10-19T12:00:00Z')),
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'Mesa <mesa@municipio.example>' },
          { name: 'To', value: MAILBOX },
          { name: 'Subject', value: 'Nota' },
        ],
        parts: [
          {
            mimeType: 'multipart/related',
            parts: [
              {
                mimeType: 'multipart/alternative',
                parts: [
                  { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=UTF-8' }], body: { data: b64('Hola en texto') } },
                  { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=UTF-8' }], body: { data: b64('<p>Hola <b>HTML</b> ñandú</p><img src="cid:logo@x">') } },
                ],
              },
              { mimeType: 'image/png', filename: 'logo.png', headers: [{ name: 'Content-ID', value: '<logo@x>' }, { name: 'Content-Disposition', value: 'inline' }], body: { size: 1200, attachmentId: 'att-logo' } },
            ],
          },
          { mimeType: 'application/pdf', filename: 'nota.pdf', headers: [{ name: 'Content-Disposition', value: 'attachment; filename="nota.pdf"' }], body: { size: 52000, attachmentId: 'att-pdf' } },
        ],
      },
    },
    MAILBOX,
  )

  assert.equal(parsed.from, 'Mesa <mesa@municipio.example>')
  assert.equal(parsed.subject, 'Nota')
  assert.equal(parsed.date, '2026-10-19T12:00:00.000Z')
  assert.equal(parsed.html, '<p>Hola <b>HTML</b> ñandú</p><img src="cid:logo@x">')
  assert.equal(parsed.text, 'Hola en texto')
  assert.deepEqual(parsed.attachments, [{ filename: 'nota.pdf', mimeType: 'application/pdf', size: 52000 }])
  assert.deepEqual(parsed.inline, [{ contentId: 'logo@x', mimeType: 'image/png', size: 1200, data: null, attachmentId: 'att-logo' }])
  assert.equal(parsed.sentByMailbox, false)
})

test('respeta el charset original (ISO-8859-1) y marca lo enviado desde la casilla', async () => {
  const { parseMessage } = await import('./message-body.ts')

  const parsed = parseMessage(
    {
      id: 'm2',
      threadId: 't1',
      labelIds: ['SENT'],
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: `DIA <${MAILBOX}>` },
          { name: 'Content-Type', value: 'text/plain; charset="ISO-8859-1"' },
        ],
        body: { data: b64('Atención: reunión mañana', 'latin1') },
      },
    },
    MAILBOX,
  )

  assert.equal(parsed.text, 'Atención: reunión mañana')
  assert.equal(parsed.html, null)
  assert.equal(parsed.subject, '(sin asunto)')
  assert.equal(parsed.sentByMailbox, true)
})

test('reemplaza las referencias cid: por data: y anula las que no se pudieron traer', async () => {
  const { replaceCidReferences } = await import('./message-body.ts')

  const html = `<img src="cid:logo@x"><img src='cid:firma'><div style="background:url(cid:fondo)"></div>`
  const out = replaceCidReferences(html, new Map([['logo@x', 'data:image/png;base64,AAA']]))
  assert.equal(out, `<img src="data:image/png;base64,AAA"><img src='data:,'><div style="background:url(data:,)"></div>`)
})

test('arma un documento aislado: sin scripts ni redirecciones, links en otra pestana', async () => {
  const { buildEmailDocument } = await import('./message-body.ts')

  const html = `<html><head><style>.a{color:red}</style><meta http-equiv="refresh" content="0;url=https://evil.example"></head><body onload="x()"><p class="a">Hola</p><script>alert(1)</script><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input></form><img src="https://tracker.example/p.gif"></body></html>`
  const blocked = buildEmailDocument(html, { allowRemoteImages: false })

  assert.equal(blocked.includes('<script'), false)
  assert.equal(blocked.includes('evil.example'), false)
  assert.equal(blocked.includes('http-equiv="refresh"'), false)
  assert.match(blocked, /<base target="_blank">/)
  assert.match(blocked, /\.a\{color:red\}/)
  assert.match(blocked, /img-src data:;/)
  assert.match(blocked, /<p class="a">Hola<\/p>/)

  const allowed = buildEmailDocument(html, { allowRemoteImages: true })
  assert.match(allowed, /img-src data: https: http:;/)
})

test('el enlace abre la conversacion en la cuenta de la casilla', async () => {
  const { gmailThreadUrl } = await import('./message-body.ts')

  assert.equal(gmailThreadUrl(MAILBOX, '1a1540abc'), 'https://mail.google.com/mail/?authuser=direccionia%40smt.gob.ar#all/1a1540abc')
})
