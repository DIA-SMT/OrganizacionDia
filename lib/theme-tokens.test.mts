import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('define los tokens visuales en ambos temas', () => {
  const tokens = [
    '--dia-bg',
    '--dia-surface',
    '--dia-surface-raised',
    '--dia-border',
    '--dia-primary',
    '--dia-violet',
    '--dia-coral',
    '--dia-text',
    '--dia-muted',
  ]

  for (const token of tokens) {
    assert.equal(css.match(new RegExp(`${token}:`, 'g'))?.length, 2, `${token} debe existir en claro y oscuro`)
  }

  assert.match(css, /\.dark\s*\{/)
})

test('incluye superficies y controles reutilizables', () => {
  assert.match(css, /\.dia-surface\s*\{/)
  assert.match(css, /\.dia-control\s*\{/)
  assert.match(css, /\.dia-primary-action\s*\{/)
})
