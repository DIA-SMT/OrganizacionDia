import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Copy, Database, XCircle } from 'lucide-react'

const requiredEnv = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
const githubEnv = ['GITHUB_ORG', 'GITHUB_TOKEN']

export default function SupabasePage() {
  const configured = requiredEnv.every((key) => Boolean(process.env[key]))

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center px-5 py-4">
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-6">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#103b3a] text-white">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-[#0d8f62]">Configuracion</p>
              <h1 className="mt-1 text-3xl font-bold">Supabase</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">La aplicacion ya tiene clientes, middleware, login y esquema SQL. Solo faltan las claves del proyecto para usar datos reales.</p>
            </div>
          </div>

          <div className={`mt-6 flex items-center gap-3 rounded-lg border p-4 ${configured ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {configured ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            <p className="text-sm font-semibold">{configured ? 'Supabase configurado en este entorno.' : 'Faltan variables en .env.local.'}</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {requiredEnv.map((key) => (
              <article key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-400">Variable requerida</p>
                <div className="mt-2 flex items-center gap-2">
                  <Copy className="h-4 w-4 text-slate-400" />
                  <code className="text-sm font-semibold text-slate-700">{key}</code>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
            <pre className="overflow-x-auto">{`NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key`}</pre>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">GitHub privado</p>
            <p className="mt-1 text-sm text-slate-500">Para cargar todos los repos/proyectos de DIA-SMT en el dashboard, agrega estas variables del lado servidor.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {githubEnv.map((key) => (
                <code key={key} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  {key}
                </code>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
