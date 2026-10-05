// Vistas de un Migue a partir de las imagenes que entrega el generador: una lamina con varias
// figuras (la de 8 vistas: frente, laterales, espalda y diagonales), las vistas sueltas o una sola
// foto. Encuentra cada figura, le quita el fondo liso y arma las 4 vistas del giro (frente, mira a
// la derecha, espalda, mira a la izquierda) con la misma escala y los pies en la misma linea.
// Puro: trabaja sobre pixeles RGBA. El navegador los saca de un canvas; los tests, de sharp.

export type Raster = { data: Uint8ClampedArray; width: number; height: number }
export type Box = { x: number; y: number; w: number; h: number }
// Una figura recortada, con fondo transparente. top/bottom: primera y ultima fila de la figura
// (sin la sombra); cx: centro horizontal entre las piernas.
export type MattedView = { raster: Raster; top: number; bottom: number; cx: number }

// Orden de las vistas del giro en lib/migue.ts (MIGUE_VIEW_LABELS).
export const VIEW_SLOTS = ['Frente', 'Perfil derecho', 'Espalda', 'Perfil izquierdo'] as const

const N4: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const N8: Array<[number, number]> = [...N4, [1, 1], [-1, -1], [1, -1], [-1, 1]]

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1] ?? 0
}

export function makeRaster(width: number, height: number): Raster {
  return { data: new Uint8ClampedArray(width * height * 4), width, height }
}

// ---------------------------------------------------------------------------------------------
// 1) Encontrar las figuras

// Si el borde es transparente, la imagen ya viene recortada: alcanza con su canal alfa.
function hasTransparentBorder(img: Raster): boolean {
  const { data, width, height } = img
  let transparent = 0
  let total = 0
  const look = (x: number, y: number) => {
    total += 1
    if (data[(y * width + x) * 4 + 3] < 16) transparent += 1
  }
  for (let x = 0; x < width; x += 3) {
    look(x, 0)
    look(x, height - 1)
  }
  for (let y = 0; y < height; y += 3) {
    look(0, y)
    look(width - 1, y)
  }
  return transparent / Math.max(1, total) > 0.5
}

// Color de fondo: la mediana del borde de la imagen.
function borderColor(img: Raster): [number, number, number] {
  const { data, width, height } = img
  const r: number[] = []
  const g: number[] = []
  const b: number[] = []
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4
    r.push(data[i])
    g.push(data[i + 1])
    b.push(data[i + 2])
  }
  for (let x = 0; x < width; x += 2) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 2) {
    push(0, y)
    push(width - 1, y)
  }
  return [median(r), median(g), median(b)]
}

// Las laminas traen una linea fina debajo de cada figura (y el rotulo). La linea se pinta del
// color del fondo (o se vuelve transparente): si quedara, saldria en la vista.
function eraseRuledLines(img: Raster, fg: Uint8Array, background: [number, number, number], transparent: boolean) {
  const { width, height, data } = img
  // Alto de cada tramo vertical de primer plano que pasa por cada pixel.
  const vertical = new Uint16Array(width * height)
  for (let x = 0; x < width; x++) {
    let y = 0
    while (y < height) {
      if (!fg[y * width + x]) {
        y += 1
        continue
      }
      let end = y
      while (end < height && fg[end * width + x]) end += 1
      for (let k = y; k < end; k++) vertical[k * width + x] = end - y
      y = end
    }
  }
  for (let y = 0; y < height; y++) {
    // Una fila que es en buena parte linea fina (las reglas debajo de las figuras de una fila de la
    // lamina): se borra entera, incluidos los tramos cortos que quedan junto a los pies. Un objeto
    // fino de una figura (un baston, un cinturon) no llega a ocupar tanto ancho.
    let thin = 0
    for (let x = 0; x < width; x++) if (fg[y * width + x] && vertical[y * width + x] <= 4) thin += 1
    if (thin < width * 0.35) continue
    for (let x = 0; x < width; x++) {
      const kk = y * width + x
      if (!fg[kk] || vertical[kk] > 4) continue
      fg[kk] = 0
      erasePixel(data, kk, background, transparent)
    }
  }
}

function erasePixel(data: Uint8ClampedArray, k: number, background: [number, number, number], transparent: boolean) {
  if (transparent) {
    data[k * 4 + 3] = 0
    return
  }
  data[k * 4] = background[0]
  data[k * 4 + 1] = background[1]
  data[k * 4 + 2] = background[2]
}

