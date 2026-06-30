type SynthesisInput = {
  question: string
  evidence: string
  sources?: string[]
  apiKey?: string
  model?: string
}

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>
}

export async function synthesizeAssistantAnswer({
  question,
  evidence,
  sources = [],
  apiKey = process.env.OPENROUTER_API_KEY,
  model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
}: SynthesisInput) {
  if (!apiKey) return evidence

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
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) return evidence
    const payload = (await response.json()) as OpenRouterResponse
    return payload.choices?.[0]?.message?.content?.trim() || evidence
  } catch {
    return evidence
  } finally {
    clearTimeout(timeout)
  }
}
