-- Organizacion DIA - esquema idempotente
-- Se puede ejecutar varias veces en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text unique,
  role text not null default 'Dev' check (role in ('Admin', 'PM', 'Dev', 'QA', 'Viewer')),
  specialty text,
  birthday date,
  favorite_food text,
  hobby text,
  favorite_game text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.members
add column if not exists birthday date;

alter table public.members
add column if not exists favorite_food text;

alter table public.members
add column if not exists hobby text;

alter table public.members
add column if not exists favorite_game text;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  requester_area text,
  functional_owner text,
  technical_owner_id uuid references public.members(id) on delete set null,
  stack text,
  repository_url text,
  repository_url_secondary text,
  staging_url text,
  production_url text,
  note text,
  status text not null default 'Planificación',
  priority text not null default 'Media' check (priority in ('Baja', 'Media', 'Alta', 'Critica')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  estimated_delivery date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'projects'
      and constraint_name = 'projects_status_check'
  ) then
    alter table public.projects drop constraint projects_status_check;
  end if;
end $$;

update public.projects
set status = case
  when status in ('Backlog', 'Planificacion') then 'Planificación'
  when status = 'En aprobacion' then 'MVP aprobado'
  when status = 'Deployado' then 'En Producción'
  when status = 'Mantenimiento' then 'Pausado'
  else status
end;

alter table public.projects
add constraint projects_status_check check (
  status in ('Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado')
);

alter table public.projects
add column if not exists progress integer not null default 0;

alter table public.projects
add column if not exists note text;

alter table public.projects
add column if not exists repository_url_secondary text;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'projects'
      and constraint_name = 'projects_progress_check'
  ) then
    alter table public.projects drop constraint projects_progress_check;
  end if;
end $$;

alter table public.projects
add constraint projects_progress_check check (progress >= 0 and progress <= 100);

create table if not exists public.tasks (
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

create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (task_id, member_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  author_id uuid references public.members(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  check (project_id is not null or task_id is not null)
);

create table if not exists public.blockers (
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

create or replace trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();

create or replace trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();

alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.blockers enable row level security;

drop policy if exists "authenticated read members" on public.members;
drop policy if exists "authenticated read projects" on public.projects;
drop policy if exists "authenticated read tasks" on public.tasks;
drop policy if exists "authenticated read task assignees" on public.task_assignees;
drop policy if exists "authenticated read comments" on public.comments;
drop policy if exists "authenticated read blockers" on public.blockers;
drop policy if exists "authenticated write members" on public.members;
drop policy if exists "authenticated write projects" on public.projects;
drop policy if exists "authenticated write tasks" on public.tasks;
drop policy if exists "authenticated write task assignees" on public.task_assignees;
drop policy if exists "authenticated write comments" on public.comments;
drop policy if exists "authenticated write blockers" on public.blockers;

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

create policy "authenticated write blockers" on public.blockers
  for all to authenticated using (true) with check (true);

create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_priority_idx on public.projects(priority);
create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_priority_idx on public.tasks(priority);
create index if not exists task_assignees_member_id_idx on public.task_assignees(member_id);