function maxOf(values: Iterable<number>): number {
  let max = 0
  for (const value of values) if (value > max) max = value
  return max
}

type Component = { x0: number; y0: number; x1: number; y1: number; count: number }

function components(mask: Uint8Array, width: number, height: number): Component[] {
  const label = new Int32Array(width * height).fill(-1)
  const found: Component[] = []
  const stack: number[] = []
  for (let start = 0; start < width * height; start++) {
    if (!mask[start] || label[start] >= 0) continue
    const id = found.length
    const comp: Component = { x0: width, y0: height, x1: 0, y1: 0, count: 0 }
    label[start] = id
    stack.push(start)
    while (stack.length) {
      const k = stack.pop() as number
      const x = k % width
      const y = (k / width) | 0
      comp.count += 1
      if (x < comp.x0) comp.x0 = x
      if (x > comp.x1) comp.x1 = x
      if (y < comp.y0) comp.y0 = y
      if (y > comp.y1) comp.y1 = y
      for (const [dx, dy] of N8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const nk = ny * width + nx
        if (!mask[nk] || label[nk] >= 0) continue
        label[nk] = id
        stack.push(nk)
      }
    }
    found.push(comp)
  }
  return found
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1)

export type FoundFigures = {
  // En orden de lectura: por filas, de izquierda a derecha.
  boxes: Box[]
  // Cuantas figuras hay en cada fila (la lamina de 8 vistas: [4, 4]).
  rows: number[]
  // Copia de la imagen sin las lineas de la lamina: de aca se recortan las vistas.
  clean: Raster
  transparent: boolean
}

