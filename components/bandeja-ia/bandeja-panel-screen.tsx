'use client'

import { AsuntoRow } from '@/components/bandeja-ia/asunto-row'
import { BandejaShell, useBandeja } from '@/components/bandeja-ia/bandeja-shell'
import { DueLabel, EmptyState, SectionCard, StatCard } from '@/components/bandeja-ia/bandeja-ui'
import { countImportantPending, isOpen, sortForAttention, upcomingDue } from '@/lib/bandeja-ia/asuntos'
import { tucumanDateKey } from '@/lib/bandeja-ia/time'
import { AlertTriangle, BellOff, CalendarClock, CalendarHeart, ClipboardList, DatabaseZap, ExternalLink, Gauge, MailWarning, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

function PanelContent() {
  const { data } = useBandeja()
  const [now] = useState(() => new Date())
  const todayKey = tucumanDateKey(now)

  const important = countImportantPending(data.asuntos)
  const open = data.asuntos.filter(isOpen)
  const unconfirmed = open.filter((asunto) => !asunto.priorityConfirmedAt)
  const due = upcomingDue(data.asuntos, now)
  const overdue = due.filter((asunto) => asunto.dueAt && tucumanDateKey(new Date(asunto.dueAt)) < todayKey)
  // Avisos de Supabase y posibles eventos van aparte; "Requieren atencion" muestra el resto.
  const pausing = sortForAttention(open.filter((asunto) => asunto.classification.category === 'base_pausa'))
  const events = sortForAttention(open.filter((asunto) => asunto.classification.category === 'invitacion'))
  const attention = sortForAttention(open.filter((asunto) => asunto.classification.category !== 'base_pausa' && asunto.classification.category !== 'invitacion')).slice(0, 8)

  return (
    <div className="space-y-5">
      {pausing.length > 0 && (
        <section className="rounded-lg border-2 border-red-300 bg-red-50 shadow-sm dark:border-red-500/40 dark:bg-red-500/10" role="alert">
          <div className="flex flex-wrap items-start gap-3 border-b border-red-200 px-5 py-4 dark:border-red-500/30">
            <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-red-800 dark:text-red-200">
                {pausing.length === 1 ? 'Hay 1 base de Supabase por pausarse' : `Hay ${pausing.length} bases de Supabase por pausarse`}
              </h2>
              <p className="mt-0.5 text-sm text-red-700 dark:text-red-200/80">
                Si se pausa, el proyecto se cae. Entrá a Supabase y reactivá o usá la base; después marcá el asunto como resuelto.
              </p>
            </div>
            <a
              href="https://supabase.com/dashboard/projects"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-red-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Supabase
            </a>
          </div>
          <ul className="divide-y divide-red-200/70 dark:divide-red-500/20">
            {pausing.map((asunto, index) => (
              <AsuntoRow key={asunto.id} asunto={asunto} now={now} index={index} />
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={MailWarning} label="Correos importantes" value={important} hint="Críticos y altos sin resolver" tone={important > 0 ? 'alert' : 'default'} />
        <StatCard icon={ClipboardList} label="Asuntos pendientes" value={open.length} hint={`${data.asuntos.length - open.length} cerrados`} />
        <StatCard
          icon={CalendarClock}
          label="Vencimientos próximos"
          value={due.length}
          hint={overdue.length > 0 ? `${overdue.length} vencidos` : 'Próximos 7 días'}
          tone={overdue.length > 0 ? 'warn' : 'default'}
        />
        <StatCard icon={Gauge} label="Prioridad sin confirmar" value={unconfirmed.length} hint="Sugerida por las reglas, falta revisarla" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard
          title="Requieren atención"
          icon={AlertTriangle}
          description="Ordenados por prioridad y por vencimiento (sin avisos de Supabase ni posibles eventos)"
          actions={
            <Link href="/bandeja-ia/bandeja" className="text-sm font-semibold dia-primary-text hover:underline dark:text-blue-300">
              Ver bandeja completa
            </Link>
          }
        >
          {attention.length === 0 ? (
            <EmptyState>
              {data.asuntos.length === 0
                ? 'Todavía no hay asuntos. Se van a crear solos a partir de los correos cuando se conecte Gmail.'
                : 'No hay asuntos abiertos.'}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {attention.map((asunto, index) => (
                <AsuntoRow key={asunto.id} asunto={asunto} now={now} index={index} />
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title="Posibles eventos"
            icon={CalendarHeart}
            description="Invitaciones a eventos, jornadas, actos o capacitaciones"
            actions={
              events.length > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{events.length}</span>
            }
          >
            {events.length === 0 ? (
              <EmptyState>No hay posibles eventos pendientes.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {events.slice(0, 6).map((asunto) => (
                  <li key={asunto.id}>
                    <Link href={`/bandeja-ia/asunto/${asunto.id}`} className="block px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                        <CalendarHeart className="h-3 w-3" />
                        Posible evento
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{asunto.title}</p>
                      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate">{asunto.message?.fromName ?? ''}</span>
                        <DueLabel dueAt={asunto.dueAt} now={now} />
                      </p>
                    </Link>
                  </li>
                ))}
                {events.length > 6 && (
                  <li className="px-5 py-2 text-xs">
                    <Link href="/bandeja-ia/bandeja" className="font-semibold dia-primary-text hover:underline dark:text-blue-300">
                      Ver los {events.length} en la bandeja
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Próximos vencimientos" icon={CalendarClock} description="Hora de Tucumán">
            {due.length === 0 ? (
              <EmptyState>Sin vencimientos en los próximos 7 días.</EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {due.slice(0, 6).map((asunto) => (
                  <li key={asunto.id}>
                    <Link href={`/bandeja-ia/asunto/${asunto.id}`} className="block px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{asunto.title}</p>
                      <p className="mt-0.5 text-xs">
                        <DueLabel dueAt={asunto.dueAt} now={now} />
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Integración y alertas" icon={ShieldCheck}>
            <ul className="space-y-3 px-5 py-4 text-sm">
              <li className="flex items-start gap-2">
                <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-600 dark:text-slate-300">
                  Gmail <strong>{data.settings.gmailEnabled ? 'habilitado' : 'deshabilitado'}</strong>
                  {data.settings.gmailEnabled ? '.' : ' hasta la autorización institucional. No se leen correos.'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-600 dark:text-slate-300">
                  Alertas <strong>{data.settings.alertsEnabled ? 'encendidas' : 'apagadas'}</strong>
                  {data.settings.alertsEnabled ? '.' : ': no se envía ninguna notificación.'}
                </span>
              </li>
            </ul>
            <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <Link href="/bandeja-ia/configuracion" className="text-sm font-semibold dia-primary-text hover:underline dark:text-blue-300">
                Ver configuración
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export function BandejaPanelScreen() {
  return (
    <BandejaShell title="Bandeja IA" subtitle="Correo institucional: correos importantes, vencimientos y seguimiento">
      <PanelContent />
    </BandejaShell>
  )
}
