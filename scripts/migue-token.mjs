// Genera la clave con la que un Migue externo reporta sus conversaciones.
// Uso: npm run migue:token -- <slug>   (por ejemplo turismo)
// Imprime la clave (se ve una sola vez: pasala al equipo del bot) y el SQL que guarda su hash.
// Desde el dashboard se hace lo mismo con el boton "Generar la clave" de la ficha del Migue.
import { MIGUES } from '../lib/migue.ts'
import { generateIngestToken, hashIngestToken } from '../lib/migue-ingest.ts'

const slug = process.argv[2]
const known = MIGUES.map((migue) => migue.slug)

if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error(`Uso: npm run migue:token -- <slug>\nSlugs del codigo: ${known.join(', ')}`)
  process.exit(1)
}
if (!known.includes(slug)) {
  console.warn(`Aviso: ${slug} no esta en lib/migue.ts. Si se agrego desde el dashboard esta bien; si no, revisa el nombre.`)
}

const token = generateIngestToken()
const hash = await hashIngestToken(token)

console.log(`
Clave de ${slug} (guardala en el servidor del bot como MIGUE_API_KEY; no se vuelve a mostrar):
  ${token}

Ejecuta esto en Supabase > SQL Editor (si ya tenia clave, la reemplaza):
  insert into public.migue_ingest_keys (migue_slug, token_hash)
  values ('${slug}', '${hash}')
  on conflict (migue_slug) do update
    set token_hash = excluded.token_hash, active = true, created_at = now(), last_used_at = null;
`)