export function findFigures(img: Raster): FoundFigures {
  const { width, height } = img
  const clean: Raster = { data: new Uint8ClampedArray(img.data), width, height }
  const transparent = hasTransparentBorder(img)
  const background = borderColor(img)
  const fg = new Uint8Array(width * height)
  for (let k = 0; k < width * height; k++) {
    const i = k * 4
    if (transparent) fg[k] = img.data[i + 3] > 24 ? 1 : 0
    else {
      const d = Math.max(Math.abs(img.data[i] - background[0]), Math.abs(img.data[i + 1] - background[1]), Math.abs(img.data[i + 2] - background[2]))
      fg[k] = d > 26 ? 1 : 0
    }
  }
  eraseRuledLines(clean, fg, background, transparent)

  // Se buscan las manchas en una version reducida (bloques de 4x4): mas rapido y une trazos finos.
  const block = 4
  const bw = Math.ceil(width / block)
  const bh = Math.ceil(height / block)
  const small = new Uint8Array(bw * bh)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (fg[y * width + x]) small[((y / block) | 0) * bw + ((x / block) | 0)] = 1
  }
  const all = components(small, bw, bh)
  // Las motas de uno o dos bloques no son parte de ninguna figura: se apartan (se borran al final)
  // y no entran a la union de partes, que compara todas contra todas.
  const specks = all.filter((c) => c.count < 3)
  let comps = all.filter((c) => c.count >= 3)
  // Un fondo con grano o lleno de detalles no es un fondo liso: no hay figuras que separar.
  if (comps.length > 3000) return { boxes: [], rows: [], clean, transparent }

  // Partes de una misma figura separadas por un tramo claro (un cinturon blanco): se unen las que
  // se superponen en horizontal y estan casi pegadas en vertical.
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        const a = comps[i]
        const b = comps[j]
        const narrow = Math.min(a.x1 - a.x0, b.x1 - b.x0) + 1
        const gap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)
        const tall = Math.max(a.y1 - a.y0, b.y1 - b.y0) + 1
        const short = Math.min(a.y1 - a.y0, b.y1 - b.y0) + 1
        // Un rotulo debajo de la figura es bajito: no se une aunque este cerca. Un zapato o una
        // parte separada por un tramo claro tiene algo de alto.
        const sizable = short >= tall * 0.05 || gap < 0
        if (overlap(a.x0, a.x1, b.x0, b.x1) >= narrow * 0.6 && gap <= Math.max(1, tall * 0.03) && sizable) {
          comps[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), count: a.count + b.count }
          comps.splice(j, 1)
          merged = true
          // La parte unida crecio: se vuelve a comparar con las que siguen.
          j = i
        }
      }
    }
  }

  // Figuras: las manchas altas. Rotulos, numeros y motas quedan afuera.
  const tallest = maxOf(comps.map((c) => c.y1 - c.y0 + 1))
  let figures = comps.filter((c) => c.y1 - c.y0 + 1 >= tallest * 0.45 && c.count >= 12)
  // Lo chico que cae dentro de la altura de una figura (un mechon suelto, un zapato) se le suma.
  comps = comps.filter((c) => !figures.includes(c))
  const attached = new Set<Component>()
  figures = figures.map((f) => {
    const out = { ...f }
    const fw = f.x1 - f.x0 + 1
    for (const c of comps) {
      if (attached.has(c)) continue
      const cx = (c.x0 + c.x1) / 2
      const inside = cx >= f.x0 - fw * 0.1 && cx <= f.x1 + fw * 0.1
      const vertical = overlap(c.y0, c.y1, f.y0, f.y1) >= (c.y1 - c.y0 + 1) * 0.5
      if (inside && vertical) {
        attached.add(c)
        out.x0 = Math.min(out.x0, c.x0)
        out.x1 = Math.max(out.x1, c.x1)
        out.y0 = Math.min(out.y0, c.y0)
        out.y1 = Math.max(out.y1, c.y1)
      }
    }
    return out
  })
  // El resto (rotulos, numeros, motas) se borra de la copia de trabajo: asi no aparece en el
  // recorte de una figura aunque el margen lo alcance.
  const insideFigure = (x: number, y: number) =>
    figures.some((f) => x >= f.x0 * block && x < (f.x1 + 1) * block && y >= f.y0 * block && y < (f.y1 + 1) * block)
  for (const c of [...comps, ...specks]) {
    if (attached.has(c)) continue
    for (let y = c.y0 * block; y < Math.min(height, (c.y1 + 1) * block); y++) {
      for (let x = c.x0 * block; x < Math.min(width, (c.x1 + 1) * block); x++) {
        const k = y * width + x
        if (!fg[k] || insideFigure(x, y)) continue
        erasePixel(clean.data, k, background, transparent)
      }
    }
  }

  // Orden de lectura: filas por superposicion vertical, cada fila de izquierda a derecha.
  figures.sort((a, b) => a.y0 - b.y0)
  const rows: Component[][] = []
  for (const f of figures) {
    const row = rows.find((r) => overlap(r[0].y0, r[0].y1, f.y0, f.y1) >= (Math.min(r[0].y1 - r[0].y0, f.y1 - f.y0) + 1) * 0.5)
    if (row) row.push(f)
    else rows.push([f])
  }
  for (const row of rows) row.sort((a, b) => a.x0 - b.x0)

  const boxes = rows.flat().map((c) => {
    const x = c.x0 * block
    const y = c.y0 * block
    return { x, y, w: Math.min(width, (c.x1 + 1) * block) - x, h: Math.min(height, (c.y1 + 1) * block) - y }
  })
  return { boxes, rows: rows.map((r) => r.length), clean, transparent }
}

