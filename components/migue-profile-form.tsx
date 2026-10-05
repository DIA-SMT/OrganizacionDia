'use client'

import { MigueKeyPanel } from '@/components/migue-key-panel'
import { MIGUE_CHANNELS, MIGUE_STATUSES, type MigueProfile } from '@/lib/migue'
import {
  DEFAULT_ACCENT,
  MAX_MODEL_BYTES,
  MAX_POSTER_SOURCE_BYTES,
  MAX_UPLOAD_BYTES,
  MIGUE_ASSETS_BUCKET,
  MIGUE_PROFILE_LIMITS,
  POSTER_MAX_HEIGHT,
  POSTER_MAX_WIDTH,
  assetPath,
  assetsPrefixFor,
  isGlb,
  slugify,
  validateMigueProfile,
  viewPath,
  type MigueProfileErrors,
  type MigueProfileRow,
} from '@/lib/migue-profiles'
import { VIEW_SLOTS } from '@/lib/migue-views'
import { encodeFrames, prepareViews, type PreparedViews } from '@/lib/migue-views-browser'
import { lockPageScroll } from '@/lib/scroll-lock'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { Box, ImageIcon, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const INPUT =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 aria-[invalid=true]:border-red-400'
// content-start: en una fila, el campo sin ayuda no queda estirado hacia abajo.
const LABEL = 'grid content-start gap-1 text-sm'
const LABEL_TEXT = 'font-semibold text-slate-700 dark:text-slate-200'
const HINT = 'text-xs text-slate-500 dark:text-slate-400'
const MB = 1024 * 1024
const OTHER = '__otro__'
const FILE_BUTTON =
  'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

// Lista para elegir lo que ya existe, con "Otro" para escribir uno nuevo.
function ChoiceField({
  id,
  label,
  value,
  options,
  otherLabel,
  placeholder,
  maxLength,
  error,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  otherLabel: string
  placeholder: string
  maxLength: number
  error?: string
  onChange: (value: string) => void
}) {
  const [typing, setTyping] = useState(() => value.trim() !== '' && !options.includes(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const selectValue = typing ? OTHER : options.includes(value) ? value : ''
  return (
    <div className="grid content-start gap-1 text-sm">
      <label htmlFor={id} className={LABEL_TEXT}>
        {label}
      </label>
      <select
        id={id}
        className={INPUT}
        value={selectValue}
        aria-invalid={Boolean(error) && !typing}
        onChange={(event) => {
          if (event.target.value === OTHER) {
            setTyping(true)
            onChange('')
            window.requestAnimationFrame(() => inputRef.current?.focus())
          } else {
            setTyping(false)
            onChange(event.target.value)
          }
        }}
      >
        <option value="">Elegi una opcion</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER}>{otherLabel}</option>
      </select>
      {typing && (
        <input
          ref={inputRef}
          className={INPUT}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={`${label} (nuevo)`}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-300">{error}</span>}
    </div>
  )
}

// Solo cuentan los arrastres de archivos (no un texto seleccionado que se arrastra).
const carriesFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files')

// Recuadro donde se puede soltar un archivo. Se marca mientras uno pasa por encima.
function DropZone({ onFiles, children, className = '' }: { onFiles: (files: File[]) => void; children: React.ReactNode; className?: string }) {
  const [over, setOver] = useState(false)
  // dragenter y dragleave tambien saltan al pasar por los hijos: se cuenta la profundidad.
  const depth = useRef(0)
  return (
    <div
      className={`grid min-w-0 content-start gap-2 rounded-lg border-2 border-dashed p-3 text-sm transition-colors ${
        over ? 'border-blue-400 bg-blue-50/70 dark:border-blue-400/70 dark:bg-blue-500/10' : 'border-slate-200 dark:border-slate-700'
      } ${className}`}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        // Sin esto el fondo del dialogo, que no acepta archivos, pisaria el permiso de soltar.
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        depth.current = 0
        setOver(false)
        onFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {children}
    </div>
  )
}

const isModelFile = (file: File) => file.name.toLowerCase().endsWith('.glb') || file.type === 'model/gltf-binary'

const sortedUnique = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => (value ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))

type FormValues = {
  name: string
  slug: string
  project_name: string
  area: string
  description: string
  look: string
  channels: string[]
  llm_model: string
  status: string
  accent: string
  active: boolean
}

function valuesFrom(migue: MigueProfile | null): FormValues {
  if (!migue) {
    return { name: '', slug: '', project_name: '', area: '', description: '', look: '', channels: [], llm_model: '', status: 'En desarrollo', accent: DEFAULT_ACCENT, active: true }
  }
  return {
    name: migue.name,
    slug: migue.slug,
    project_name: migue.project_name,
    area: migue.area,
    description: migue.description,
    look: migue.look,
    channels: [...migue.channels],
    llm_model: migue.llm_model,
    status: migue.status,
    accent: migue.accent,
    active: true,
  }
}

// La portada se achica y se pasa a webp en el navegador: lo que se sube pesa poco.
async function posterBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, POSTER_MAX_HEIGHT / bitmap.height, POSTER_MAX_WIDTH / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('El navegador no pudo procesar la imagen.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
  if (webp && webp.type === 'image/webp') return webp
  // Navegadores sin webp: png, que tambien conserva el fondo transparente.
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) throw new Error('El navegador no pudo procesar la imagen.')
  return png
}

// Sube directo a Storage con la sesion del usuario. Sin el corte de 12 s del cliente de
// Supabase: un modelo de 5 MB puede tardar mas en una conexion lenta.
async function uploadAsset(path: string, body: Blob, contentType: string, accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Supabase no esta configurado.')
  const response = await fetch(`${url.replace(/\/+$/, '')}/storage/v1/object/${MIGUE_ASSETS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': contentType,
      'x-upsert': 'false',
      // Cada subida tiene su propia ruta: se puede cachear para siempre.
      'cache-control': 'max-age=31536000',
    },
    body,
  })
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
    const reason = detail?.message ?? detail?.error ?? `error ${response.status}`
    throw new Error(
      /bucket not found/i.test(reason)
        ? 'Falta ejecutar supabase/add_migue_profiles.sql en Supabase (no existe el bucket migue-assets).'
        : /row-level security|unauthorized|403/i.test(reason)
          ? 'Solo el equipo DIA puede subir archivos de Migue.'
          : `No se pudo subir el archivo: ${reason}`,
    )
  }
  const prefix = assetsPrefixFor(url)
  if (!prefix) throw new Error('Supabase no esta configurado.')
  return `${prefix}${path}`
}

function fileError(file: File | null, kind: 'poster' | 'model'): string | null {
  if (!file) return null
  if (kind === 'poster') {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return 'La portada tiene que ser PNG, JPG o WebP.'
    if (file.size > MAX_POSTER_SOURCE_BYTES) return `La portada pesa mas de ${MAX_POSTER_SOURCE_BYTES / MB} MB.`
    return null
  }
  if (!file.name.toLowerCase().endsWith('.glb')) return 'El modelo 3D tiene que ser un archivo .glb.'
  if (file.size > MAX_MODEL_BYTES) {
    return `El modelo pesa ${(file.size / MB).toFixed(1)} MB y el tope es ${MAX_MODEL_BYTES / MB} MB: optimizalo antes con npm run migue:glb -- archivo.glb (queda en unos 2 MB).`
  }
  return null
}

// Alta y edicion de un Migue. editing: el Migue que se edita (null = nuevo). row: su fila en
// migue_profiles, si ya tiene (los del codigo la crean al guardarse por primera vez).
export function MigueProfileForm({
  editing,
  row,
  catalog,
  takenSlugs,
  hasKeyFor,
  onClose,
  onSaved,
}: {
  editing: MigueProfile | null
  row: MigueProfileRow | null
  // Los Migues que ya hay: de ahi salen las opciones de area y modelo de IA.
  catalog: MigueProfile[]
  takenSlugs: string[]
  // Si un Migue ya tiene clave (para pedir confirmacion antes de reemplazarla).
  hasKeyFor: (slug: string) => boolean
  onClose: () => void
  onSaved: (slug: string, visible: boolean) => void
}) {
  const creating = editing === null
  const dialogRef = useRef<HTMLFormElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)
  // Un click que termina en el fondo despues de seleccionar texto adentro no cierra.
  const pressedBackdrop = useRef(false)
  const closeRef = useRef(onClose)
  const [values, setValues] = useState<FormValues>(() => valuesFrom(editing))
  const [slugTouched, setSlugTouched] = useState(!creating)
  // Las imagenes elegidas (la lamina, las vistas sueltas o una foto) y lo que se saco de ellas.
  const [images, setImages] = useState<File[]>([])
  const [views, setViews] = useState<PreparedViews | null>(null)
  const [viewsBusy, setViewsBusy] = useState(false)
  // Subir la primera imagen tal cual, sin separar figuras ni quitar el fondo.
  const [keepOriginal, setKeepOriginal] = useState(false)
  // Una imagen rechazada (formato o peso) frena el guardado, como un .glb rechazado.
  const [imageRejected, setImageRejected] = useState(false)
  // Aviso de un archivo soltado que no es imagen ni .glb: informa, no frena.
  const [dropNotice, setDropNotice] = useState<{ zone: 'poster' | 'model'; text: string } | null>(null)
  // Cada eleccion de imagenes invalida el procesamiento de la anterior.
  const pickRound = useRef(0)
  const [posterPreview, setPosterPreview] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)
  const [model, setModel] = useState<File | null>(null)
  const [errors, setErrors] = useState<MigueProfileErrors & { poster?: string; model?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [created, setCreated] = useState<{ slug: string; projectName: string } | null>(null)
  // Proyectos del dashboard (los del equipo, por RLS) para elegir en vez de escribir.
  const [projects, setProjects] = useState<{ name: string; requester_area: string | null }[]>([])

  useEffect(() => {
    let cancelled = false
    async function loadProjects() {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return
      const { data, error } = await supabase.from('projects').select('name, requester_area').eq('active', true).order('name')
      if (!cancelled && !error) setProjects((data ?? []) as { name: string; requester_area: string | null }[])
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [])

  const projectOptions = sortedUnique([...projects.map((project) => project.name), ...catalog.map((migue) => migue.project_name)])
  const areaOptions = sortedUnique([...catalog.map((migue) => migue.area), ...projects.map((project) => project.requester_area)])
  const modelOptions = sortedUnique([...catalog.map((migue) => migue.llm_model), 'OpenRouter', 'Por confirmar'])

  function pickProject(name: string) {
    set('project_name', name)
    // Con un proyecto del dashboard, el area sale de su ficha si todavia no se eligio una.
    const area = projects.find((project) => project.name === name)?.requester_area?.trim()
    if (area && !values.area.trim()) set('area', area)
  }

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // La vista previa de la portada es una URL blob: se libera al cambiarla y al cerrar.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  // Bloquea el scroll de atras, lleva el foco al primer campo y lo devuelve al cerrar.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const release = lockPageScroll()
    dialogRef.current?.querySelector<HTMLElement>('input:not([disabled])')?.focus()
    return () => {
      release()
      previousFocus?.focus()
    }
  }, [])

  // Al pasar al paso de la clave desaparecen los campos: el foco vuelve al dialogo.
  useEffect(() => {
    if (created) dialogRef.current?.focus()
  }, [created])

  function requestClose() {
    if (saving) return
    closeRef.current()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      requestClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null)
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const current = document.activeElement
    if (event.shiftKey && (current === first || current === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value }
      // El identificador sigue al nombre hasta que alguien lo edita a mano.
      if (key === 'name' && creating && !slugTouched) next.slug = slugify(String(value))
      return next
    })
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  function clearModel() {
    if (modelInputRef.current) modelInputRef.current.value = ''
    setModel(null)
    setErrors((current) => ({ ...current, model: undefined }))
  }

  async function pickModel(file: File | null) {
    if (saving) return
    setDropNotice(null)
    setErrors((current) => ({ ...current, model: undefined }))
    if (!file) {
      setModel(null)
      return
    }
    const problem = fileError(file, 'model')
    if (problem) {
      setModel(null)
      setErrors((current) => ({ ...current, model: problem }))
      return
    }
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
    if (!isGlb(header)) {
      setModel(null)
      setErrors((current) => ({ ...current, model: 'El archivo no es un modelo .glb valido (glTF 2.0).' }))
      return
    }
    setModel(file)
  }

  // Lo que se suelta va a su lugar por el tipo: un .glb al modelo y una imagen a la portada,
  // aunque se suelte en el otro recuadro o se suelten los dos juntos.
  function dropFiles(files: File[], zone: 'poster' | 'model') {
    if (created || saving || files.length === 0) return
    const modelFile = files.find(isModelFile)
    const imageFile = files.find((file) => !isModelFile(file) && file.type.startsWith('image/'))
    if (modelFile) void pickModel(modelFile)
    if (imageFile) void pickImages(files.filter((file) => !isModelFile(file) && file.type.startsWith('image/')))
    if (!modelFile && !imageFile) setDropNotice({ zone, text: 'Ese archivo no es una imagen ni un modelo .glb.' })
  }

  // Separa las figuras y les quita el fondo en el navegador. Con la lamina de 8 vistas o las
  // vistas sueltas propone las 4 del giro; con una sola foto, solo el frente.
  async function pickImages(files: File[]) {
    if (saving) return
    // En el mismo orden que las vistas (por nombre): la primera es la que se usa "tal cual".
    const picked = files.filter((file) => !isModelFile(file)).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
    if (!picked.length) return
    setDropNotice(null)
    const problem = picked.map((file) => fileError(file, 'poster')).find(Boolean)
    if (problem) {
      setImageRejected(true)
      setErrors((current) => ({ ...current, poster: problem }))
      return
    }
    setImageRejected(false)
    const round = ++pickRound.current
    setErrors((current) => ({ ...current, poster: undefined }))
    setImages(picked)
    setKeepOriginal(false)
    setViews(null)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = URL.createObjectURL(picked[0])
    setPosterPreview(previewRef.current)
    setViewsBusy(true)
    try {
      const prepared = await prepareViews(picked)
      if (round !== pickRound.current) return
      setViews(prepared)
      if (!prepared.candidates.length) {
        setKeepOriginal(true)
        setErrors((current) => ({ ...current, poster: 'No encontre una figura sobre un fondo liso: se va a usar la imagen tal cual.' }))
      }
    } catch (err) {
      if (round !== pickRound.current) return
      setKeepOriginal(true)
      setErrors((current) => ({ ...current, poster: err instanceof Error ? err.message : 'No se pudo procesar la imagen.' }))
    } finally {
      if (round === pickRound.current) setViewsBusy(false)
    }
  }

  function setSlot(slot: number, pick: number | null) {
    // El aviso de elegir el frente ya no aplica.
    if (!imageRejected) setErrors((current) => ({ ...current, poster: undefined }))
    setViews((current) => current && { ...current, slots: current.slots.map((value, index) => (index === slot ? pick : value)) })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    const checked = validateMigueProfile(values, { creating, takenSlugs })
    const nextErrors: typeof errors = checked.ok ? {} : { ...checked.errors }
    if (creating && !images.length) nextErrors.poster = 'Subi la imagen del Migue: la lamina de 8 vistas o una foto de frente.'
    if (imageRejected) nextErrors.poster = errors.poster ?? 'La imagen elegida no se puede usar: elegi otra.'
    // Sin frente no hay portada: con varias figuras, se elige cual va.
    if (images.length && views && !keepOriginal && views.candidates.length > 1 && views.slots[0] === null) {
      nextErrors.poster = 'Elegi que figura va de Frente: es la portada de la tarjeta.'
    }
    // Un modelo rechazado frena el guardado: si no, la ficha se guardaria sin el 3D sin que se note.
    if (errors.model) nextErrors.model = errors.model
    if (viewsBusy) {
      setFormError('Espera a que termine de separar las vistas.')
      return
    }
    if (!checked.ok || Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      // Lleva al primer campo con error: puede estar fuera de la vista.
      window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    // Paso la validacion: no quedan avisos viejos a la vista.
    setErrors({})
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setFormError('Supabase no esta configurado.')
      return
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('La sesion vencio: volve a iniciar sesion.')
      const profile = checked.profile
      const now = Date.now()

      let posterUrl = row?.poster_url ?? null
      // undefined: no se tocan las vistas guardadas. null: se borran (queda solo la portada).
      let frameUrls: string[] | null | undefined = undefined
      const chosen = views && !keepOriginal ? views.slots : null
      if (images.length && chosen && views && views.candidates.length) {
        // Con las 4 vistas, la tarjeta gira; si falta alguna, solo el frente.
        const full = chosen.every((pick) => pick !== null)
        const front = chosen[0] ?? 0
        const list = full ? chosen.map((pick) => views.candidates[pick as number].view) : [views.candidates[front].view]
        setSaving('Preparando las vistas...')
        const encoded = await encodeFrames(list)
        const urls: string[] = []
        for (let index = 0; index < encoded.length; index++) {
          const { blob, type } = encoded[index]
          setSaving(full ? `Subiendo la vista ${index + 1} de 4...` : 'Subiendo la portada...')
          const path = full ? viewPath(profile.slug, index, now, type) : assetPath(profile.slug, 'poster', now, type)
          urls.push(await uploadAsset(path, blob, type, session.access_token))
        }
        posterUrl = urls[0]
        frameUrls = full ? urls : null
      } else if (images.length) {
        setSaving('Preparando la portada...')
        const blob = await posterBlob(images[0])
        if (blob.size > MAX_UPLOAD_BYTES) {
          setErrors((current) => ({ ...current, poster: 'La portada quedo muy pesada: usa una imagen mas chica o en WebP.' }))
          return
        }
        const type = blob.type === 'image/png' ? 'image/png' : 'image/webp'
        setSaving('Subiendo la portada...')
        posterUrl = await uploadAsset(assetPath(profile.slug, 'poster', now, type), blob, type, session.access_token)
        frameUrls = null
      }
      let modelUrl = row?.model_url ?? null
      if (model) {
        setSaving('Subiendo el modelo 3D...')
        modelUrl = await uploadAsset(assetPath(profile.slug, 'model', now), model, 'model/gltf-binary', session.access_token)
      }

      setSaving('Guardando la ficha...')
      // Las vistas viajan solo si hay que guardarlas o borrar las que habia: una base sin la columna
      // (SQL pendiente) sigue aceptando una portada sola.
      const clearsFrames = frameUrls === null && Array.isArray(row?.frame_urls) && row.frame_urls.length > 0
      const record = { ...profile, poster_url: posterUrl, model_url: modelUrl, ...(Array.isArray(frameUrls) || clearsFrames ? { frame_urls: frameUrls } : {}) }
      // Al crear, insert: si otro lo creo recien con el mismo identificador, falla en vez de pisarlo.
      const { error } = creating
        ? await supabase.from('migue_profiles').insert(record)
        : await supabase.from('migue_profiles').upsert(record, { onConflict: 'slug' })
      if (error) {
        if (error.code === '23505') {
          setErrors({ slug: 'Ya hay un Migue con ese identificador.' })
          return
        }
        if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Falta ejecutar supabase/add_migue_profiles.sql en Supabase.')
        if (error.code === '42501') throw new Error('Solo el equipo DIA puede agregar o editar Migues.')
        if (error.code === '23514') throw new Error('La base rechazo algun dato (largo o formato). Revisa los campos y volve a intentar.')
        if (error.code === 'PGRST204' || error.code === '42703') {
          throw new Error('Falta actualizar la base: ejecuta de nuevo supabase/add_migue_profiles.sql en Supabase (agrega la columna de las vistas).')
        }
        throw new Error(error.message)
      }

      onSaved(profile.slug, profile.active)
      if (creating) setCreated({ slug: profile.slug, projectName: profile.project_name })
      else closeRef.current()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el Migue.')
      bodyRef.current?.scrollTo({ top: 0 })
    } finally {
      setSaving(null)
    }
  }

  const title = created ? 'Migue agregado' : creating ? 'Agregar Migue' : `Editar ${editing?.name ?? 'Migue'}`
  const currentModel = row?.model_url ?? editing?.model ?? null

  return (
    <div
      className="prezi-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4"
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      // Un archivo soltado fuera de los recuadros no hace que el navegador lo abra y se pierda el formulario.
      onDragOver={(event) => {
        if (!carriesFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'none'
      }}
      onDrop={(event) => {
        if (carriesFiles(event)) event.preventDefault()
      }}
      onClick={(event) => {
        // Con la clave en pantalla no se cierra por un click afuera: se perderia.
        if (pressedBackdrop.current && event.target === event.currentTarget && !created) requestClose()
      }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="migue-form-title"
        tabIndex={-1}
        noValidate
        onSubmit={submit}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        className="prezi-bubble-in flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="migue-form-title" className="text-lg font-bold text-slate-950 dark:text-white">
              {title}
            </h2>
            <p className={`text-sm ${HINT}`}>
              {created
                ? 'Ya aparece en la seccion. Falta su clave para que el bot empiece a reportar.'
                : creating
                  ? 'El asistente de IA de un proyecto: su ficha, su muñequito y su clave para reportar.'
                  : 'Los cambios se ven en la seccion apenas se guardan.'}
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Cerrar"
            disabled={Boolean(saving)}
            onClick={requestClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={bodyRef} data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {created ? (
            <MigueKeyPanel slug={created.slug} projectName={created.projectName} hasKey={hasKeyFor(created.slug)} onCreated={() => onSaved(created.slug, true)} />
          ) : (
            <div className="grid gap-4">
              {formError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {formError}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <label className={LABEL}>
                  <span className={LABEL_TEXT}>Nombre</span>
                  <input className={INPUT} value={values.name} maxLength={MIGUE_PROFILE_LIMITS.name} placeholder="Migue Transito" aria-invalid={Boolean(errors.name)} onChange={(e) => set('name', e.target.value)} />
                  {errors.name && <span className="text-xs text-red-600 dark:text-red-300">{errors.name}</span>}
                </label>
                <label className={LABEL}>
                  <span className={LABEL_TEXT}>Identificador</span>
                  <input
                    className={`${INPUT} font-mono disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-slate-900`}
                    value={values.slug}
                    maxLength={MIGUE_PROFILE_LIMITS.slug}
                    placeholder="migue-transito"
                    disabled={!creating}
                    aria-invalid={Boolean(errors.slug)}
                    onChange={(e) => {
                      setSlugTouched(true)
                      set('slug', e.target.value.toLowerCase())
                    }}
                  />
                  <span className={errors.slug ? 'text-xs text-red-600 dark:text-red-300' : HINT}>
                    {errors.slug ?? (creating ? 'Va en la clave y en las metricas: despues no se puede cambiar.' : 'No se puede cambiar: lo usan la clave y las metricas.')}
                  </span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ChoiceField
                  id="migue-form-project"
                  label="Proyecto"
                  value={values.project_name}
                  options={projectOptions}
                  otherLabel="Otro proyecto..."
                  placeholder="App de Transito"
                  maxLength={MIGUE_PROFILE_LIMITS.project_name}
                  error={errors.project_name}
                  onChange={pickProject}
                />
                <ChoiceField
                  id="migue-form-area"
                  label="Area"
                  value={values.area}
                  options={areaOptions}
                  otherLabel="Otra area..."
                  placeholder="Movilidad"
                  maxLength={MIGUE_PROFILE_LIMITS.area}
                  error={errors.area}
                  onChange={(area) => set('area', area)}
                />
              </div>

              <label className={LABEL}>
                <span className={LABEL_TEXT}>Que hace</span>
                <textarea
                  className={`${INPUT} h-auto min-h-20 py-2`}
                  value={values.description}
                  maxLength={MIGUE_PROFILE_LIMITS.description}
                  placeholder="Responde sobre cortes de transito, estacionamiento medido y licencias."
                  aria-invalid={Boolean(errors.description)}
                  onChange={(e) => set('description', e.target.value)}
                />
                <span className={HINT}>
                  {values.description.length}/{MIGUE_PROFILE_LIMITS.description}
                </span>
              </label>

              <fieldset className="grid gap-1 text-sm">
                <legend className={`mb-1 ${LABEL_TEXT}`}>Canales</legend>
                <div className="flex flex-wrap gap-2">
                  {MIGUE_CHANNELS.map((channel) => {
                    const checked = values.channels.includes(channel)
                    return (
                      <label
                        key={channel}
                        className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 ${
                          checked
                            ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => set('channels', checked ? values.channels.filter((item) => item !== channel) : [...values.channels, channel])}
                        />
                        {channel}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <ChoiceField
                  id="migue-form-model"
                  label="Modelo de IA"
                  value={values.llm_model}
                  options={modelOptions}
                  otherLabel="Otro modelo..."
                  placeholder="Gemini 2.5 Flash (OpenRouter)"
                  maxLength={MIGUE_PROFILE_LIMITS.llm_model}
                  error={errors.llm_model}
                  onChange={(model) => set('llm_model', model)}
                />
                <label className={LABEL}>
                  <span className={LABEL_TEXT}>Estado</span>
                  <select className={INPUT} value={values.status} onChange={(e) => set('status', e.target.value)}>
                    {MIGUE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={LABEL}>
                  <span className={LABEL_TEXT}>Color del escenario</span>
                  <span className="flex items-center gap-2">
                    <input type="color" className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" value={values.accent} onChange={(e) => set('accent', e.target.value)} />
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{values.accent}</span>
                  </span>
                </label>
              </div>

              <label className={LABEL}>
                <span className={LABEL_TEXT}>Aspecto</span>
                <input className={INPUT} value={values.look} maxLength={MIGUE_PROFILE_LIMITS.look} placeholder="Chaleco reflectivo y silbato" onChange={(e) => set('look', e.target.value)} />
              </label>

              <div className="grid gap-4">
                <DropZone onFiles={(files) => dropFiles(files, 'poster')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={LABEL_TEXT}>Imagen del Migue {creating ? '' : '(opcional)'}</span>
                    <label className={FILE_BUTTON}>
                      <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        aria-invalid={Boolean(errors.poster)}
                        disabled={Boolean(saving)}
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? [])
                          // Se vacia: elegir de nuevo los mismos archivos tiene que volver a procesarlos.
                          e.target.value = ''
                          void pickImages(files)
                        }}
                      />
                      <ImageIcon className="h-4 w-4" aria-hidden />
                      {images.length ? 'Cambiar imagenes' : 'Elegir imagenes'}
                    </label>
                  </div>
                  <span className={HINT}>
                    La lamina de 8 vistas, las vistas sueltas o una foto de frente, de cuerpo entero. Se separan las figuras y se les quita el fondo: con las 4 vistas, la
                    tarjeta gira. Tambien podes arrastrarlas aca.
                  </span>

                  {viewsBusy && (
                    <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                      Separando las vistas...
                    </p>
                  )}

                  {views && !keepOriginal && views.candidates.length > 1 && (
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {views.candidates.length} figuras encontradas
                        {images.length > 1 ? ` en ${images.length} imagenes` : ''}
                      </span>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {views.candidates.map((candidate) => (
                          <figure key={candidate.label} className="grid shrink-0 justify-items-center gap-0.5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- vista recortada en el navegador (data:) */}
                            <img src={candidate.preview} alt="" className="h-16 w-auto rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900" />
                            <figcaption className="text-[10px] text-slate-500 dark:text-slate-400">{candidate.label.replace('Vista ', '')}</figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  )}

                  {views && !keepOriginal && views.candidates.length > 0 && (
                    <div className={`grid gap-3 ${views.candidates.length > 1 ? 'grid-cols-2 sm:grid-cols-4' : 'max-w-[10rem]'}`}>
                      {VIEW_SLOTS.map((label, slot) => {
                        if (views.candidates.length === 1 && slot > 0) return null
                        const pick = views.slots[slot]
                        const candidate = pick !== null ? views.candidates[pick] : null
                        return (
                          <div key={label} className="grid min-w-0 content-start gap-1.5">
                            <div
                              className="flex aspect-[3/4] items-end justify-center overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"
                              style={{ backgroundColor: values.accent }}
                            >
                              {candidate ? (
                                // eslint-disable-next-line @next/next/no-img-element -- vista recortada en el navegador (data:)
                                <img src={candidate.preview} alt={`${label}: ${candidate.label}`} className="h-full w-full object-contain object-bottom" />
                              ) : (
                                <span className="m-auto px-2 text-center text-xs text-slate-600">Sin vista</span>
                              )}
                            </div>
                            {views.candidates.length > 1 ? (
                              <label className="grid gap-0.5 text-xs">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                                <select className={`${INPUT} h-8 px-2 text-xs`} value={pick ?? ''} onChange={(e) => setSlot(slot, e.target.value === '' ? null : Number(e.target.value))}>
                                  <option value="">Sin vista</option>
                                  {views.candidates.map((option, index) => (
                                    <option key={option.label} value={index}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {views && !keepOriginal && views.candidates.length === 1 && (
                    <span className={HINT}>Con una sola vista la tarjeta queda quieta. Para que gire, subi la lamina de 8 vistas o las vistas sueltas.</span>
                  )}
                  {views && !keepOriginal && views.candidates.length > 1 && views.slots.some((pick) => pick === null) && (
                    <span className="text-xs text-amber-700 dark:text-amber-300">Falta elegir alguna vista: se va a usar solo el frente y la tarjeta queda quieta.</span>
                  )}

                  {keepOriginal && posterPreview && (
                    <div className="flex aspect-[3/4] max-w-[10rem] items-end justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                      {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo local (blob:) */}
                      <img src={posterPreview} alt="" className="h-full w-full object-contain object-bottom" />
                    </div>
                  )}

                  {!images.length && editing && editing.frames.length > 0 && (
                    <div className="grid gap-1">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Actual</span>
                      <div className="flex gap-1.5">
                        {editing.frames.slice(0, 4).map((frame) => (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura de la vista guardada
                          <img key={frame} src={frame} alt="" className="h-20 w-auto rounded border border-slate-200 dark:border-slate-700" style={{ backgroundColor: values.accent }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {images.length > 0 && !viewsBusy && (views?.candidates.length ?? 0) > 0 && (
                    <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
                      Usar la primera imagen tal cual, sin separar las vistas ni quitar el fondo
                    </label>
                  )}

                  {errors.poster && <span className="text-xs text-red-600 dark:text-red-300">{errors.poster}</span>}
                  {dropNotice?.zone === 'poster' && <span className="text-xs text-amber-700 dark:text-amber-300">{dropNotice.text}</span>}
                </DropZone>
                <DropZone onFiles={(files) => dropFiles(files, 'model')}>
                  <span className={LABEL_TEXT}>Modelo 3D (opcional)</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
                      <Box className={`h-5 w-5 ${model || currentModel ? 'dia-primary-text' : 'text-slate-400'}`} aria-hidden />
                    </div>
                    <div className="grid min-w-0 justify-items-start gap-1">
                      <label className={FILE_BUTTON}>
                        <input
                          ref={modelInputRef}
                          type="file"
                          accept=".glb,model/gltf-binary"
                          className="sr-only"
                          aria-invalid={Boolean(errors.model)}
                          disabled={Boolean(saving)}
                          onChange={(e) => void pickModel(e.target.files?.[0] ?? null)}
                        />
                        <Box className="h-4 w-4" aria-hidden />
                        {model || currentModel ? 'Cambiar .glb' : 'Elegir .glb'}
                      </label>
                      <span className="flex w-full min-w-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="truncate" title={model?.name}>
                          {model ? `${model.name} · ${(model.size / MB).toFixed(1)} MB` : currentModel ? 'El actual · o arrastra otro aca' : 'o arrastralo aca'}
                        </span>
                        {(model || errors.model) && (
                          <button type="button" className="shrink-0 font-semibold underline hover:text-slate-900 dark:hover:text-white" onClick={clearModel}>
                            Quitar
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className={errors.model ? 'text-xs text-red-600 dark:text-red-300' : HINT}>
                    {errors.model ?? `Un .glb optimizado de hasta ${MAX_MODEL_BYTES / MB} MB. Para achicarlo: npm run migue:glb -- archivo.glb`}
                  </span>
                  {dropNotice?.zone === 'model' && <span className="text-xs text-amber-700 dark:text-amber-300">{dropNotice.text}</span>}
                </DropZone>
              </div>

              {!creating && editing && !editing.internal && (
                <details className="rounded-md border border-slate-200 text-sm dark:border-slate-700">
                  <summary className={`cursor-pointer px-3 py-2.5 ${LABEL_TEXT}`}>Clave para reportar</summary>
                  <div className="border-t border-slate-200 p-3 dark:border-slate-700">
                    <MigueKeyPanel slug={editing.slug} projectName={editing.project_name} hasKey={hasKeyFor(editing.slug)} onCreated={() => onSaved(editing.slug, true)} />
                  </div>
                </details>
              )}

              {!creating && (
                <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={values.active} onChange={(e) => set('active', e.target.checked)} />
                  <span>
                    <span className={LABEL_TEXT}>Mostrar este Migue en la seccion</span>
                    <span className={`block ${HINT}`}>Si lo ocultas, sus estadisticas quedan guardadas y se puede volver a mostrar desde Supabase.</span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-5 sm:py-4 dark:border-slate-800">
          {created ? (
            <button type="button" className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={requestClose}>
              Listo
            </button>
          ) : (
            <>
              <span aria-live="polite" className={`mr-auto min-w-0 basis-full text-sm sm:basis-auto ${HINT}`}>
                {saving}
              </span>
              <button type="button" className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800" disabled={Boolean(saving)} onClick={requestClose}>
                Cancelar
              </button>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-md dia-primary-bg px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={Boolean(saving)}>
                {saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
                {creating ? 'Agregar Migue' : 'Guardar cambios'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
