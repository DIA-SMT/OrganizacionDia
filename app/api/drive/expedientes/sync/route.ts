import { mapDriveFileToExpediente } from '@/lib/expedientes'
import { getDriveConfig, listExpedientePdfs } from '@/lib/drive/service-account'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

async function isAuthorized(request: Request) {
  const syncSecret = process.env.DRIVE_SYNC_SECRET
  const providedSecret = request.headers.get('x-sync-secret')
  if (syncSecret && providedSecret === syncSecret) return true

  const supabase = await createClient()
  if (!supabase) return false

  const { data } = await supabase.auth.getUser()
  return Boolean(data.user)
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthorized(request))) {
      return Response.json({ error: 'No autorizado.' }, { status: 401 })
    }

    const driveConfig = getDriveConfig()
    if (!driveConfig.configured) {
      return Response.json(
        {
          error: 'Faltan variables de Google Drive Service Account.',
          required: ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', 'GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID'],
        },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdminClient()
    if (!supabase) {
      return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY para sincronizar expedientes.' }, { status: 400 })
    }

    const files = await listExpedientePdfs()
    if (files.length === 0) {
      return Response.json({ synced: 0, expedientes: [] })
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('expedientes')
      .select('drive_file_id, status, priority, summary, brief_generated_at, brief_error')
      .in(
        'drive_file_id',
        files.map((file) => file.id),
      )

    if (existingError) return Response.json({ error: existingError.message }, { status: 500 })

    const existingByDriveId = new Map((existingRows ?? []).map((row) => [row.drive_file_id, row]))
    const rows = files.map((file) => {
      const existing = existingByDriveId.get(file.id)
      const mapped = mapDriveFileToExpediente(file)
      const staleBriefError =
        existing?.brief_error?.includes('No endpoints found for google/gemini') ||
        existing?.brief_error?.includes('Setting up fake worker failed')
      return {
        ...mapped,
        status: existing?.status ?? 'Nuevo',
        priority: existing?.priority ?? 'Media',
        summary: existing?.summary ?? mapped.summary,
        brief_generated_at: existing?.brief_generated_at ?? null,
        brief_error: staleBriefError ? null : existing?.brief_error ?? null,
      }
    })

    const { data, error } = await supabase
      .from('expedientes')
      .upsert(rows, { onConflict: 'drive_file_id' })
      .select('id, drive_file_id, name, summary, drive_url, drive_created_at, detected_at, status, priority, brief_generated_at, brief_error')

    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({
      synced: data?.length ?? 0,
      expedientes: data ?? [],
    })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'No se pudo sincronizar Drive.',
      },
      { status: 500 },
    )
  }
}
