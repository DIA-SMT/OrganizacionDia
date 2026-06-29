import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/projects-screen.tsx', import.meta.url), 'utf8')

test('el modal de proyecto contiene el scroll y bloquea el fondo', () => {
  assert.match(source, /data-lenis-prevent/)
  assert.match(source, /overscroll-contain/)
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(source, /document\.body\.style\.overflow = previousOverflow/)
})
