import { generateLocalExpedienteBrief } from '@/lib/ocr/expediente-brief'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabaseSession = await createClient()
  const { data: authData } = supabaseSession ? await supabaseSession.auth.getUser() : { data: { user: null } }
  if (!authData.user) return Response.json({ error: 'No autorizado.' }, { status: 401 })

  const supabase = getSupabaseAdminClient()
  if (!supabase) return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 400 })

  const { id } = await params
  const { data: expediente, error: fetchError } = await supabase
    .from('expedientes')
    .select('id, drive_file_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 })
  if (!expediente) return Response.json({ error: 'Expediente no encontrado.' }, { status: 404 })

  try {
    const brief = await generateLocalExpedienteBrief(expediente.drive_file_id)
    const generatedAt = new Date().toISOString()
    const { data, error: updateError } = await supabase
      .from('expedientes')
      .update({
        summary: brief.summary,
        brief_generated_at: generatedAt,
        brief_error: null,
        updated_at: generatedAt,
      })
      .eq('id', expediente.id)
      .select('id, summary, priority, brief_generated_at, brief_error')
      .single()

    if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

    return Response.json({
      expediente: data,
      suggestedPriority: brief.suggestedPriority,
      pagesProcessed: brief.pagesProcessed,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'No se pudo generar el brief.'
    await supabase.from('expedientes').update({ brief_error: errorMessage }).eq('id', expediente.id)
    return Response.json({ error: errorMessage }, { status: 500 })
  }
}
