'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowLeft, Search, Settings } from 'lucide-react'
import { toneClasses, workspacePages } from '@/lib/page-data'

type WorkspacePageKey = keyof typeof workspacePages

export function WorkspacePage({ page }: { page: WorkspacePageKey }) {
  const config = workspacePages[page]
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  const rows = useMemo(() => {
    if (!normalizedQuery) return config.rows
    return config.rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(normalizedQuery))
  }, [config.rows, normalizedQuery])

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <button className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500">
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#103b3a] text-white">{config.icon}</div>
              <div>
                <p className="text-xs font-semibold uppercase text-[#0d8f62]">{config.eyebrow}</p>
                <h1 className="text-3xl font-bold">{config.title}</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{config.description}</p>
          </div>
          <button className="inline-flex h-10 items-center justify-center rounded-md bg-[#10b981] px-4 text-sm font-semibold text-white shadow-sm">{config.primaryAction}</button>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {config.stats.map((stat) => (
            <article key={stat.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${toneClasses[stat.tone]}`}>{stat.label}</span>
              <div className="mt-4 flex items-end gap-2">
                <p className="text-4xl font-bold leading-none">{stat.value}</p>
                <p className="pb-1 text-sm text-slate-500">{stat.hint}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-semibold">Listado</h2>
              <p className="text-sm text-slate-500">{rows.length} registros visibles</p>
            </div>
            <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input className="w-full bg-transparent outline-none md:w-64" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                <tr>
                  {config.columns.map((column) => (
                    <th key={String(column.key)} className="px-5 py-3 font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr key={`${config.title}-${index}`} className="hover:bg-slate-50/70">
                    {config.columns.map((column) => (
                      <td key={String(column.key)} className="px-5 py-4 text-slate-700">
                        {row[column.key] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}
