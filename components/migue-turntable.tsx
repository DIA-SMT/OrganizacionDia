'use client'

import { MIGUE_VIEW_LABELS } from '@/lib/migue'
import { useReducedMotion } from 'framer-motion'
import { MoveHorizontal, Pause, Play } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

type MigueTurntableProps = {
  frames: string[]
  name: string
  // hover: gira mientras el puntero esta encima (o mientras `active`). always: gira hasta que alguien lo toma.
  autoRotate?: 'off' | 'hover' | 'always'
  // Hover controlado desde afuera: la tarjeta entera cuenta como "encima", no solo el escenario.
  active?: boolean
  // Permite girarlo arrastrando con el mouse o el dedo, con el teclado y con los botones de vista.
  interactive?: boolean
  sizes: string
  priority?: boolean
  // Tamaño del escenario donde se para el muñequito.
  stageClassName?: string
}

const STEP_DEG = 90
const HOLD_MS = 1100
// Ancho minimo del muñequito en el instante en que cambia de vista: da la sensacion de giro.
const MIN_SCALE = 0.45

const mod = (value: number, n: number) => ((value % n) + n) % n
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Como se ve cada vista para un angulo continuo: la vista actual se angosta hasta la mitad del
// giro, ahi se cruza con la siguiente, que se ensancha hasta quedar de frente. La que entra ya
// esta opaca debajo cuando la que sale se desvanece encima: nunca se ven dos figuras transparentes.
function frameStyle(index: number, angle: number, count: number) {
  const base = Math.floor(angle / STEP_DEG)
  const t = (angle - base * STEP_DEG) / STEP_DEG
  const from = mod(base, count)
  const to = mod(base + 1, count)
  if (index === from) return { opacity: 1 - smoothstep(0.5, 0.56, t), scale: 1 - (1 - MIN_SCALE) * Math.min(1, t / 0.5), zIndex: 2 }
  if (index === to) return { opacity: smoothstep(0.44, 0.5, t), scale: MIN_SCALE + (1 - MIN_SCALE) * Math.max(0, (t - 0.5) / 0.5), zIndex: 1 }
  return { opacity: 0, scale: MIN_SCALE, zIndex: 0 }
}

