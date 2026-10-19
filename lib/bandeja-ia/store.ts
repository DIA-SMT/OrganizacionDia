'use client'

// Datos de Bandeja IA compartidos entre las pantallas del modulo. Se leen de Supabase una
// vez por usuario y se vuelven a leer despues de cada accion (refreshBandeja).

import { useEffect, useSyncExternalStore } from 'react'
import { fetchBandejaData, type BandejaData } from './repository'

export type BandejaStoreState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: BandejaData | null
  error: string | null
  refreshing: boolean
}

// El sidebar escucha este evento para actualizar su contador.
export const BANDEJA_UPDATED_EVENT = 'bandeja-ia-updated'

const INITIAL: BandejaStoreState = { status: 'idle', data: null, error: null, refreshing: false }

let state: BandejaStoreState = INITIAL
let loadedFor: string | null = null
const listeners = new Set<() => void>()

function setState(next: Partial<BandejaStoreState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function load() {
  setState(state.data ? { refreshing: true } : { status: 'loading', error: null })
  try {
    const data = await fetchBandejaData()
    setState({ status: 'ready', data, error: null, refreshing: false })
  } catch (error) {
    // Si ya habia datos se conservan y se muestra el error arriba.
    setState({ status: state.data ? 'ready' : 'error', error: error instanceof Error ? error.message : 'No se pudo leer Bandeja IA.', refreshing: false })
  }
}

export function refreshBandeja(): Promise<void> {
  window.dispatchEvent(new Event(BANDEJA_UPDATED_EVENT))
  return load()
}

function ensureLoaded(userId: string) {
  if (loadedFor === userId) return
  loadedFor = userId
  state = INITIAL
  void refreshBandeja()
}

export function useBandejaStore(userId: string | null): BandejaStoreState {
  useEffect(() => {
    if (userId) ensureLoaded(userId)
  }, [userId])
  return useSyncExternalStore(subscribe, () => state, () => INITIAL)
}

// Ejecuta una escritura y vuelve a leer. Devuelve el mensaje de error, o null si salio bien.
export async function runBandejaAction(action: () => Promise<unknown>): Promise<string | null> {
  try {
    await action()
    await refreshBandeja()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'No se pudo completar la acción.'
  }
}
