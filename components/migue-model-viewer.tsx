'use client'

import { MIGUE_VIEW_LABELS } from '@/lib/migue'
import type { ModelViewerElement } from '@google/model-viewer'
import { useReducedMotion } from 'framer-motion'
import { LoaderCircle, MoveHorizontal, Pause, Play } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

type MigueModelViewerProps = {
  src: string
  // Vista de frente en imagen: se ve mientras carga el modelo y si el navegador no puede mostrarlo.
  poster: string
  name: string
  stageClassName?: string
}

// Angulo de la camara para cada vista, en el mismo orden que las imagenes.
// La camara se mueve alrededor: para ver al Migue mirando a la derecha va hacia su izquierda.
const VIEW_ORBITS = ['0deg', '-90deg', '180deg', '90deg']
const POLAR = '82deg'
// Copia de node_modules/meshoptimizer/meshopt_decoder.cjs (MIT).
const MESHOPT_DECODER = '/vendor/meshopt_decoder.js'

export function MigueModelViewer({ src, poster, name, stageClassName = '' }: MigueModelViewerProps) {
  const reduceMotion = useReducedMotion()
  const viewerRef = useRef<ModelViewerElement>(null)
  const [elementReady, setElementReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [touched, setTouched] = useState(false)
  // null mientras gira solo o despues de moverlo a mano: ninguna vista fija esta seleccionada.
  const [view, setView] = useState<number | null>(null)

  // model-viewer registra un web component que usa window: se carga solo en el navegador y
  // recien cuando se abre una ficha con modelo 3D (pesa ~1 MB).
  useEffect(() => {
    let cancelled = false
    import('@google/model-viewer')
      .then(({ ModelViewerElement }) => {
        // Los modelos van comprimidos con meshopt; el decodificador oficial se sirve desde /public.
        ModelViewerElement.meshoptDecoderLocation = MESHOPT_DECODER
        if (!cancelled) setElementReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const onLoad = () => setLoaded(true)
    const onError = () => setFailed(true)
    // El usuario lo tomo con el mouse, el dedo o el teclado: deja de girar solo.
    const onCameraChange = (event: Event) => {
      if ((event as CustomEvent<{ source: string }>).detail?.source !== 'user-interaction') return
      setTouched(true)
      setPaused(true)
      setView(null)
    }
    viewer.addEventListener('load', onLoad)
    viewer.addEventListener('error', onError)
    viewer.addEventListener('camera-change', onCameraChange)
    return () => {
      viewer.removeEventListener('load', onLoad)
      viewer.removeEventListener('error', onError)
      viewer.removeEventListener('camera-change', onCameraChange)
    }
  }, [elementReady])

  const spinning = !reduceMotion && !paused

  function goToView(index: number) {
    const viewer = viewerRef.current
    if (!viewer) return
    setTouched(true)
    setPaused(true)
    setView(index)
    viewer.resetTurntableRotation(0)
    viewer.cameraOrbit = `${VIEW_ORBITS[index]} ${POLAR} auto`
  }

  if (failed) {
    return (
      <div className={`relative ${stageClassName}`}>
        <Image src={poster} alt={name} fill sizes="380px" className="object-contain object-bottom" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${stageClassName}`}>
        {!loaded && (
          <>
            <Image src={poster} alt="" aria-hidden fill sizes="380px" priority className="object-contain object-bottom" />
            <span className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Cargando 3D
            </span>
          </>
        )}
        {elementReady && (
          <model-viewer
            ref={viewerRef}
            src={src}
            alt={`${name} en 3D. Arrastralo o usa las flechas para girarlo.`}
            loading="eager"
            camera-controls
            auto-rotate={spinning}
            auto-rotate-delay={0}
            rotation-per-second="28deg"
            camera-orbit={`${VIEW_ORBITS[0]} ${POLAR} auto`}
            // Solo gira en horizontal, como en una vitrina: sin zoom ni desplazamiento.
            min-camera-orbit="auto 70deg auto"
            max-camera-orbit="auto 95deg auto"
            interaction-prompt="none"
            disable-zoom
            disable-pan
            touch-action="pan-y"
            shadow-intensity={1}
            shadow-softness={0.9}
            exposure={1.05}
            className={`absolute inset-0 h-full w-full cursor-grab bg-transparent outline-offset-4 transition-opacity duration-500 active:cursor-grabbing ${loaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ '--poster-color': 'transparent', '--progress-bar-color': 'transparent' } as React.CSSProperties}
          />
        )}
        {loaded && !touched && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur"
          >
            <MoveHorizontal className="h-3.5 w-3.5" />
            Modelo 3D: arrastralo para girarlo
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {MIGUE_VIEW_LABELS.map((label, index) => (
          <button
            key={label}
            type="button"
            disabled={!loaded}
            aria-pressed={view === index}
            className={`h-8 rounded-md border px-2.5 text-xs font-semibold transition disabled:opacity-50 ${
              view === index
                ? 'dia-primary-border dia-surface-raised-bg dia-primary-text dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
            onClick={() => goToView(index)}
          >
            {label}
          </button>
        ))}
        {!reduceMotion && (
          <button
            type="button"
            disabled={!loaded}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/70 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={paused ? 'Girar solo' : 'Pausar el giro'}
            title={paused ? 'Girar solo' : 'Pausar el giro'}
            onClick={() => {
              setPaused((current) => !current)
              setView(null)
            }}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}
