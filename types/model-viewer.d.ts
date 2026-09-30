// JSX para el web component <model-viewer> (el paquete solo declara HTMLElementTagNameMap).
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string
  poster?: string
  alt?: string
  loading?: 'auto' | 'lazy' | 'eager'
  reveal?: 'auto' | 'manual'
  'camera-controls'?: boolean
  'auto-rotate'?: boolean
  'auto-rotate-delay'?: number | string
  'rotation-per-second'?: string
  'camera-orbit'?: string
  'min-camera-orbit'?: string
  'max-camera-orbit'?: string
  'field-of-view'?: string
  'interaction-prompt'?: 'auto' | 'none'
  'disable-zoom'?: boolean
  'disable-pan'?: boolean
  'disable-tap'?: boolean
  'shadow-intensity'?: number | string
  'shadow-softness'?: number | string
  exposure?: number | string
  'environment-image'?: string
  'tone-mapping'?: string
  'touch-action'?: string
  'interpolation-decay'?: number | string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes
    }
  }
}
