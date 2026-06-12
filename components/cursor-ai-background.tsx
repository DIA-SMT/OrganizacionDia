'use client'

import { useEffect, useRef } from 'react'

export function CursorAiBackground({ isDark }: { isDark: boolean }) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const faceRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
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
        faceRef.current.style.transform = `translate3d(${currentX * 48}px, ${currentY * 34}px, 0) rotateX(${currentY * -4}deg) rotateY(${currentX * 5}deg)`
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

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className={`absolute inset-0 ${isDark ? 'ai-grid-dark' : 'ai-grid-light'}`} />

      <div
        ref={faceRef}
        className={`absolute right-[-18px] top-16 hidden h-[650px] w-[540px] transition-opacity duration-500 lg:block ${
          isDark ? 'opacity-70' : 'opacity-80'
        }`}
      >
        <div className={`absolute inset-8 rounded-full blur-3xl ${isDark ? 'bg-emerald-500/18' : 'bg-emerald-400/22'}`} />
        <div className={`ai-face-shell ${isDark ? 'ai-face-shell-dark' : 'ai-face-shell-light'}`}>
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
