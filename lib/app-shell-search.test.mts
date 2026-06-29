import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/app-shell.tsx', import.meta.url), 'utf8')

test('la busqueda actualiza al padre solo desde el evento del input', () => {
  assert.doesNotMatch(source, /setTimeout\(\(\) => onSearchChange\(localSearch\)/)
  assert.match(source, /value=\{search\}/)
  assert.match(source, /onChange=\{\(event\) => onSearchChange\(event\.target\.value\)\}/)
})
