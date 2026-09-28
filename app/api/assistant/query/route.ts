import { runAssistantQuery } from '@/lib/assistant/engine'
import { synthesizeAssistantAnswerWithUsage } from '@/lib/assistant/synthesis'
import { INTENT_TOPICS, MIGUE_DIA_SLUG, recordMigueConversation } from '@/lib/migue-record'
import { createClient } from '@/lib/supabase/server'
import { after } from 'next/server'

export async function POST(request: Request) {
  const startedAt = new Date()
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
    const { text, usage } = await synthesizeAssistantAnswerWithUsage({
      question,
      evidence: result.text,
      sources: result.sources,
    })

    // Metricas de Migue DIA: se registran despues de responder, sin demorar al usuario.
    const endedAt = new Date()
    after(() =>
      recordMigueConversation(MIGUE_DIA_SLUG, {
        conversation_id: `web:${crypto.randomUUID()}`,
        channel: 'Web',
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        messages: 2,
        outcome: result.fallback ? 'sin_respuesta' : 'resuelta',
        avg_response_ms: endedAt.getTime() - startedAt.getTime(),
        ...usage,
        // Una pregunta no entendida no suma a ningun tema: va a "Preguntas sin respuesta".
        topic: result.fallback ? undefined : INTENT_TOPICS[result.intent],
        unanswered_question: result.fallback ? question : undefined,
      }),
    )

    return Response.json({ ...result, text })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado del asistente.'
    return Response.json({ error: message }, { status: 500 })
  }
}
