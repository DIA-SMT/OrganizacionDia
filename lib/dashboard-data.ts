export type DashboardProject = {
  name: string
  area: string
  stack: string
  status: string
  priority: string
  progress: number
  delivery: string | null
  repositoryUrl?: string
  updatedAt?: string
  description?: string | null
  private?: boolean
}

export type DashboardTask = {
  title: string
  project: string
  owner: string
}

export type PipelineColumn = {
  title: string
  tone: string
  tasks: DashboardTask[]
}

export const mockProjects: DashboardProject[] = [
  {
    name: 'Mesa de ayuda interna',
    area: 'DIA',
    stack: 'Next.js + Supabase',
    status: 'En desarrollo',
    priority: 'Alta',
    progress: 45,
    delivery: '2026-07-08',
  },
  {
    name: 'Panel de expedientes',
    area: 'Modernizacion',
    stack: 'React + API municipal',
    status: 'Planificacion',
    priority: 'Media',
    progress: 15,
    delivery: '2026-07-22',
  },
  {
    name: 'Monitor de integraciones',
    area: 'Infraestructura',
    stack: 'Node.js + PostgreSQL',
    status: 'QA',
    priority: 'Critica',
    progress: 80,
    delivery: '2026-06-24',
  },
]

export const mockPipeline: PipelineColumn[] = [
  {
    title: 'Pendiente',
    tone: 'bg-slate-100 text-slate-700',
    tasks: [
      { title: 'Crear tablero de solicitudes', project: 'Mesa de ayuda interna', owner: 'Dev Frontend' },
      { title: 'Definir permisos por rol', project: 'Panel de expedientes', owner: 'PM' },
    ],
  },
  {
    title: 'En desarrollo',
    tone: 'bg-blue-50 text-blue-700',
    tasks: [{ title: 'Endpoint de integraciones', project: 'Monitor de integraciones', owner: 'Dev Backend' }],
  },
  {
    title: 'En aprobacion',
    tone: 'bg-violet-50 text-violet-700',
    tasks: [{ title: 'Abrir PR de entidades base', project: 'Mesa de ayuda interna', owner: 'Dev Backend' }],
  },
  {
    title: 'Para testear',
    tone: 'bg-emerald-50 text-emerald-700',
    tasks: [{ title: 'Revisar flujo de login', project: 'Panel de expedientes', owner: 'QA Interno' }],
  },
]

export const mockActivity = [
  'Dev Backend movio Endpoint de integraciones a En desarrollo',
  'QA Interno agrego observaciones al flujo de login',
  'PM actualizo la entrega del Panel de expedientes',
]
