import assert from 'node:assert/strict'
import test from 'node:test'

const PREFIX = 'https://abc.supabase.co/storage/v1/object/public/migue-assets/'

const base = {
  slug: 'migue-transito',
  name: 'Migue Transito',
  look: 'Chaleco y silbato',
  project_name: 'App de Transito',
  area: 'Movilidad',
  description: 'Responde sobre cortes de calle.',
  channels: ['WhatsApp', 'Web'],
  llm_model: 'OpenRouter',
  status: 'Piloto',
  accent: '#AABBCC',
}

test('arma el identificador a partir del nombre', async () => {
  const { slugify } = await import('./migue-profiles.ts')
  assert.equal(slugify('Migue Ciudadanía 2'), 'migue-ciudadania-2')
  assert.equal(slugify('  ¡Migue  Tránsito!  '), 'migue-transito')
  assert.equal(slugify('Ñandú & Cía.'), 'nandu-cia')
  assert.equal(slugify('x'.repeat(30) + ' ' + 'y'.repeat(30)).length <= 40, true)
  assert.ok(!slugify('a'.repeat(39) + ' b').endsWith('-'))
})

test('valida la ficha y normaliza lo que se guarda', async () => {
  const { validateMigueProfile } = await import('./migue-profiles.ts')
  const checked = validateMigueProfile({ ...base, name: '  Migue   Transito ' }, { creating: true, takenSlugs: ['turismo'] })
  assert.ok(checked.ok)
  if (!checked.ok) return
  assert.equal(checked.profile.name, 'Migue Transito')
  assert.equal(checked.profile.accent, '#aabbcc')
  assert.deepEqual(checked.profile.channels, ['WhatsApp', 'Web'])
  assert.equal(checked.profile.active, true)
})

test('rechaza lo que romperia la ficha o la base', async () => {
  const { validateMigueProfile } = await import('./migue-profiles.ts')
  const errorsOf = (input: Record<string, unknown>, creating = true) => {
    const checked = validateMigueProfile({ ...base, ...input }, { creating, takenSlugs: ['turismo', 'migue-transito-2'] })
    return checked.ok ? {} : checked.errors
  }
  assert.ok(errorsOf({ slug: 'Migue Transito' }).slug)
  assert.ok(errorsOf({ slug: 'migue--transito' }).slug)
  assert.ok(errorsOf({ slug: '-migue' }).slug)
  assert.ok(errorsOf({ slug: 'turismo' }).slug, 'al crear no se puede repetir')
  assert.equal(errorsOf({ slug: 'turismo' }, false).slug, undefined, 'al editar es el propio')
  assert.ok(errorsOf({ name: ' ' }).name)
  assert.ok(errorsOf({ project_name: '' }).project_name)
  assert.ok(errorsOf({ description: 'x'.repeat(241) }).description)
  assert.ok(errorsOf({ channels: ['WhatsApp', 'Fax'] }).channels)
  assert.ok(errorsOf({ status: 'Retirado' }).status)
  assert.ok(errorsOf({ accent: 'red' }).accent)
  assert.deepEqual(errorsOf({}), {})
})

test('cuenta caracteres como la base: un emoji es uno solo', async () => {
  const { validateMigueProfile } = await import('./migue-profiles.ts')
  const ok = (input: Record<string, unknown>) => validateMigueProfile({ ...base, ...input }, { creating: true, takenSlugs: [] }).ok
  assert.equal(ok({ name: '🤖' }), false, 'un emoji solo no alcanza el minimo de 2')
  assert.equal(ok({ name: '🤖 M' }), true)
  assert.equal(ok({ description: '🌳'.repeat(240) }), true, '240 emojis entran en char_length <= 240')
  assert.equal(ok({ description: '🌳'.repeat(241) }), false)
})