// La caja de una figura con margen, sin pasarse de la imagen ni meterse en la de al lado.
export function paddedBox(box: Box, all: Box[], width: number, height: number): Box {
  const pad = Math.max(6, Math.round(box.h * 0.035))
  let x0 = Math.max(0, box.x - pad)
  let x1 = Math.min(width, box.x + box.w + pad)
  const y0 = Math.max(0, box.y - pad)
  const y1 = Math.min(height, box.y + box.h + pad)
  for (const other of all) {
    if (other === box || overlap(other.y, other.y + other.h, box.y, box.y + box.h) <= 0) continue
    if (other.x >= box.x + box.w) x1 = Math.min(x1, Math.max(box.x + box.w, Math.floor((box.x + box.w + other.x) / 2)))
    if (other.x + other.w <= box.x) x0 = Math.max(x0, Math.min(box.x, Math.ceil((other.x + other.w + box.x) / 2)))
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function crop(img: Raster, box: Box): Raster {
  const out = makeRaster(box.w, box.h)
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y + y) * img.width + box.x) * 4
    out.data.set(img.data.subarray(from, from + box.w * 4), y * box.w * 4)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// 2) Quitar el fondo de una figura

// Centro entre los bordes externos de las piernas (cae entre las dos), medido en las columnas que
// tambien tienen torso: un objeto bajo al costado no lo corre.
function legCenter(alpha: (x: number, y: number) => number, w: number, top: number, bottom: number): number {
  const torsoY = top + Math.round((bottom - top) * 0.4)
  const hasTorso = new Uint8Array(w)
  for (let y = torsoY - 3; y <= torsoY + 3; y++) for (let x = 0; x < w; x++) if (alpha(x, y) > 128) hasTorso[x] = 1
  const xs: number[] = []
  const legTop = bottom - Math.round((bottom - top) * 0.22)
  const legBottom = bottom - Math.round((bottom - top) * 0.08)
  for (let y = legTop; y <= legBottom; y++) for (let x = 0; x < w; x++) if (hasTorso[x] && alpha(x, y) > 128) xs.push(x)
  if (!xs.length) return w / 2
  xs.sort((a, b) => a - b)
  return (xs[Math.floor(xs.length * 0.03)] + xs[Math.floor(xs.length * 0.97)]) / 2
}

// Recorte que ya viene con transparencia: solo se miden sus limites.
function measureTransparent(img: Raster): MattedView {
  const { width: w, height: h, data } = img
  const alpha = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? data[(y * w + x) * 4 + 3] : 0)
  let top = h
  let bottom = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha(x, y) > 128) {
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (top > bottom) {
    top = 0
    bottom = h - 1
  }
  return { raster: { data: new Uint8ClampedArray(data), width: w, height: h }, top, bottom, cx: legCenter(alpha, w, top, bottom) }
}

