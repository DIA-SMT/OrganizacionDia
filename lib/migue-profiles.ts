// Migues agregados o editados desde el dashboard (tabla public.migue_profiles, ver
// supabase/add_migue_profiles.sql). El catalogo de lib/migue.ts sigue siendo la base: una fila
// con el mismo slug lo pisa (o lo oculta si active es false) y una fila nueva suma un Migue.
// Sin imports con alias: lo usan los tests de node.

import { MIGUE_CHANNELS, MIGUE_STATUSES, type MigueChannel, type MigueProfile, type MigueStatus } from './migue.ts'

export const MIGUE_ASSETS_BUCKET = 'migue-assets'
// Tope de cada archivo en el bucket (supabase/add_migue_profiles.sql). El GLB tiene que venir
// optimizado (npm run migue:glb).
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024
export const MAX_MODEL_BYTES = MAX_UPLOAD_BYTES
export const MAX_POSTER_SOURCE_BYTES = 15 * 1024 * 1024
// La portada se guarda como webp de este tamaño como mucho.
export const POSTER_MAX_HEIGHT = 1400
export const POSTER_MAX_WIDTH = 1400
// Escenario por defecto de un Migue nuevo.
export const DEFAULT_ACCENT = '#d7dcef'
// Sin portada todavia (no deberia pasar: el formulario la pide).
export const PLACEHOLDER_FRAME = '/migue/sin-imagen.webp'

export const MIGUE_PROFILE_LIMITS = {
  slug: 40,
  name: 60,
  look: 80,
  project_name: 80,
  area: 60,
  description: 240,
  llm_model: 80,
} as const

// Fila tal cual esta en public.migue_profiles.
export type MigueProfileRow = {
  slug: string
  name: string
  look: string
  project_name: string
  area: string
  description: string
  channels: string[]
  llm_model: string
  status: string
  accent: string
  poster_url: string | null
  model_url: string | null
  // Las 4 vistas del giro. Puede faltar en una base sin la columna (add_migue_profiles.sql viejo).
  frame_urls?: string[] | null
  active: boolean
}

// Lo que se guarda desde el formulario (las URLs las pone la subida de archivos).
export type MigueProfileInput = Omit<MigueProfileRow, 'poster_url' | 'model_url' | 'frame_urls'>

export type MigueProfileErrors = Partial<Record<keyof MigueProfileInput, string>>

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ACCENT = /^#[0-9a-f]{6}$/i

// "Migue Ciudadanía 2" -> "migue-ciudadania-2".
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MIGUE_PROFILE_LIMITS.slug)
    .replace(/-+$/g, '')
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

// Largo en caracteres, como char_length en la base (un emoji cuenta uno, no dos).
const length = (value: string) => [...value].length

// Valida lo que llega del formulario. takenSlugs: los que ya existen (solo cuenta al crear).
export function validateMigueProfile(
  input: Record<string, unknown>,
  options: { creating: boolean; takenSlugs: Iterable<string> },
): { ok: true; profile: MigueProfileInput } | { ok: false; errors: MigueProfileErrors } {
  const errors: MigueProfileErrors = {}
  const text = (key: keyof typeof MIGUE_PROFILE_LIMITS, required: boolean, label: string) => {
    const value = clean(input[key])
    if (required && length(value) < 2) errors[key] = `Falta ${label}.`
    else if (length(value) > MIGUE_PROFILE_LIMITS[key]) errors[key] = `${label[0].toUpperCase()}${label.slice(1)}: hasta ${MIGUE_PROFILE_LIMITS[key]} caracteres.`
    return value
  }

  const slug = clean(input.slug).toLowerCase()
  if (!SLUG.test(slug) || slug.length < 2 || slug.length > MIGUE_PROFILE_LIMITS.slug) {
    errors.slug = 'El identificador va en minusculas, con numeros y guiones (por ejemplo migue-transito).'
  } else if (options.creating && new Set(options.takenSlugs).has(slug)) {
    errors.slug = 'Ya hay un Migue con ese identificador.'
  }

  const name = text('name', true, 'el nombre')
  const project_name = text('project_name', true, 'el proyecto')
  const look = text('look', false, 'el aspecto')
  const area = text('area', false, 'el area')
  const llm_model = text('llm_model', false, 'el modelo de IA')
  // La descripcion conserva los saltos de linea que escriba la persona.
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (length(description) > MIGUE_PROFILE_LIMITS.description) errors.description = `Descripcion: hasta ${MIGUE_PROFILE_LIMITS.description} caracteres.`

  const rawChannels = Array.isArray(input.channels) ? input.channels : []
  const channels = MIGUE_CHANNELS.filter((channel) => rawChannels.includes(channel))
  if (channels.length !== rawChannels.length) errors.channels = 'Hay un canal que no existe.'

  const status = clean(input.status)
  if (!MIGUE_STATUSES.includes(status as MigueStatus)) errors.status = 'Elegi un estado.'

  const accent = clean(input.accent) || DEFAULT_ACCENT
  if (!ACCENT.test(accent)) errors.accent = 'El color tiene que ser del tipo #d7dcef.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    profile: { slug, name, look, project_name, area, description, channels, llm_model, status, accent: accent.toLowerCase(), active: input.active !== false },
  }
}