test('el catalogo del codigo queda como base; las filas lo pisan, lo ocultan o suman', async () => {
  const { MIGUES } = await import('./migue.ts')
  const { mergeMigueCatalog, PLACEHOLDER_FRAME } = await import('./migue-profiles.ts')
  const row = (extra: Record<string, unknown>) => ({ ...base, poster_url: null, model_url: null, active: true, ...extra }) as never
  const merged = mergeMigueCatalog(
    MIGUES,
    [
      row({ slug: 'turismo', name: 'Migue Viajero', description: 'Otra descripcion' }),
      row({ slug: 'carteleria', active: false }),
      row({ slug: 'migue-transito', poster_url: `${PREFIX}migue-transito/1-portada.webp`, model_url: `${PREFIX}migue-transito/1-modelo.glb` }),
      row({ slug: 'migue-oculto', active: false }),
      row({ slug: 'migue-ajeno', poster_url: 'https://otro-sitio.com/a.webp', model_url: 'https://otro-sitio.com/a.glb' }),
    ],
    PREFIX,
  )
  const bySlug = new Map(merged.map((migue) => [migue.slug, migue]))
  assert.equal(merged.length, MIGUES.length - 1 + 2)
  // Editado: toma el texto de la fila y conserva las vistas y el modelo del repo.
  const turismo = bySlug.get('turismo')
  assert.equal(turismo?.name, 'Migue Viajero')
  assert.deepEqual(turismo?.frames, MIGUES.find((migue) => migue.slug === 'turismo')?.frames)
  assert.equal(turismo?.model, '/migue/turismo/model.glb')
  // Oculto.
  assert.equal(bySlug.has('carteleria'), false)
  assert.equal(bySlug.has('migue-oculto'), false)
  // Nuevo, al final, con sus archivos.
  assert.equal(merged.at(-2)?.slug, 'migue-transito')
  assert.deepEqual(bySlug.get('migue-transito')?.frames, [`${PREFIX}migue-transito/1-portada.webp`])
  assert.equal(bySlug.get('migue-transito')?.model, `${PREFIX}migue-transito/1-modelo.glb`)
  // Un archivo de otro sitio no se carga.
  assert.deepEqual(bySlug.get('migue-ajeno')?.frames, [PLACEHOLDER_FRAME])
  assert.equal(bySlug.get('migue-ajeno')?.model, undefined)
  // El Migue interno sigue siendolo aunque se edite.
  const dia = mergeMigueCatalog(MIGUES, [row({ slug: 'dashboard-dia', name: 'Migue DIA 2' })], PREFIX).find((migue) => migue.slug === 'dashboard-dia')
  assert.equal(dia?.internal, true)
  assert.equal(dia?.name, 'Migue DIA 2')
})

test('una fila con datos raros no rompe la pantalla', async () => {
  const { MIGUES } = await import('./migue.ts')
  const { mergeMigueCatalog, DEFAULT_ACCENT } = await import('./migue-profiles.ts')
  const [nuevo] = mergeMigueCatalog(
    [],
    [{ ...base, slug: 'migue-x', status: 'Otro', accent: 'rojo', channels: ['Fax', 'Web'], poster_url: null, model_url: null, active: true }],
    null,
  )
  assert.equal(nuevo.status, 'En desarrollo')
  assert.equal(nuevo.accent, DEFAULT_ACCENT)
  assert.deepEqual(nuevo.channels, ['Web'])
  // Sin filas (tabla vacia o sin migrar) queda exactamente el catalogo del codigo.
  assert.deepEqual(mergeMigueCatalog(MIGUES, [], PREFIX), MIGUES)
})

test('reconoce un GLB y arma rutas unicas en el bucket', async () => {
  const { assetPath, assetsPrefixFor, isGlb } = await import('./migue-profiles.ts')
  assert.equal(isGlb(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])), true)
  assert.equal(isGlb(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 0, 0, 0])), false)
  assert.equal(isGlb(new TextEncoder().encode('{"asset":')), false)
  assert.equal(assetPath('migue-x', 'poster', 5), 'migue-x/5-portada.webp')
  assert.equal(assetPath('migue-x', 'poster', 5, 'image/png'), 'migue-x/5-portada.png')
  assert.equal(assetPath('migue-x', 'model', 5), 'migue-x/5-modelo.glb')
  assert.equal(assetsPrefixFor('https://abc.supabase.co/'), PREFIX)
  assert.equal(assetsPrefixFor(undefined), null)
})

test('la clave de un Migue tiene el formato del script y su hash coincide', async () => {
  const { generateIngestToken, hashIngestToken } = await import('./migue-ingest.ts')
  const { createHash } = await import('node:crypto')
  const token = generateIngestToken()
  assert.match(token, /^migue_[A-Za-z0-9_-]{43}$/)
  assert.notEqual(token, generateIngestToken())
  assert.equal(await hashIngestToken(token), createHash('sha256').update(token).digest('hex'))
})
