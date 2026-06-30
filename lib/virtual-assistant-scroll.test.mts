import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/virtual-assistant.tsx', import.meta.url), 'utf8')

test('el chatbot contiene el scroll y queda fuera de Lenis', () => {
  assert.match(source, /data-lenis-prevent/)
  assert.match(source, /min-h-0/)
  assert.match(source, /overscroll-contain/)
})
