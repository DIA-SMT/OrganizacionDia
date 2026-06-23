import { downloadDriveFile } from '@/lib/drive/service-account'

export type LocalExpedienteBrief = {
  summary: string
  suggestedPriority: 'Alta' | 'Media' | 'Baja'
  pagesProcessed: number
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function inferPriority(text: string): LocalExpedienteBrief['suggestedPriority'] {
  const normalized = text.toLowerCase()
  const urgentTerms = ['urgente', 'intimación', 'vencimiento', 'plazo', 'riesgo', 'emergencia', 'inmediato', 'incumplimiento']
  const lowTerms = ['para conocimiento', 'informativo', 'archivo', 'constancia', 'notificación']

  if (urgentTerms.some((term) => normalized.includes(term))) return 'Alta'
  if (lowTerms.some((term) => normalized.includes(term))) return 'Baja'
  return 'Media'
}

function buildExtractiveBrief(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 320)

  const uniqueSentences = Array.from(new Set(sentences))
  if (uniqueSentences.length > 0) return uniqueSentences.slice(0, 5).join(' ')

  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > 900 ? `${compact.slice(0, 900).trim()}...` : compact
}

export async function generateLocalExpedienteBrief(driveFileId: string): Promise<LocalExpedienteBrief> {
  const [{ pdf }, { createWorker }] = await Promise.all([import('pdf-to-img'), import('tesseract.js')])
  const maxMb = Number(process.env.EXPEDIENTES_OCR_MAX_MB || 15)
  const maxPages = Math.max(1, Number(process.env.EXPEDIENTES_OCR_MAX_PAGES || 5))
  const pdfBytes = await downloadDriveFile(driveFileId)
  const sizeMb = pdfBytes.byteLength / 1024 / 1024

  if (sizeMb > maxMb) {
    throw new Error(`El PDF pesa ${sizeMb.toFixed(1)} MB y supera el limite de ${maxMb} MB.`)
  }

  const document = await pdf(`data:application/pdf;base64,${pdfBytes.toString('base64')}`, { scale: 2 })
  const worker = await createWorker('spa')
  const textParts: string[] = []
  const pagesToProcess = Math.min(document.length, maxPages)

  try {
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      const image = await document.getPage(pageNumber)
      const result = await worker.recognize(image)
      if (result.data.text.trim()) textParts.push(result.data.text)
    }
  } finally {
    await worker.terminate()
    await document.destroy()
  }

  const text = normalizeOcrText(textParts.join('\n\n'))
  if (!text) throw new Error('El OCR no pudo reconocer texto en las paginas procesadas.')

  return {
    summary: buildExtractiveBrief(text),
    suggestedPriority: inferPriority(text),
    pagesProcessed: pagesToProcess,
  }
}
