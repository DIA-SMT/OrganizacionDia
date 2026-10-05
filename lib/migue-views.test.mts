import assert from 'node:assert/strict'
import test from 'node:test'

type Raster = { data: Uint8ClampedArray; width: number; height: number }
const BG = [248, 248, 248]

function sheet(width: number, height: number, background = BG): Raster {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let k = 0; k < width * height; k++) data.set([...background, 255], k * 4)
  return { data, width, height }
}
function rect(img: Raster, x: number, y: number, w: number, h: number, color: number[], alpha = 255) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.data.set([...color, alpha], (yy * img.width + xx) * 4)
}
function circle(img: Raster, cx: number, cy: number, r: number, color: number[]) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.data.set([...color, 255], (y * img.width + x) * 4)
}
// Un muñequito de 120 px: cabeza, torso, dos piernas separadas y zapatillas.
function person(img: Raster, x: number, y: number) {
  circle(img, x + 20, y + 14, 13, [224, 172, 140])
  rect(img, x + 4, y + 28, 32, 42, [40, 70, 120])
  rect(img, x + 6, y + 70, 11, 42, [190, 160, 110])
  rect(img, x + 23, y + 70, 11, 42, [190, 160, 110])
  rect(img, x + 3, y + 112, 15, 8, [70, 60, 55])
  rect(img, x + 22, y + 112, 15, 8, [70, 60, 55])
}
// La lamina de 8 vistas en chico: dos filas de 4, con la regla y el rotulo debajo de cada figura.
function eightViews(): Raster {
  const img = sheet(480, 320)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 30 + col * 115
      const y = 10 + row * 155
      person(img, x, y)
      rect(img, x - 15, y + 128, 70, 1, [205, 205, 205])
      for (let letter = 0; letter < 5; letter++) rect(img, x + letter * 7, y + 135, 4, 6, [60, 60, 60])
    }
  }
  return img
}

test('encuentra las 8 figuras de la lamina en orden de lectura, sin reglas ni rotulos', async () => {
  const { findFigures } = await import('./migue-views.ts')
  const found = findFigures(eightViews())
  assert.deepEqual(found.rows, [4, 4])
  assert.equal(found.boxes.length, 8)
  assert.equal(found.transparent, false)
  for (const [index, box] of found.boxes.entries()) {
    const row = Math.floor(index / 4)
    const col = index % 4
    const figureX = 30 + col * 115
    const figureY = 10 + row * 155
    assert.ok(box.x <= figureX + 3 && box.x + box.w >= figureX + 37, `caja ${index} cubre la figura en x: ${JSON.stringify(box)}`)
    assert.ok(box.y <= figureY + 1 && box.y + box.h >= figureY + 118, `caja ${index} cubre la figura en y: ${JSON.stringify(box)}`)
    assert.ok(box.y + box.h <= figureY + 128 + 4, `caja ${index} no llega al rotulo: ${JSON.stringify(box)}`)
  }
  // La copia de trabajo ya no tiene la regla ni el rotulo.
  const k = ((10 + 128) * 480 + 50) * 4
  assert.deepEqual([...found.clean.data.slice(k, k + 3)], BG)
  const letter = ((10 + 137) * 480 + 31) * 4
  assert.deepEqual([...found.clean.data.slice(letter, letter + 3)], BG)
})

test('quita el fondo de una figura, incluido el hueco entre las piernas', async () => {
  const { crop, findFigures, matteFigure, paddedBox } = await import('./migue-views.ts')
  const img = eightViews()
  const found = findFigures(img)
  const box = paddedBox(found.boxes[0], found.boxes, img.width, img.height)
  const view = matteFigure(crop(found.clean, box))
  const alphaAt = (x: number, y: number) => view.raster.data[((y - box.y) * view.raster.width + (x - box.x)) * 4 + 3]
  assert.equal(alphaAt(box.x, box.y), 0, 'esquina transparente')
  assert.equal(alphaAt(30 + 20, 10 + 45), 255, 'torso opaco')
  assert.equal(alphaAt(30 + 20, 10 + 95), 0, 'entre las piernas se ve el escenario')
  assert.equal(alphaAt(30 + 11, 10 + 95), 255, 'pierna opaca')
  assert.ok(view.bottom - view.top >= 110, 'mide la figura entera')
  assert.ok(Math.abs(view.cx - (30 + 20 - box.x)) <= 3, `centrada entre las piernas: ${view.cx}`)
})

test('una prenda clara y ancha no se toma por un hueco del fondo', async () => {
  const { matteFigure } = await import('./migue-views.ts')
  const img = sheet(120, 160)
  person(img, 40, 20)
  // Un guardapolvo casi del color del fondo, con un borde que lo separa.
  rect(img, 40, 46, 40, 46, [215, 215, 215])
  rect(img, 42, 48, 36, 42, [246, 246, 246])
  const view = matteFigure(img)
  const alpha = view.raster.data[(70 * 120 + 60) * 4 + 3]
  assert.equal(alpha, 255)
})

