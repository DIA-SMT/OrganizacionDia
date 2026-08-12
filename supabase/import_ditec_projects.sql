-- Carga inicial de la cartera de proyectos DITEC.
-- IMPORTANTE: reemplazar las filas de EJEMPLO por los proyectos reales antes de ejecutar.
-- Se puede ejecutar varias veces: actualiza metadatos por nombre dentro del equipo DITEC
-- y crea los que falten. Cada alta dispara automaticamente la deteccion de cruces
-- contra los proyectos de DIA (panel "Posibles cruces" del Radar).

with ditec as (
  select id from public.teams where slug = 'ditec'
),
incoming (
  name,
  description,
  requester_area,
  stack,
  repository_url,
  website_url,
  status,
  priority
) as (
  values
    -- ('Nombre del proyecto', 'Descripcion breve.', 'Area solicitante', 'Stack', 'https://github.com/ditec/repo', 'https://sitio.example', 'En desarrollo', 'Media'),
    -- Estados validos: 'Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado'
    -- Prioridades validas: 'Baja', 'Media', 'Alta', 'Critica'
    ('EJEMPLO Sistema de Turnos', 'Fila de ejemplo: reemplazar por los proyectos reales de DITEC.', 'Area de ejemplo', 'Stack de ejemplo', null, null, 'Planificación', 'Media')
),
updated as (
  update public.projects p
  set
    description = i.description,
    requester_area = i.requester_area,
    stack = i.stack,
    repository_url = i.repository_url,
    website_url = i.website_url,
    status = i.status,
    priority = i.priority,
    updated_at = now()
  from incoming i, ditec d
  where p.name = i.name
    and p.team_id = d.id
  returning p.name
)
insert into public.projects (
  team_id,
  name,
  description,
  requester_area,
  stack,
  repository_url,
  website_url,
  status,
  priority
)
select
  d.id,
  i.name,
  i.description,
  i.requester_area,
  i.stack,
  i.repository_url,
  i.website_url,
  i.status,
  i.priority
from incoming i, ditec d
where not exists (
  select 1
  from public.projects p
  where p.name = i.name
    and p.team_id = d.id
);
