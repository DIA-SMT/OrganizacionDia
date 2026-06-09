import { AlertTriangle, Code2, GitPullRequest, ShieldCheck, Users } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusTone = 'neutral' | 'green' | 'blue' | 'violet' | 'amber' | 'red'

export type TableColumn<T> = {
  key: keyof T
  label: string
}

export type PageTableRow = Record<string, string>

export type WorkspacePageConfig = {
  title: string
  eyebrow: string
  description: string
  icon: ReactNode
  primaryAction: string
  stats: Array<{
    label: string
    value: string
    hint: string
    tone: StatusTone
  }>
  columns: TableColumn<PageTableRow>[]
  rows: PageTableRow[]
}

export const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
}

export const workspacePages: Record<'proyectos' | 'tareas' | 'equipo' | 'impedimentos', WorkspacePageConfig> = {
  proyectos: {
    title: 'Proyectos',
    eyebrow: 'Cartera activa',
    description: 'Listado operativo para priorizar sistemas, modulos, integraciones y mejoras tecnicas.',
    icon: <Code2 className="h-5 w-5" />,
    primaryAction: 'Nuevo proyecto',
    stats: [
      { label: 'Activos', value: '3', hint: 'En seguimiento', tone: 'green' },
      { label: 'QA', value: '1', hint: 'En validacion', tone: 'blue' },
      { label: 'Alta prioridad', value: '2', hint: 'Requieren foco', tone: 'amber' },
    ],
    columns: [
      { key: 'name', label: 'Proyecto' },
      { key: 'area', label: 'Area' },
      { key: 'status', label: 'Estado' },
      { key: 'priority', label: 'Prioridad' },
      { key: 'delivery', label: 'Entrega' },
    ],
    rows: [
      { name: 'Mesa de ayuda interna', area: 'DIA', status: 'En desarrollo', priority: 'Alta', delivery: '2026-07-08' },
      { name: 'Panel de expedientes', area: 'Modernizacion', status: 'Planificacion', priority: 'Media', delivery: '2026-07-22' },
      { name: 'Monitor de integraciones', area: 'Infraestructura', status: 'QA', priority: 'Critica', delivery: '2026-06-24' },
    ],
  },
  tareas: {
    title: 'Tareas',
    eyebrow: 'Trabajo tecnico',
    description: 'Seguimiento por estado, responsable y tipo para que el flujo de desarrollo no pierda contexto.',
    icon: <GitPullRequest className="h-5 w-5" />,
    primaryAction: 'Nueva tarea',
    stats: [
      { label: 'Pendientes', value: '2', hint: 'Por iniciar', tone: 'neutral' },
      { label: 'En desarrollo', value: '1', hint: 'Activas', tone: 'green' },
      { label: 'Revision/QA', value: '2', hint: 'Cerca de entrega', tone: 'violet' },
    ],
    columns: [
      { key: 'title', label: 'Tarea' },
      { key: 'project', label: 'Proyecto' },
      { key: 'owner', label: 'Responsable' },
      { key: 'status', label: 'Estado' },
      { key: 'type', label: 'Tipo' },
    ],
    rows: [
      { title: 'Crear tablero de solicitudes', project: 'Mesa de ayuda interna', owner: 'Dev Frontend', status: 'Pendiente', type: 'Feature' },
      { title: 'Endpoint de integraciones', project: 'Monitor de integraciones', owner: 'Dev Backend', status: 'En desarrollo', type: 'Feature' },
      { title: 'Revisar flujo de login', project: 'Panel de expedientes', owner: 'QA Interno', status: 'QA', type: 'Soporte' },
    ],
  },
  equipo: {
    title: 'Equipo',
    eyebrow: 'Miembros y roles',
    description: 'Vista base del equipo para administrar responsabilidades, especialidades y permisos.',
    icon: <Users className="h-5 w-5" />,
    primaryAction: 'Nuevo miembro',
    stats: [
      { label: 'Miembros', value: '4', hint: 'Activos', tone: 'green' },
      { label: 'Roles', value: '4', hint: 'Admin, Dev, QA', tone: 'blue' },
      { label: 'PM/Admin', value: '1', hint: 'Gestion', tone: 'violet' },
    ],
    columns: [
      { key: 'name', label: 'Nombre' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Rol' },
      { key: 'specialty', label: 'Especialidad' },
    ],
    rows: [
      { name: 'Admin DIA', email: 'admin@example.com', role: 'Admin', specialty: 'Gestion' },
      { name: 'Dev Frontend', email: 'frontend@example.com', role: 'Dev', specialty: 'Frontend' },
      { name: 'Dev Backend', email: 'backend@example.com', role: 'Dev', specialty: 'Backend' },
      { name: 'QA Interno', email: 'qa@example.com', role: 'QA', specialty: 'Testing' },
    ],
  },
  impedimentos: {
    title: 'Impedimentos',
    eyebrow: 'Bloqueos abiertos',
    description: 'Registro operativo de condiciones que frenan tareas y necesitan resolucion visible.',
    icon: <AlertTriangle className="h-5 w-5" />,
    primaryAction: 'Nuevo impedimento',
    stats: [
      { label: 'Abiertos', value: '0', hint: 'Sin bloqueos demo', tone: 'green' },
      { label: 'Criticos', value: '0', hint: 'Sin urgencias', tone: 'neutral' },
      { label: 'Resueltos', value: '0', hint: 'Pendiente de historial', tone: 'blue' },
    ],
    columns: [
      { key: 'reason', label: 'Motivo' },
      { key: 'task', label: 'Tarea' },
      { key: 'owner', label: 'Responsable' },
      { key: 'status', label: 'Estado' },
    ],
    rows: [
      { reason: 'Sin impedimentos cargados', task: 'Demo', owner: 'Equipo DIA', status: 'Abierto' },
    ],
  },
}

export const supabaseSetupConfig = {
  title: 'Estado de Supabase',
  eyebrow: 'Configuracion',
  description: 'La app ya esta lista para conectarse cuando cargues las claves en .env.local.',
  icon: <ShieldCheck className="h-5 w-5" />,
}
