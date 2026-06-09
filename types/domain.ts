export type ProjectStatus =
  | 'Backlog'
  | 'Planificacion'
  | 'En desarrollo'
  | 'En aprobacion'
  | 'QA'
  | 'Deployado'
  | 'Mantenimiento'
  | 'Pausado'

export type TaskStatus =
  | 'Backlog'
  | 'Pendiente'
  | 'En desarrollo'
  | 'En revision'
  | 'QA'
  | 'Bloqueada'
  | 'Terminada'

export type TaskType =
  | 'Feature'
  | 'Bug'
  | 'Mejora'
  | 'Refactor'
  | 'Deploy'
  | 'Documentacion'
  | 'Soporte'

export type Priority = 'Baja' | 'Media' | 'Alta' | 'Critica'

export type TeamRole = 'Admin' | 'PM' | 'Dev' | 'QA' | 'Viewer'
