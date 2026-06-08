import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const errorParam = searchParams.get('error')

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey || !code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
  }

  const cookieStore = await cookies()
  let cookiesToSetInResponse: Array<{ name: string; value: string; options: Record<string, unknown> }> = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(items) {
        cookiesToSetInResponse = items
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
  }

  const next = searchParams.get('next') ?? (type === 'recovery' ? '/reset-password' : '/')
  const response = NextResponse.redirect(`${origin}${next}`)

  cookiesToSetInResponse.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  return response
}