// Solo se usan archivos del bucket propio: una URL a otro sitio en la fila no se carga.
function ownAsset(url: string | null, assetsPrefix: string | null): string | null {
  if (!url || !assetsPrefix) return null
  return url.startsWith(assetsPrefix) ? url : null
}

// El catalogo que se muestra: el del codigo, con lo editado en el dashboard encima y los Migues
// nuevos al final. assetsPrefix: URL publica del bucket (ver assetsPrefixFor).
export function mergeMigueCatalog(base: MigueProfile[], rows: MigueProfileRow[], assetsPrefix: string | null): MigueProfile[] {
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  const fromRow = (row: MigueProfileRow, fallback?: MigueProfile): MigueProfile => {
    const poster = ownAsset(row.poster_url, assetsPrefix)
    // Las 4 vistas, solo si estan todas y son del bucket: con una que falte, el giro saltaria.
    const views = (row.frame_urls ?? []).map((url) => ownAsset(url, assetsPrefix))
    const turn = views.length === 4 && views.every(Boolean) ? (views as string[]) : null
    return {
      ...fallback,
      slug: row.slug,
      name: row.name,
      look: row.look,
      project_name: row.project_name,
      area: row.area,
      description: row.description,
      channels: MIGUE_CHANNELS.filter((channel): channel is MigueChannel => row.channels.includes(channel)),
      llm_model: row.llm_model,
      status: MIGUE_STATUSES.includes(row.status as MigueStatus) ? (row.status as MigueStatus) : 'En desarrollo',
      accent: ACCENT.test(row.accent) ? row.accent : DEFAULT_ACCENT,
      // Vistas subidas, o una portada sola, reemplazan las del repo; sin nada quedan las del repo.
      frames: turn ?? (poster ? [poster] : (fallback?.frames ?? [PLACEHOLDER_FRAME])),
      model: ownAsset(row.model_url, assetsPrefix) ?? fallback?.model,
      internal: fallback?.internal,
    }
  }
  const merged: MigueProfile[] = []
  for (const migue of base) {
    const row = bySlug.get(migue.slug)
    if (!row) merged.push(migue)
    else if (row.active) merged.push(fromRow(row, migue))
  }
  const known = new Set(base.map((migue) => migue.slug))
  for (const row of rows) if (row.active && !known.has(row.slug)) merged.push(fromRow(row))
  return merged
}

export function assetsPrefixFor(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${MIGUE_ASSETS_BUCKET}/`
}

// Un GLB de glTF 2.0 empieza con "glTF" y la version 2 (little endian).
export function isGlb(header: Uint8Array): boolean {
  return (
    header.length >= 8 &&
    header[0] === 0x67 &&
    header[1] === 0x6c &&
    header[2] === 0x54 &&
    header[3] === 0x46 &&
    header[4] === 2 &&
    header[5] === 0 &&
    header[6] === 0 &&
    header[7] === 0
  )
}

// Ruta dentro del bucket: una por subida, asi una portada nueva no queda tapada por la cache.
// La portada es webp; png solo si el navegador no sabe generar webp.
export function assetPath(slug: string, kind: 'poster' | 'model', now: number, posterType: 'image/webp' | 'image/png' = 'image/webp'): string {
  if (kind === 'model') return `${slug}/${now}-modelo.glb`
  return `${slug}/${now}-portada.${posterType === 'image/png' ? 'png' : 'webp'}`
}

// Ruta de cada vista del giro (0 frente, 1 perfil derecho, 2 espalda, 3 perfil izquierdo).
export function viewPath(slug: string, index: number, now: number, type: 'image/webp' | 'image/png' = 'image/webp'): string {
  return `${slug}/${now}-vista-${index}.${type === 'image/png' ? 'png' : 'webp'}`
}