// Fondo liso a transparente. Rellena desde el borde con una tolerancia estricta, abre los huecos
// encerrados (entre las piernas, bajo el brazo), convierte la sombra del piso en sombra real y
// suaviza el borde sin dejar el halo del color del fondo. Es el mismo proceso con el que se
// recortaron las vistas de public/migue.
export function matteFigure(img: Raster, transparent = false, tuning: { t1?: number; step?: number; tint?: number } = {}): MattedView {
  if (transparent) return measureTransparent(img)
  const { width: w, height: h, data } = img
  // Probadas sobre las laminas del generador: con mas tolerancia el relleno se mete en un
  // guardapolvo o unas zapatillas blancas; con menos quedan restos del fondo.
  const T1 = tuning.t1 ?? 8
  const rgb = (k: number, c: number) => data[k * 4 + c]

  const br: number[] = []
  const bgr: number[] = []
  const bb: number[] = []
  const push = (x: number, y: number) => {
    const k = y * w + x
    br.push(rgb(k, 0))
    bgr.push(rgb(k, 1))
    bb.push(rgb(k, 2))
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  const B = [median(br), median(bgr), median(bb)]
  const dist = (k: number) => Math.max(Math.abs(rgb(k, 0) - B[0]), Math.abs(rgb(k, 1) - B[1]), Math.abs(rgb(k, 2) - B[2]))
  // Diferencia de tono con el fondo, sin contar el brillo: una zapatilla o una remera crema sobre un
  // fondo gris casi del mismo claro se distinguen por el tono, no por la luminancia.
  const tint = (k: number) =>
    Math.max(
      Math.abs(rgb(k, 0) - rgb(k, 1) - (B[0] - B[1])),
      Math.abs(rgb(k, 1) - rgb(k, 2) - (B[1] - B[2])),
      Math.abs(rgb(k, 0) - rgb(k, 2) - (B[0] - B[2])),
    )
  const TINT = tuning.tint ?? 4
  const lum = (k: number) => (rgb(k, 0) + rgb(k, 1) + rgb(k, 2)) / 3
  const sat = (k: number) => Math.max(rgb(k, 0), rgb(k, 1), rgb(k, 2)) - Math.min(rgb(k, 0), rgb(k, 1), rgb(k, 2))

  // 0 figura, 1 fondo, 2 sombra del piso.
  const bgMask = new Uint8Array(w * h)
  const stack: number[] = []

  // 1) Relleno desde el borde con tolerancia estricta. Ademas de parecerse al fondo, cada paso tiene
  // que ser suave: el fondo cambia de a poco (un degrade) y el borde de una zapatilla blanca, aunque
  // sea casi del mismo color, da un salto. Sin esto el relleno se mete en lo blanco de la figura.
  const STEP = tuning.step ?? 3
  const smooth = (a: number, b: number) =>
    Math.abs(rgb(a, 0) - rgb(b, 0)) <= STEP && Math.abs(rgb(a, 1) - rgb(b, 1)) <= STEP && Math.abs(rgb(a, 2) - rgb(b, 2)) <= STEP
  const seed = (x: number, y: number) => {
    const k = y * w + x
    if (!bgMask[k] && dist(k) < T1 && tint(k) <= TINT) {
      bgMask[k] = 1
      stack.push(k)
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x, 0)
    seed(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    seed(0, y)
    seed(w - 1, y)
  }
  while (stack.length) {
    const k = stack.pop() as number
    const x = k % w
    const y = (k / w) | 0
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const nk = ny * w + nx
      if (!bgMask[nk] && dist(nk) < T1 && tint(nk) <= TINT && smooth(k, nk)) {
        bgMask[nk] = 1
        stack.push(nk)
      }
    }
  }

  // Limites de la figura (sin la sombra suave).
  let top = h
  let bottom = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (!bgMask[k] && (dist(k) > 40 || sat(k) > 30)) {
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (top >= bottom) return measureTransparent(img)

  // Color de fondo por fila (el piso suele tener un degrade): mediana de lo ya marcado como fondo.
  const rowBg: number[][] = []
  for (let y = 0; y < h; y++) {
    const r: number[] = []
    const g: number[] = []
    const b: number[] = []
    for (let x = 0; x < w; x += 2) {
      const k = y * w + x
      if (bgMask[k]) {
        r.push(rgb(k, 0))
        g.push(rgb(k, 1))
        b.push(rgb(k, 2))
      }
    }
    rowBg.push(r.length > 8 ? [median(r), median(g), median(b)] : B)
  }
  const distRow = (k: number, y: number) => {
    const R = rowBg[y]
    return Math.max(Math.abs(rgb(k, 0) - R[0]), Math.abs(rgb(k, 1) - R[1]), Math.abs(rgb(k, 2) - R[2]))
  }
  const lumRow = (y: number) => (rowBg[y][0] + rowBg[y][1] + rowBg[y][2]) / 3

  // 1b) Fondo encerrado: componentes internas que calzan con el fondo de su fila. Grandes, casi
  // exactas y lejos del piso, para no comer zapatillas, medias o un guardapolvo blanco.
  const figH = bottom - top
  const minHole = Math.round((figH * figH) / 2500)
  const floorLimit = bottom - Math.round(figH * 0.1)
  const holeTopLimit = bottom - Math.round(figH * 0.2)
  const crotchLimit = top + Math.round(figH * 0.45)
  // Ancho de la figura, para distinguir un hueco (angosto: entre las piernas, bajo el brazo) de una
  // prenda clara grande (un guardapolvo de espaldas), que tambien es lisa y del color del fondo.
  let figLeft = w
  let figRight = 0
  for (let y = top; y <= bottom; y += 2) {
    for (let x = 0; x < w; x++) {
      if (!bgMask[y * w + x]) {
        if (x < figLeft) figLeft = x
        if (x > figRight) figRight = x
      }
    }
  }
  const figW = Math.max(1, figRight - figLeft)
  const seen = new Uint8Array(w * h)
  for (let k0 = 0; k0 < w * h; k0++) {
    if (bgMask[k0] || seen[k0] || distRow(k0, (k0 / w) | 0) >= 10) continue
    const comp = [k0]
    seen[k0] = 1
    let sumDist = 0
    let minY = h
    let minX = w
    let maxX = 0
    let maxY = 0
    for (let c = 0; c < comp.length; c++) {
      const k = comp[c]
      const x = k % w
      const y = (k / w) | 0
      sumDist += distRow(k, y)
      if (y < minY) minY = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const nk = ny * w + nx
        if (seen[nk] || bgMask[nk] || distRow(nk, ny) >= 10) continue
        seen[nk] = 1
        comp.push(nk)
      }
    }
    // Un hueco entre las piernas arranca en la entrepierna: en la mitad inferior de la figura,
    // pero por encima de zapatillas y medias.
    const flatEnough = minY >= crotchLimit ? sumDist / comp.length < 5 : sumDist / comp.length < 3
    // Un hueco de verdad es alargado y angosto (entre las piernas, entre el brazo y el cuerpo). Un
    // bolsillo o una espalda de guardapolvo, tambien lisos y claros, no.
    const holeW = maxX - minX + 1
    const elongated = holeW <= figW * 0.3 && maxY - minY + 1 >= holeW * 1.3
    if (comp.length >= minHole && flatEnough && elongated && minY < holeTopLimit) {
      for (const k of comp) {
        bgMask[k] = 1
        stack.push(k)
      }
    }
  }
  // El borde del hueco tiene sombreado suave: se lo crece con tolerancia mas amplia.
  while (stack.length) {
    const k = stack.pop() as number
    const x = k % w
    const y = (k / w) | 0
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || ny >= floorLimit) continue
      const nk = ny * w + nx
      if (bgMask[nk] || distRow(nk, ny) >= 13) continue
      bgMask[nk] = 1
      stack.push(nk)
    }
  }

  // 2) Sombra de piso: gris neutro mas oscuro que el fondo, pegado a el y en la franja de los pies.
  // Se convierte en sombra real (negro semitransparente): se ve bien sobre cualquier escenario.
  const shadowZone = bottom - Math.round(figH * 0.13)
  // Se recorta a la resolucion original: los bordes son nitidos y alcanza con un degrade suave.
  const smoothTol = 4
  for (let k = 0; k < w * h; k++) if (bgMask[k] === 1) stack.push(k)
  while (stack.length) {
    const k = stack.pop() as number
    const x = k % w
    const y = (k / w) | 0
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || ny < shadowZone) continue
      const nk = ny * w + nx
      if (bgMask[nk]) continue
      const l = lum(nk)
      // La sombra es un degrade suave: el salto de luminancia en el borde de la zapatilla la corta.
      if (sat(nk) < 14 && tint(nk) <= TINT + 2 && l >= lumRow(ny) - 110 && l <= lumRow(ny) + 4 && Math.abs(l - lum(k)) <= smoothTol) {
        bgMask[nk] = 2
        stack.push(nk)
      }
    }
  }

  // Alfa y descontaminacion del borde.
  const out = makeRaster(w, h)
  const o = out.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const p = k * 4
      if (bgMask[k] === 1) continue
      if (bgMask[k] === 2) {
        const a = Math.min(0.5, Math.max(0, ((lumRow(y) - lum(k)) / lumRow(y)) * 1.4))
        o[p + 3] = Math.round(a * 255)
        continue
      }
      // Distancia (0-2 px) al fondo mas cercano: define el borde y cuanto se achica.
      let near = 3
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && bgMask[ny * w + nx] >= 1) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)))
        }
      }
      if (near === 3) {
        o[p] = rgb(k, 0)
        o[p + 1] = rgb(k, 1)
        o[p + 2] = rgb(k, 2)
        o[p + 3] = 255
        continue
      }
      const R = rowBg[y]
      const a = Math.min(1, distRow(k, y) / 60) * (near === 1 ? 0.55 : 0.9)
      if (a < 0.08) continue
      for (let c = 0; c < 3; c++) o[p + c] = Math.max(0, Math.min(255, Math.round((rgb(k, c) - (1 - a) * R[c]) / a)))
      o[p + 3] = Math.round(a * 255)
    }
  }

  // Limpieza: se descartan motas sueltas (restos de sombra o ruido) chicas frente a la figura.
  const lab = new Int32Array(w * h).fill(-1)
  const sizes: number[] = []
  for (let k0 = 0; k0 < w * h; k0++) {
    if (lab[k0] >= 0 || bgMask[k0] || o[k0 * 4 + 3] === 0) continue
    const id = sizes.length
    const comp = [k0]
    lab[k0] = id
    for (let c = 0; c < comp.length; c++) {
      const k = comp[c]
      const x = k % w
      const y = (k / w) | 0
      for (const [dx, dy] of N8) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const nk = ny * w + nx
        if (lab[nk] >= 0 || bgMask[nk] || o[nk * 4 + 3] === 0) continue
        lab[nk] = id
        comp.push(nk)
      }
    }
    sizes.push(comp.length)
  }
  const biggest = maxOf(sizes)
  for (let k = 0; k < w * h; k++) if (lab[k] >= 0 && sizes[lab[k]] < biggest * 0.012) o[k * 4 + 3] = 0

  // Limites finales desde el alfa (sin la sombra): una parte clara arriba (un sombrero claro) queda
  // dentro aunque no haya contado para medir la figura.
  let finalTop = h
  let finalBottom = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (bgMask[k] === 0 && o[k * 4 + 3] > 128) {
        if (y < finalTop) finalTop = y
        finalBottom = y
        break
      }
    }
  }
  if (finalBottom < finalTop) {
    finalTop = top
    finalBottom = bottom
  }
  const alpha = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? o[(y * w + x) * 4 + 3] : 0)
  return { raster: out, top: finalTop, bottom: finalBottom, cx: legCenter(alpha, w, finalTop, finalBottom) }
}

