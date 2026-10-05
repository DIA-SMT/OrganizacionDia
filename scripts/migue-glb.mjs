// Optimiza un modelo 3D (.glb) para subirlo a la ficha de un Migue: lo lleva a unos 150.000
// triangulos, comprime la geometria (meshopt) y pasa las texturas a webp de 2048 px. Un modelo
// de 25 a 40 MB queda en unos 2 MB, como los de public/migue.
// Uso: npm run migue:glb -- <entrada.glb> [salida.glb]
import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

const TARGET_TRIANGLES = 150_000
const MAX_MB = 6
const MB = 1024 * 1024

// Triangulos del modelo, leidos del JSON del GLB (sin cargar la geometria).
function triangleCount(file) {
  const buffer = readFileSync(file)
  if (buffer.length < 20 || buffer.toString('latin1', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) {
    throw new Error(`${file} no es un .glb de glTF 2.0.`)
  }
  const jsonLength = buffer.readUInt32LE(12)
  if (buffer.toString('latin1', 16, 20) !== 'JSON') throw new Error(`${file}: el GLB no empieza con su bloque JSON.`)
  const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength))
  let triangles = 0
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? 4) !== 4) continue
      const accessor = gltf.accessors?.[primitive.indices ?? primitive.attributes?.POSITION]
      triangles += Math.floor((accessor?.count ?? 0) / 3)
    }
  }
  return triangles
}

const input = process.argv[2]
if (!input || extname(input).toLowerCase() !== '.glb') {
  console.error('Uso: npm run migue:glb -- <entrada.glb> [salida.glb]')
  process.exit(1)
}
const output = process.argv[3] ?? join(dirname(input), `${basename(input, extname(input))}-optimizado.glb`)

let before
try {
  before = triangleCount(input)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
const ratio = before > TARGET_TRIANGLES ? TARGET_TRIANGLES / before : 1
console.log(`${basename(input)}: ${before.toLocaleString('es-AR')} triangulos, ${(statSync(input).size / MB).toFixed(1)} MB. Reduccion: ${ratio.toFixed(3)}.`)

const args = [
  '--yes',
  '@gltf-transform/cli',
  'optimize',
  input,
  output,
  '--compress',
  'meshopt',
  '--texture-compress',
  'webp',
  '--texture-size',
  '2048',
  '--simplify-ratio',
  ratio.toFixed(3),
  '--simplify-error',
  '0.0005',
]
// En Windows npx es un .cmd: hace falta la shell, y las rutas con espacios van entre comillas.
const windows = process.platform === 'win32'
const result = spawnSync('npx', windows ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args, { stdio: 'inherit', shell: windows })
if (result.status !== 0) {
  console.error('No se pudo optimizar el modelo.')
  process.exit(result.status ?? 1)
}

const size = statSync(output).size
console.log(`\nListo: ${output} (${triangleCount(output).toLocaleString('es-AR')} triangulos, ${(size / MB).toFixed(1)} MB).`)
if (size > MAX_MB * MB) console.warn(`Pesa mas de ${MAX_MB} MB: el formulario no lo va a aceptar. Probá con texturas de 1024 px.`)
