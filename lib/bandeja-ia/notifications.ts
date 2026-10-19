// Alertas de Bandeja IA. Disenadas para no filtrar informacion: el texto de una alerta
// nunca incluye remitente, asunto, extracto ni nombres; solo prioridad, categoria y un
// enlace al Dashboard, donde el detalle queda detras del permiso especifico.
// Ninguna alerta sale mientras la integracion no este habilitada de forma explicita.

import { CATEGORY_LABELS, PRIORITY_LABELS } from './rules.ts'
import type { BandejaAsunto, BandejaPriority } from './types.ts'

export type NotificationChannel = 'dashboard' | 'telegram'

export type NotificationKind = 'nuevo_importante' | 'vencimiento'

export type SafeNotification = {
  channel: NotificationChannel
  kind: NotificationKind
  priority: BandejaPriority
  title: string
  body: string
  // Ruta relativa del Dashboard; el destinatario necesita sesion y permiso para verla.
  link: string
  // Evita repetir la misma alerta (reintentos, varias corridas de sincronizacion).
  dedupeKey: string
}

export type AlertSettings = {
  gmailEnabled: boolean
  alertsEnabled: boolean
  telegramEnabled: boolean
}

export const ALERTING_PRIORITIES: BandejaPriority[] = ['critica', 'alta']

const KIND_TITLES: Record<NotificationKind, string> = {
  nuevo_importante: 'Nuevo asunto importante en Bandeja IA',
  vencimiento: 'Un asunto de Bandeja IA vence pronto',
}

export function buildSafeNotification(
  asunto: Pick<BandejaAsunto, 'id' | 'classification'>,
  kind: NotificationKind,
  channel: NotificationChannel,
): SafeNotification {
  const priority = asunto.classification.priority
  return {
    channel,
    kind,
    priority,
    title: KIND_TITLES[kind],
    body: `Prioridad ${PRIORITY_LABELS[priority].toLowerCase()} · ${CATEGORY_LABELS[asunto.classification.category]}. Revisalo en el Dashboard DIA.`,
    link: `/bandeja-ia/asunto/${encodeURIComponent(asunto.id)}`,
    dedupeKey: `${kind}:${asunto.id}:${channel}`,
  }
}

// Mensaje para Telegram (integracion futura): mismo contenido neutro, sin datos del correo.
export function telegramText(notification: SafeNotification, dashboardUrl: string): string {
  const base = dashboardUrl.replace(/\/+$/, '')
  return `${notification.title}\n${notification.body}\n${base}${notification.link}`
}

export type DispatchDecision = { send: true } | { send: false; reason: string }

// Puerta unica antes de cualquier envio. Hoy siempre devuelve send:false porque la
// integracion arranca deshabilitada; queda lista para cuando se autorice.
export function shouldDispatch(notification: SafeNotification, settings: AlertSettings): DispatchDecision {
  if (!settings.gmailEnabled) return { send: false, reason: 'Integración de Gmail deshabilitada' }
  if (!settings.alertsEnabled) return { send: false, reason: 'Alertas deshabilitadas' }
  if (notification.channel === 'telegram' && !settings.telegramEnabled) return { send: false, reason: 'Telegram deshabilitado' }
  if (notification.kind === 'nuevo_importante' && !ALERTING_PRIORITIES.includes(notification.priority)) {
    return { send: false, reason: 'Prioridad sin alerta' }
  }
  return { send: true }
}
