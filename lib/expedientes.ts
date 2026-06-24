import type { DrivePdfFile } from '@/lib/drive/service-account'

export type ExpedienteRow = {
  id: string
  drive_file_id: string
  name: string
  summary: string
  drive_url: string
  mime_type: string
  size_bytes: number | null
  drive_created_at: string
  drive_modified_at: string
  detected_at: string
  status: string
  priority: string
  brief_generated_at: string | null
  brief_error: string | null
  created_at: string
  updated_at: string
}

export function mapDriveFileToExpediente(file: DrivePdfFile) {
  return {
    drive_file_id: file.id,
    name: file.name,
    summary: '',
    drive_url: file.webViewLink,
    mime_type: file.mimeType,
    size_bytes: file.size ? Number(file.size) : null,
    drive_created_at: file.createdTime,
    drive_modified_at: file.modifiedTime,
    status: 'Nuevo',
    priority: 'Media',
  }
}

export function expedientePriorityWeight(priority: string) {
  if (priority === 'Alta') return 3
  if (priority === 'Media') return 2
  return 1
}

export function formatExpedienteDate(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
