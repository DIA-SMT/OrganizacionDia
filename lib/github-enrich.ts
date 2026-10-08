// Lado servidor del completado de proyectos con datos de GitHub: trae lenguajes y README de
// un repo y le pide al modelo un resumen breve. Las decisiones (que se completa y que no)
// estan en lib/github-sync.ts. Lo usa app/api/github/sync-projects/route.ts.

import { NO_SUMMARY, cleanSummary, usefulReadme } from '@/lib/github-sync'

type OpenRouterResponse = { choices?: Array<{ message?: { content?: string } }> }

async function githubFetch(path: string, headers: HeadersInit, accept?: string) {
  try {
    return await fetch(`https://api.github.com${path}`, {
      headers: accept ? { ...headers, Accept: accept } : headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    return null
  }
}

export async function fetchRepoDetails(repoKey: string, headers: HeadersInit) {
  const [languagesResponse, readmeResponse] = await Promise.all([
    githubFetch(`/repos/${repoKey}/languages`, headers),
    // raw devuelve el markdown tal cual, sin base64.
    githubFetch(`/repos/${repoKey}/readme`, headers, 'application/vnd.github.raw+json'),
  ])

  const languages = languagesResponse?.ok ? ((await languagesResponse.json()) as Record<string, number>) : null
  const readme = readmeResponse?.ok ? await readmeResponse.text() : null
  // 404 (sin README) o 403 (el token no lee el contenido) son definitivos; sin respuesta o con
  // un error interno de GitHub, se reintenta en la proxima corrida.
  const failed = [languagesResponse, readmeResponse].some((response) => !response || response.status >= 500)
  return { languages, readme, failed }
}

// Resumen de 2 o 3 oraciones para alguien no tecnico. null si no hay README util, si falta
// la clave de OpenRouter o si el modelo responde que el README no alcanza. Si la llamada
// falla se reintenta una vez; despues se sigue sin resumen para no trabar la cola.
export async function summarizeReadme(projectName: string, githubDescription: string | null, readme: string | null) {
  const text = usefulReadme(readme)
  if (!text || !process.env.OPENROUTER_API_KEY) return null

  const first = await requestSummary(projectName, githubDescription, text)
  if (!first.failed) return first.text
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return (await requestSummary(projectName, githubDescription, text)).text
}

async function requestSummary(projectName: string, githubDescription: string | null, text: string) {
  const apiKey = process.env.OPENROUTER_API_KEY

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
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
        temperature: 0.2,
        max_tokens: 260,
        messages: [
          {
            role: 'system',
            content: [
              'Describis proyectos de la Direccion de Inteligencia Artificial de la Municipalidad de San Miguel de Tucuman para un tablero interno.',
              'Escribi en español, en 2 o 3 oraciones (maximo 70 palabras), en prosa y sin listas ni markdown.',
              'Explica que es el sistema, para quien es y que problema resuelve o que permite hacer.',
              'No nombres tecnologias, librerias, comandos ni pasos de instalacion. Usa solo lo que dice el README; no inventes.',
              `Si el README no explica de que se trata el proyecto (por ejemplo, es solo una plantilla o instrucciones tecnicas), responde exactamente ${NO_SUMMARY}.`,
            ].join(' '),
          },
          {
            role: 'user',
            content: `Proyecto: ${projectName}\nDescripcion en GitHub: ${githubDescription || '(sin descripcion)'}\n\nREADME:\n${text}`,
          },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) return { text: null, failed: true }

    const payload = (await response.json()) as OpenRouterResponse
    return { text: cleanSummary(payload.choices?.[0]?.message?.content), failed: false }
  } catch {
    return { text: null, failed: true }
  }
}