// ---------------------------------------------------------------------------------------------
// 3) Armar las vistas del giro

// Todas del mismo tamaño, a la misma escala, centradas entre las piernas y con los pies en la
// misma linea: al girar no "saltan".
export function composeFrames(views: MattedView[]): Raster[] {
  if (!views.length) return []
  const top = Math.min(...views.map((v) => v.top))
  const bottom = Math.max(...views.map((v) => v.bottom))
  const halfW = Math.max(...views.map((v) => Math.max(v.cx, v.raster.width - v.cx)))
  const pad = Math.round((bottom - top) * 0.04)
  const W = Math.ceil(halfW * 2 + pad * 2)
  const H = bottom - top + pad * 2
  return views.map((v) => {
    const frame = makeRaster(W, H)
    const left = Math.round(W / 2 - v.cx)
    const offTop = pad - top + (bottom - v.bottom)
    const { width: vw, height: vh, data } = v.raster
    for (let y = 0; y < vh; y++) {
      const dy = y + offTop
      if (dy < 0 || dy >= H) continue
      for (let x = 0; x < vw; x++) {
        const dx = x + left
        if (dx < 0 || dx >= W) continue
        const from = (y * vw + x) * 4
        frame.data.set(data.subarray(from, from + 4), (dy * W + dx) * 4)
      }
    }
    return frame
  })
}

