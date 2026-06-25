-- Organizacion DIA - esquema inicial
-- Ejecutar en Supabase SQL Editor sobre una base nueva.

create extension if not exists pgcrypto;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text unique,
  role text not null default 'Dev' check (role in ('Admin', 'PM', 'Dev', 'QA', 'Viewer')),
  specialty text,
  avatar_url text,
  github_username text,
  birthday date,
  favorite_food text,
  hobby text,
  favorite_game text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  requester_area text,
  functional_owner text,
  technical_owner_id uuid references public.members(id) on delete set null,
  stack text,
  repository_url text,
  repository_url_secondary text,
  website_url text,
  staging_url text,
  production_url text,
  note text,
  status text not null default 'Planificación' check (
    status in ('Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado')
  ),
  priority text not null default 'Media' check (priority in ('Baja', 'Media', 'Alta', 'Critica')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  estimated_delivery date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  type text not null default 'Feature' check (
    type in ('Feature', 'Bug', 'Mejora', 'Refactor', 'Deploy', 'Documentacion', 'Soporte')
  ),
  status text not null default 'Backlog' check (
    status in ('Backlog', 'Pendiente', 'En desarrollo', 'En revision', 'QA', 'Bloqueada', 'Terminada')
  ),
  priority text not null default 'Media' check (priority in ('Baja', 'Media', 'Alta', 'Critica')),
  reporter_id uuid references public.members(id) on delete set null,
  due_date date,
  branch_name text,
  issue_url text,
  pr_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (task_id, member_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  check (project_id is not null or task_id is not null)
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create table public.blockers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  reason text not null,
  status text not null default 'Abierto' check (status in ('Abierto', 'Resuelto')),
  blocked_by_id uuid references public.members(id) on delete set null,
  resolved_by_id uuid references public.members(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.project_documents enable row level security;
alter table public.blockers enable row level security;

create policy "authenticated read members" on public.members
  for select to authenticated using (true);

create policy "authenticated read projects" on public.projects
  for select to authenticated using (true);

create policy "authenticated read tasks" on public.tasks
  for select to authenticated using (true);

create policy "authenticated read task assignees" on public.task_assignees
  for select to authenticated using (true);

create policy "authenticated read comments" on public.comments
  for select to authenticated using (true);

create policy "authenticated read project documents" on public.project_documents
  for select to authenticated using (true);

create policy "authenticated read blockers" on public.blockers
  for select to authenticated using (true);

create policy "authenticated write members" on public.members
  for all to authenticated using (true) with check (true);

create policy "authenticated write projects" on public.projects
  for all to authenticated using (true) with check (true);

create policy "authenticated write tasks" on public.tasks
  for all to authenticated using (true) with check (true);

create policy "authenticated write task assignees" on public.task_assignees
  for all to authenticated using (true) with check (true);

create policy "authenticated write comments" on public.comments
  for all to authenticated using (true) with check (true);

create policy "authenticated write project documents" on public.project_documents
  for all to authenticated using (true) with check (true);

create policy "authenticated write blockers" on public.blockers
  for all to authenticated using (true) with check (true);

create index projects_status_idx on public.projects(status);
create index projects_priority_idx on public.projects(priority);
create index tasks_project_id_idx on public.tasks(project_id);
create index tasks_status_idx on public.tasks(status);
create index tasks_priority_idx on public.tasks(priority);
create index task_assignees_member_id_idx on public.task_assignees(member_id);
create index project_documents_project_id_idx on public.project_documents(project_id);
