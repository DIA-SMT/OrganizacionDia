type SynthesisInput = {
  question: string
  evidence: string
  sources?: string[]
  apiKey?: string
  model?: string
}

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
}

export type SynthesisUsage = { tokens_in: number | null; tokens_out: number | null; cost_usd: number | null }

export async function synthesizeAssistantAnswer(input: SynthesisInput) {
  return (await synthesizeAssistantAnswerWithUsage(input)).text
}

// Igual que synthesizeAssistantAnswer, pero ademas devuelve el consumo que informa OpenRouter
// (lo usa Migue DIA para registrar tokens y costo). usage es null si no hubo llamada al modelo.
export async function synthesizeAssistantAnswerWithUsage({
  question,
  evidence,
  sources = [],
  apiKey = process.env.OPENROUTER_API_KEY,
  model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
}: SynthesisInput): Promise<{ text: string; usage: SynthesisUsage | null }> {
  if (!apiKey) return { text: evidence, usage: null }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'Organizacion DIA',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content: 'Sos el asistente interno de la Direccion de Inteligencia Artificial. Responde en español argentino, de forma clara y breve. Usa exclusivamente la evidencia proporcionada. No inventes nombres, fechas, estados, commits ni conclusiones. Si falta un dato, indicalo. Conserva los detalles concretos importantes.',
          },
          {
            role: 'user',
            content: `Pregunta: ${question}\n\nEvidencia verificada:\n${evidence}\n\nFuentes: ${sources.join(', ') || 'dashboard interno'}`,
          },
        ],
        // Pide a OpenRouter que informe el costo de la llamada junto con los tokens.
        usage: { include: true },
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) return { text: evidence, usage: null }
    const payload = (await response.json()) as OpenRouterResponse
    const usage = payload.usage
      ? {
          tokens_in: payload.usage.prompt_tokens ?? null,
          tokens_out: payload.usage.completion_tokens ?? null,
          cost_usd: payload.usage.cost ?? null,
        }
      : null
    return { text: payload.choices?.[0]?.message?.content?.trim() || evidence, usage }
  } catch {
    return { text: evidence, usage: null }
  } finally {
    clearTimeout(timeout)
  }
}