// ---------------------------------------------------------------------------------------------
// 4) Que figura va en cada vista del giro

// Angulo o nombre de la vista en el nombre del archivo: "03-perfil-090.png" -> 90.
export function angleFromName(name: string): number | null {
  const base = name.toLowerCase().replace(/\.[a-z0-9]+$/, '')
  const word = (pattern: string) => new RegExp(`(?:^|[^a-z])(?:${pattern})(?:[^a-z]|$)`).test(base)
  const view = 'frente|front|perfil|lateral|espalda|back|side|tres-cuartos|cuartos|derecha|izquierda|right|left'
  // El angulo al final, despues de la vista: "03-perfil-090". Un numero suelto (IMG_090) no cuenta.
  const angle = base.match(new RegExp(`(?:${view})[-_ ]+(000|045|090|135|180|225|270|315)$`))
  if (angle) return Number(angle[1])
  const diagonal = /diagonal|tres-cuartos|3-4|3_4/.test(base)
  if (diagonal) return null
  if (word('frente|front')) return 0
  if (word('espalda|back')) return 180
  if (word('derecha|derecho|right')) return 90
  if (word('izquierda|izquierdo|left')) return 270
  return null
}

const SLOT_ANGLES = [0, 90, 180, 270]

// Indices (en la lista de figuras) para frente, perfil derecho, espalda y perfil izquierdo.
// null: no hay una figura para esa vista. Con una sola figura, solo el frente.
export function defaultSlots(rows: number[], angles: Array<number | null> = []): Array<number | null> {
  const count = rows.reduce((total, row) => total + row, 0)
  if (count === 0) return [null, null, null, null]
  // Archivos sueltos con el angulo en el nombre.
  if (angles.some((angle) => angle !== null)) {
    const slots = SLOT_ANGLES.map((angle) => {
      const index = angles.indexOf(angle)
      return index >= 0 ? index : null
    })
    if (slots[0] !== null) return slots
  }
  // La lamina de 8 vistas: la primera fila es frente, lateral derecha, espalda, lateral izquierda.
  if (rows.length >= 2 && rows[0] === 4) return [0, 1, 2, 3]
  // Las laminas de una fila de 4: frente, mira a la derecha, mira a la izquierda, espalda.
  if (rows.length === 1 && rows[0] === 4) return [0, 1, 3, 2]
  // Otra disposicion: solo el frente; el resto se elige a mano.
  return [0, null, null, null]
}
