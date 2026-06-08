'use client'

import { createBrowserClient } from '@supabase/ssr'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

const withTimeoutFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const timeoutMs = Number(process.env.NEXT_PUBLIC_SUPABASE_FETCH_TIMEOUT_MS ?? '12000')
  const timeout = window.setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 12000)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) return null

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      isSingleton: true,
      global: {
        fetch: withTimeoutFetch,
      },
    })
  }

  return browserClient
}
