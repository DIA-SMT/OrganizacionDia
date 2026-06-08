insert into public.members (full_name, email, role, specialty)
values
  ('Admin DIA', 'admin@example.com', 'Admin', 'Gestion'),
  ('Dev Frontend', 'frontend@example.com', 'Dev', 'Frontend'),
  ('Dev Backend', 'backend@example.com', 'Dev', 'Backend'),
  ('QA Interno', 'qa@example.com', 'QA', 'Testing');

insert into public.projects (
  name,
  description,
  requester_area,
  functional_owner,
  stack,
  repository_url,
  status,
  priority,
  start_date,
  estimated_delivery
)
values (
  'Mesa de ayuda interna',
  'Sistema para registrar solicitudes, asignar responsables y medir tiempos de resolucion.',
  'DIA',
  'Coordinacion DIA',
  'Next.js + Supabase',
  'https://github.com/municipio/mesa-ayuda',
  'En desarrollo',
  'Alta',
  current_date,
  current_date + interval '30 days'
);

insert into public.tasks (project_id, title, description, type, status, priority, branch_name)
select
  id,
  'Crear tablero de solicitudes',
  'Vista principal con filtros por estado, prioridad y responsable.',
  'Feature',
  'Pendiente',
  'Alta',
  'feature/tablero-solicitudes'
from public.projects
where name = 'Mesa de ayuda interna';
