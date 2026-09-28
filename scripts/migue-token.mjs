// Genera la clave con la que un Migue externo reporta sus conversaciones.
// Uso: npm run migue:token -- <slug>   (el slug es el de lib/migue.ts, por ejemplo turismo)
// Imprime la clave (se ve una sola vez: pasala al equipo del bot) y el SQL que guarda su hash.
import { createHash, randomBytes } from 'node:crypto'
import { MIGUES } from '../lib/migue.ts'

const slug = process.argv[2]
const known = MIGUES.map((migue) => migue.slug)

if (!slug || !known.includes(slug)) {
  console.error(`Uso: npm run migue:token -- <slug>\nSlugs: ${known.join(', ')}`)
  process.exit(1)
}

const token = `migue_${randomBytes(32).toString('base64url')}`
const hash = createHash('sha256').update(token).digest('hex')

console.log(`
Clave de ${slug} (guardala en el servidor del bot como MIGUE_API_KEY; no se vuelve a mostrar):

  ${token}

Ejecuta esto en Supabase > SQL Editor (si ya tenia clave, la reemplaza):

  insert into public.migue_ingest_keys (migue_slug, token_hash)
  values ('${slug}', '${hash}')
  on conflict (migue_slug) do update
    set token_hash = excluded.token_hash, active = true, created_at = now(), last_used_at = null;
`)
