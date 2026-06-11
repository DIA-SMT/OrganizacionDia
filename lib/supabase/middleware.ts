import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const url = request.nextUrl
  const publicPath =
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/forgot-password') ||
    url.pathname.startsWith('/reset-password') ||
    url.pathname.startsWith('/api/auth')

  if (!supabaseUrl || !supabaseAnonKey) {
    if (publicPath) return NextResponse.next({ request })

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(redirectUrl)
  }

  const isRscRequest =
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    request.headers.get('Purpose') === 'prefetch' ||
    request.headers.get('X-Middleware-Prefetch') === '1'

  if (isRscRequest && publicPath) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  let user = null
  try {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()
    user = currentUser
  } catch {
    return supabaseResponse
  }

  if (!user && !publicPath) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