export function MigueTurntable({
  frames,
  name,
  autoRotate = 'off',
  active = false,
  interactive = false,
  sizes,
  priority = false,
  stageClassName = '',
}: MigueTurntableProps) {
  const reduceMotion = useReducedMotion()
  const count = frames.length
  // Con una sola imagen (un Migue agregado desde el dashboard sin vistas) no hay giro: queda quieto.
  const single = count < 2
  const [angle, setAngle] = useState(0)
  const angleRef = useRef(0)
  const animation = useRef<number | null>(null)
  const drag = useRef<{ pointerId: number; lastX: number; lastT: number; velocity: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [paused, setPaused] = useState(false)
  const [touched, setTouched] = useState(false)

  const view = mod(Math.round(angle / STEP_DEG), count)
  const hoverActive = hovering || active

  const place = useCallback((next: number) => {
    angleRef.current = next
    setAngle(next)
  }, [])

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
  }, [])

  const animateTo = useCallback(
    (target: number, duration = 420) => {
      stopAnimation()
      const from = angleRef.current
      if (reduceMotion || from === target) {
        place(target)
        return
      }
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration)
        const eased = 1 - (1 - progress) ** 3
        place(from + (target - from) * eased)
        animation.current = progress < 1 ? requestAnimationFrame(tick) : null
      }
      animation.current = requestAnimationFrame(tick)
    },
    [place, reduceMotion, stopAnimation],
  )

  useEffect(() => stopAnimation, [stopAnimation])

  // Con foco de teclado no gira solo: el lector de pantalla no anuncia cambios sin parar.
  const spinning =
    !single && !reduceMotion && !paused && !dragging && !focused && (autoRotate === 'always' || (autoRotate === 'hover' && hoverActive))

  // Giro automatico: se queda un momento en cada vista y gira 90° hacia la siguiente.
  useEffect(() => {
    if (!spinning) return
    const timer = window.setInterval(() => {
      animateTo(Math.round(angleRef.current / STEP_DEG) * STEP_DEG + STEP_DEG)
    }, HOLD_MS)
    return () => window.clearInterval(timer)
  }, [spinning, animateTo])

  // Las tarjetas vuelven a mirar de frente cuando se va el puntero.
  useEffect(() => {
    if (autoRotate !== 'hover' || interactive || hoverActive) return
    const turn = STEP_DEG * count
    animateTo(Math.round(angleRef.current / turn) * turn)
  }, [autoRotate, interactive, hoverActive, count, animateTo])

  function takeOver() {
    setTouched(true)
    if (autoRotate !== 'off') setPaused(true)
  }

  // Lleva a una vista por el camino mas corto.
  function goToView(index: number) {
    takeOver()
    const current = Math.round(angleRef.current / STEP_DEG)
    let delta = mod(index - current, count)
    if (delta > count / 2) delta -= count
    animateTo((current + delta) * STEP_DEG)
  }

  // Arrastrar a la derecha lo gira hacia la derecha; el ancho del escenario equivale a media vuelta.
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    stopAnimation()
    takeOver()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, lastX: event.clientX, lastT: event.timeStamp, velocity: 0 }
    setDragging(true)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const degPerPx = 180 / Math.max(160, event.currentTarget.clientWidth)
    const dx = event.clientX - current.lastX
    // Piso de 16ms: dos eventos en el mismo milisegundo no disparan la velocidad.
    const dt = Math.max(16, event.timeStamp - current.lastT)
    current.velocity = 0.6 * current.velocity + 0.4 * ((dx * degPerPx) / dt)
    current.lastX = event.clientX
    current.lastT = event.timeStamp
    place(angleRef.current + dx * degPerPx)
  }

  // Al soltar sigue un poco por inercia y se acomoda en la vista mas cercana.
  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    setDragging(false)
    // La inercia suma como mucho una vista: un tiron fuerte no lo hace dar vueltas de mas.
    const inertia = Math.max(-STEP_DEG * 0.75, Math.min(STEP_DEG * 0.75, current.velocity * 200))
    animateTo(Math.round((angleRef.current + inertia) / STEP_DEG) * STEP_DEG, 480)
  }

  const KEY_STEPS: Record<string, (current: number) => number> = {
    ArrowRight: (current) => current + 1,
    ArrowUp: (current) => current + 1,
    ArrowLeft: (current) => current - 1,
    ArrowDown: (current) => current - 1,
    Home: () => 0,
    End: () => count - 1,
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = KEY_STEPS[event.key]
    if (!step) return
    event.preventDefault()
    goToView(mod(step(view), count))
  }

  const viewLabel = MIGUE_VIEW_LABELS[view] ?? `Vista ${view + 1}`

  const rotatable = interactive && !single

  const stage = (
    <div
      className={`relative select-none ${rotatable ? `touch-pan-y outline-offset-4 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}` : ''} ${stageClassName}`}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      {...(rotatable
        ? {
            role: 'slider',
            tabIndex: 0,
            'aria-label': `${name}, vista 360. Arrastralo o usa las flechas para girarlo.`,
            'aria-valuemin': 0,
            'aria-valuemax': count - 1,
            'aria-valuenow': view,
            'aria-valuetext': viewLabel,
            onKeyDown,
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
          }
        : { role: 'img', 'aria-label': name })}
    >
      {/* Sombra de piso comun a todas las vistas: el giro no "salta". */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[1.5%] left-1/2 h-[6%] w-[56%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(11_22_53/0.3),transparent)] dark:bg-[radial-gradient(closest-side,rgb(0_0_0/0.6),transparent)]"
      />
      {frames.map((src, index) => {
        const { opacity, scale, zIndex } = single ? { opacity: 1, scale: 1, zIndex: 1 } : frameStyle(index, angle, count)
        return (
          <Image
            key={src}
            src={src}
            alt=""
            aria-hidden
            fill
            sizes={sizes}
            priority={priority}
            draggable={false}
            className="pointer-events-none origin-bottom object-contain object-bottom"
            style={{ opacity, zIndex, transform: `scaleX(${scale})` }}
          />
        )
      })}
      {rotatable && !touched && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur"
        >
          <MoveHorizontal className="h-3.5 w-3.5" />
          Arrastralo para girarlo
        </span>
      )}
    </div>
  )

  if (!interactive) return stage

  return (
    <div className="flex flex-col items-center gap-3">
      {stage}
      {rotatable && (
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {frames.map((src, index) => (
          <button
            key={src}
            type="button"
            aria-pressed={index === view}
            className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition ${
              index === view
                ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
            onClick={() => goToView(index)}
          >
            {MIGUE_VIEW_LABELS[index]}
          </button>
        ))}
        {autoRotate !== 'off' && !reduceMotion && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/70 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={paused ? 'Girar solo' : 'Pausar el giro'}
            title={paused ? 'Girar solo' : 'Pausar el giro'}
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      )}
    </div>
  )
}
