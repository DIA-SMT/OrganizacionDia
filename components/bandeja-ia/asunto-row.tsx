'use client'

import { CategoryBadge, DueLabel, PriorityBadge, StatusBadge } from '@/components/bandeja-ia/bandeja-ui'
import { receivedAt } from '@/lib/bandeja-ia/asuntos'
import { formatBandejaDateTime } from '@/lib/bandeja-ia/time'
import type { BandejaAsunto } from '@/lib/bandeja-ia/types'
import { motion } from 'framer-motion'
import { ChevronRight, Paperclip } from 'lucide-react'
import Link from 'next/link'

// Fila compacta de un asunto, usada en el panel y en la vista de tarjetas (mobile).
export function AsuntoRow({ asunto, now, index = 0 }: { asunto: BandejaAsunto; now: Date; index?: number }) {
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.03 }}>
      <Link
        href={`/bandeja-ia/asunto/${asunto.id}`}
        className="group flex items-start gap-3 px-5 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={asunto.classification.priority} />
            <StatusBadge status={asunto.status} />
            <CategoryBadge category={asunto.classification.category} />
          </div>
          <p className="mt-1.5 truncate font-semibold text-slate-950 dark:text-white">{asunto.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {asunto.message && <span className="truncate">{asunto.message.fromName}</span>}
            <span>{formatBandejaDateTime(receivedAt(asunto))}</span>
            {asunto.message?.hasAttachments && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Adjunto
              </span>
            )}
            <DueLabel dueAt={asunto.dueAt} now={now} />
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600" />
      </Link>
    </motion.li>
  )
}
