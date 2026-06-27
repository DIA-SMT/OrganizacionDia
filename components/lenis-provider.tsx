'use client'

import Lenis from 'lenis'
import { useEffect } from 'react'

export function LenisProvider() {
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const lenis = new Lenis({
      duration: 0.9,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1,
      prevent: (node) => {
        const element = node as HTMLElement
        return Boolean(element.closest('input, textarea, select, [data-lenis-prevent]'))
      },
    })

    let frame = 0
    function raf(time: number) {
      lenis.raf(time)
      frame = window.requestAnimationFrame(raf)
    }

    frame = window.requestAnimationFrame(raf)

    return () => {
      window.cancelAnimationFrame(frame)
      lenis.destroy()
    }
  }, [])

  return null
}
