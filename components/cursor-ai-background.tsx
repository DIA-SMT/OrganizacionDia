'use client'

import { useEffect, useRef } from 'react'

type CursorAiBackgroundProps = {
  isDark: boolean
  /**
   * page: fondo de pantalla con grilla y la cabeza detras del contenido.
   * hero: solo la cabeza, en trazo claro, dentro de la portada azul del dashboard.
   */
  variant?: 'page' | 'hero'
}

/** Cabeza de IA que sigue al cursor (solo escritorio y sin "reducir movimiento"). */
export function CursorAiBackground({ isDark, variant = 'page' }: CursorAiBackgroundProps) {
  const faceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canAnimate =
      window.matchMedia('(min-width: 1024px)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!canAnimate) return

    let frame = 0
    let idleTimer = 0
    let running = false
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    function handlePointerMove(event: PointerEvent) {
      targetX = (event.clientX / window.innerWidth - 0.5) * 2
      targetY = (event.clientY / window.innerHeight - 0.5) * 2

      if (!running) {
        running = true
        frame = window.requestAnimationFrame(animate)
      }

      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        running = false
        window.cancelAnimationFrame(frame)
      }, 900)
    }

    function animate() {
      currentX += (targetX - currentX) * 0.06
      currentY += (targetY - currentY) * 0.06

      if (faceRef.current) {
        faceRef.current.style.transform = `translate3d(calc(-50% + ${currentX * 48}px), ${currentY * 34}px, 0) rotateX(${currentY * -4}deg) rotateY(${currentX * 5}deg)`
      }

      if (running) frame = window.requestAnimationFrame(animate)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.clearTimeout(idleTimer)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const isHero = variant === 'hero'
  const shellTone = isHero ? 'ai-face-shell-hero' : isDark ? 'ai-face-shell-dark' : 'ai-face-shell-light'
  const glow = isHero ? 'bg-sky-300/20' : isDark ? 'bg-blue-500/18' : 'bg-blue-400/22'

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${isHero ? 'z-[1]' : 'z-0'}`} aria-hidden="true">
      {!isHero && <div className={`absolute inset-0 ${isDark ? 'ai-grid-dark' : 'ai-grid-light'}`} />}

      <div
        ref={faceRef}
        className={`absolute hidden h-[650px] w-[540px] transition-opacity duration-500 lg:block ${
          isHero ? 'ai-face-hero left-[66%] top-[-90px] opacity-90' : `left-1/2 top-40 ${isDark ? 'opacity-70' : 'opacity-80'}`
        }`}
        style={{ transform: 'translate3d(-50%, 0, 0)' }}
      >
        <div className={`absolute inset-8 rounded-full blur-3xl ${glow}`} />
        <div className={`ai-face-shell ${shellTone}`}>
          <div className="ai-face-scanline" />
          <div className="ai-face-brow ai-face-brow-left" />
          <div className="ai-face-brow ai-face-brow-right" />
          <div className="ai-face-eye ai-face-eye-left" />
          <div className="ai-face-eye ai-face-eye-right" />
          <div className="ai-face-nose" />
          <div className="ai-face-mouth" />
          <div className="ai-face-node ai-face-node-one" />
          <div className="ai-face-node ai-face-node-two" />
          <div className="ai-face-node ai-face-node-three" />
          <div className="ai-face-circuit ai-face-circuit-one" />
          <div className="ai-face-circuit ai-face-circuit-two" />
        </div>
      </div>
    </div>
  )
}
