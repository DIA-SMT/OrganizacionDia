'use client'

import { AsuntoRow } from '@/components/bandeja-ia/asunto-row'
import { BandejaShell, useBandeja } from '@/components/bandeja-ia/bandeja-shell'
import { DueLabel, EmptyState, SectionCard, StatCard } from '@/components/bandeja-ia/bandeja-ui'
import { countImportantPending, isOpen, sortForAttention, upcomingDue } from '@/lib/bandeja-ia/asuntos'
import { tucumanDateKey } from '@/lib/bandeja-ia/time'
import { AlertTriangle, BellOff, CalendarClock, ClipboardList, Gauge, MailWarning, ShieldCheck } from 'lucide-react'
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
  const attention = sortForAttention(open).slice(0, 8)

  return (
    <div className="space-y-5">
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
          description="Ordenados por prioridad y por vencimiento"
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
