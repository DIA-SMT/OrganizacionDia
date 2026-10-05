// La parte de lib/migue-views.ts que necesita el navegador: leer las imagenes con un canvas,
// ampliar las figuras chicas y codificar las vistas finales en webp. Solo corre del lado cliente.
import { MAX_UPLOAD_BYTES, POSTER_MAX_HEIGHT } from '@/lib/migue-profiles'
import { angleFromName, composeFrames, crop, defaultSlots, findFigures, matteFigure, paddedBox, type MattedView, type Raster } from '@/lib/migue-views'

export type ViewCandidate = { view: MattedView; preview: string; label: string }
export type PreparedViews = { candidates: ViewCandidate[]; slots: Array<number | null> }
export type EncodedFrame = { blob: Blob; type: 'image/webp' | 'image/png' }

// Una lamina enorme se achica antes de procesarla: alcanza y no traba el navegador.
const MAX_SOURCE_SIDE = 4096
// Las figuras de una lamina miden unos 470 px: se amplian al doble para que se vean nitidas.
const UPSCALE_BELOW = 700
const PREVIEW_HEIGHT = 240
const MAX_FILES = 12

const pause = () => new Promise((resolve) => window.setTimeout(resolve, 0))

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('El navegador no pudo procesar la imagen.')
  return ctx
}

async function rasterFromFile(file: File): Promise<Raster> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`No se pudo abrir ${file.name}: usa PNG, JPG o WebP.`)
  })
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = context(canvas)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data, width: canvas.width, height: canvas.height }
}

function canvasOf(raster: Raster): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = raster.width
  canvas.height = raster.height
  context(canvas).putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0)
  return canvas
}

function resized(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = context(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function enlarged(view: MattedView, factor: number): MattedView {
  if (factor === 1) return view
  const canvas = resized(canvasOf(view.raster), view.raster.width * factor, view.raster.height * factor)
  const { data } = context(canvas).getImageData(0, 0, canvas.width, canvas.height)
  return { raster: { data, width: canvas.width, height: canvas.height }, top: view.top * factor, bottom: view.bottom * factor, cx: view.cx * factor }
}

// Todas las figuras de una imagen, sin fondo y en orden de lectura (a su tamaño original).
async function viewsOf(file: File): Promise<{ views: MattedView[]; rows: number[] }> {
  const image = await rasterFromFile(file)
  // Cede el hilo antes de buscar: la pantalla alcanza a mostrar que esta procesando.
  await pause()
  const found = findFigures(image)
  const views: MattedView[] = []
  for (const box of found.boxes) {
    // Cede el hilo entre figura y figura: la pantalla no se congela mientras procesa.
    await pause()
    const piece = crop(found.clean, paddedBox(box, found.boxes, image.width, image.height))
    views.push(matteFigure(piece, found.transparent))
  }
  return { views, rows: found.rows }
}

const figureHeight = (view: MattedView) => Math.max(1, view.bottom - view.top)

function previewOf(view: MattedView): string {
  const { raster } = view
  const height = Math.min(PREVIEW_HEIGHT, raster.height)
  return resized(canvasOf(raster), (raster.width * height) / raster.height, height).toDataURL('image/png')
}

// Una lamina (varias figuras en una imagen), las vistas sueltas o una sola foto: devuelve las
// figuras encontradas y cual va en cada vista del giro.
export async function prepareViews(files: File[]): Promise<PreparedViews> {
  let views: MattedView[] = []
  let rows: number[] = []
  const angles: Array<number | null> = []
  if (files.length === 1) {
    ;({ views, rows } = await viewsOf(files[0]))
  } else {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })).slice(0, MAX_FILES)
    for (const file of sorted) {
      const { views: found } = await viewsOf(file)
      if (!found.length) continue
      // De cada archivo, la figura mas alta (la vista; lo demas son restos).
      views.push(found.reduce((best, view) => (view.bottom - view.top > best.bottom - best.top ? view : best)))
      angles.push(angleFromName(file.name))
    }
    rows = [views.length]
  }
  // Una sola escala para todas: con una figura ampliada y otra no, el muñequito cambiaria de
  // tamaño al girar.
  const factor = views.length && Math.max(...views.map((view) => view.raster.height)) < UPSCALE_BELOW ? 2 : 1
  const candidates = views.map((view, index) => {
    const big = enlarged(view, factor)
    return { view: big, preview: previewOf(big), label: `Vista ${index + 1}` }
  })
  return { candidates, slots: defaultSlots(rows, angles) }
}

// Las vistas elegidas, del mismo tamaño y con los pies en la misma linea, listas para subir.
export async function encodeFrames(views: MattedView[]): Promise<EncodedFrame[]> {
  // Vistas sueltas de distinta resolucion: todas a la altura de figura del medio, asi el giro no salta.
  const heights = views.map(figureHeight).sort((a, b) => a - b)
  const target = heights[heights.length >> 1] ?? 1
  const even = views.map((view) => (Math.abs(figureHeight(view) / target - 1) > 0.03 ? enlarged(view, target / figureHeight(view)) : view))
  const encoded: EncodedFrame[] = []
  for (const frame of composeFrames(even)) {
    await pause()
    let canvas = canvasOf(frame)
    if (canvas.height > POSTER_MAX_HEIGHT) canvas = resized(canvas, (canvas.width * POSTER_MAX_HEIGHT) / canvas.height, POSTER_MAX_HEIGHT)
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
    // Navegadores sin webp: png, que tambien conserva la transparencia.
    const blob = webp && webp.type === 'image/webp' ? webp : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('El navegador no pudo generar las vistas.')
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Una vista quedo muy pesada para subirla: proba con una imagen mas chica.')
    encoded.push({ blob, type: blob.type === 'image/png' ? 'image/png' : 'image/webp' })
  }
  return encoded
}
