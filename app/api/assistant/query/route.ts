import { runAssistantQuery } from '@/lib/assistant/engine'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: string }
    const question = body.question?.trim()
    if (!question) return Response.json({ error: 'Falta la pregunta.' }, { status: 400 })

    const supabase = await createClient()
    if (!supabase) {
      return Response.json({ error: 'Supabase no está configurado.' }, { status: 500 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Sesión no autorizada.' }, { status: 401 })

    const result = await runAssistantQuery(supabase, question)
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado del asistente.'
    return Response.json({ error: message }, { status: 500 })
  }
}