test('arma las vistas del mismo tamaño, centradas y con los pies en la misma linea', async () => {
  const { composeFrames, crop, findFigures, matteFigure, paddedBox } = await import('./migue-views.ts')
  const img = eightViews()
  const found = findFigures(img)
  const views = found.boxes.slice(0, 4).map((box) => matteFigure(crop(found.clean, paddedBox(box, found.boxes, img.width, img.height))))
  const frames = composeFrames(views)
  assert.equal(frames.length, 4)
  assert.ok(frames.every((frame) => frame.width === frames[0].width && frame.height === frames[0].height))
  const lastOpaqueRow = (frame: Raster) => {
    for (let y = frame.height - 1; y >= 0; y--) for (let x = 0; x < frame.width; x++) if (frame.data[(y * frame.width + x) * 4 + 3] > 200) return y
    return -1
  }
  const feet = frames.map(lastOpaqueRow)
  assert.ok(Math.max(...feet) - Math.min(...feet) <= 1, `pies alineados: ${feet}`)
})

test('un fondo con grano no congela la busqueda: no hay figuras que separar', async () => {
  const { findFigures } = await import('./migue-views.ts')
  const img = sheet(1024, 1024)
  // Un punto oscuro cada 7 pixeles: miles de motas sueltas.
  for (let y = 3; y < 1024; y += 7) for (let x = 3; x < 1024; x += 7) rect(img, x, y, 2, 2, [120, 120, 120])
  const t0 = Date.now()
  const found = findFigures(img)
  assert.ok(Date.now() - t0 < 3000, `tardo ${Date.now() - t0} ms`)
  assert.equal(found.boxes.length, 0)
})

test('una imagen ya transparente se usa tal cual', async () => {
  const { findFigures, matteFigure, crop, paddedBox } = await import('./migue-views.ts')
  const img = sheet(100, 160, [0, 0, 0])
  for (let k = 0; k < 100 * 160; k++) img.data[k * 4 + 3] = 0
  person(img, 30, 20)
  const found = findFigures(img)
  assert.equal(found.transparent, true)
  assert.equal(found.boxes.length, 1)
  const box = paddedBox(found.boxes[0], found.boxes, 100, 160)
  const view = matteFigure(crop(found.clean, box), true)
  assert.equal(view.raster.data[((20 + 45 - box.y) * view.raster.width + (50 - box.x)) * 4 + 3], 255)
  assert.ok(view.bottom - view.top >= 110)
})

test('elige frente, perfiles y espalda segun la lamina o los nombres de archivo', async () => {
  const { angleFromName, defaultSlots } = await import('./migue-views.ts')
  // La lamina de 8 vistas (frente, lateral derecha, espalda, lateral izquierda arriba).
  assert.deepEqual(defaultSlots([4, 4]), [0, 1, 2, 3])
  // Las laminas de una fila de 4: frente, derecha, izquierda, espalda.
  assert.deepEqual(defaultSlots([4]), [0, 1, 3, 2])
  assert.deepEqual(defaultSlots([3, 3]), [0, null, null, null])
  assert.deepEqual(defaultSlots([1]), [0, null, null, null])
  assert.deepEqual(defaultSlots([0]), [null, null, null, null])
  const names = ['01-frente-000.png', '02-tres-cuartos-045.png', '03-perfil-090.png', '04-espalda-tres-cuartos-135.png', '05-espalda-180.png', '06-espalda-tres-cuartos-225.png', '07-perfil-270.png', '08-tres-cuartos-315.png']
  const angles = names.map(angleFromName)
  assert.deepEqual(angles, [0, 45, 90, 135, 180, 225, 270, 315])
  assert.deepEqual(defaultSlots([8], angles), [0, 2, 4, 6])
  assert.equal(angleFromName('Migue frente.jpg'), 0)
  assert.equal(angleFromName('lateral izquierda.png'), 270)
  assert.equal(angleFromName('diagonal frente derecha.png'), null)
  assert.equal(angleFromName('foto.png'), null)
  // Diagonales y numeros de camara no son perfiles.
  assert.equal(angleFromName('espalda-tres-cuartos-derecha.png'), null)
  assert.equal(angleFromName('tres-cuartos-izquierda.png'), null)
  assert.equal(angleFromName('IMG_090.jpg'), null)
  assert.equal(angleFromName('DSC_180.JPG'), null)
  assert.equal(angleFromName('copyright.png'), null)
  assert.equal(angleFromName('migue-sin-background.png'), null)
  assert.equal(angleFromName('lateral-derecha.png'), 90)
  assert.equal(angleFromName('perfil_270.webp'), 270)
})
