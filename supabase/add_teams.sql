-- Organizacion DIA - Etapa 0 multi-equipo (DIA + DITEC)
-- Agrega la tabla teams, columna team_id y aislamiento RLS por equipo.
-- Ejecutar en Supabase SQL Editor. Idempotente: se puede ejecutar varias veces.
-- Detalle de diseño: docs/plan-multi-equipo-ditec.md

-- ============================================================
-- 1) Tabla de equipos + seed
-- ============================================================

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.teams (name, slug, color) values
  ('DIA', 'dia', '#7c3aed'),
  ('DITEC', 'ditec', '#0ea5e9')
on conflict (slug) do nothing;

-- ============================================================
-- 2) team_id en members y projects (backfill: lo existente es de DIA)
-- ============================================================

alter table public.members add column if not exists team_id uuid references public.teams(id);
alter table public.projects add column if not exists team_id uuid references public.teams(id);

update public.members
set team_id = (select id from public.teams where slug = 'dia')
where team_id is null;

update public.projects
set team_id = (select id from public.teams where slug = 'dia')
where team_id is null;

alter table public.members alter column team_id set not null;
alter table public.projects alter column team_id set not null;

create index if not exists members_team_id_idx on public.members(team_id);
create index if not exists projects_team_id_idx on public.projects(team_id);
create index if not exists members_auth_user_id_idx on public.members(auth_user_id);

-- ============================================================
-- 3) Funciones helper (security definer: evitan recursion de RLS)
-- ============================================================

-- Miembro activo asociado al usuario logueado.
-- Replica la logica de la app: primero por auth_user_id, si no por email.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.members m
  where m.active
    and (
      m.auth_user_id = auth.uid()
      or (
        m.email is not null
        and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  order by (m.auth_user_id = auth.uid()) desc nulls last, m.created_at asc
  limit 1
$$;

create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.team_id
  from public.members m
  where m.id = public.current_member_id()
$$;

create or replace function public.current_team_slug()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.slug
  from public.teams t
  where t.id = public.current_team_id()
$$;

create or replace function public.project_belongs_to_current_team(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = pid
      and p.team_id = public.current_team_id()
  )
$$;

create or replace function public.task_belongs_to_current_team(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = tid
      and p.team_id = public.current_team_id()
  )
$$;

-- ============================================================
-- 4) team_id automatico en inserts
-- La app no envia team_id: se toma del usuario logueado.
-- Inserts con service role (Alexa, imports) caen en DIA.
-- ============================================================

create or replace function public.set_default_team_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is null then
    new.team_id := coalesce(
      public.current_team_id(),
      (select id from public.teams where slug = 'dia')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists members_set_team_id on public.members;
create trigger members_set_team_id
before insert on public.members
for each row execute function public.set_default_team_id();

drop trigger if exists projects_set_team_id on public.projects;
create trigger projects_set_team_id
before insert on public.projects
for each row execute function public.set_default_team_id();

-- ============================================================
-- 5) RLS: se reemplazan las politicas abiertas por politicas por equipo
-- ============================================================

alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.project_members enable row level security;
alter table public.project_commits enable row level security;
alter table public.comments enable row level security;
alter table public.project_documents enable row level security;
alter table public.blockers enable row level security;
alter table public.expedientes enable row level security;
alter table public.alexa_activity_log enable row level security;

-- Politicas abiertas anteriores
drop policy if exists "authenticated read members" on public.members;
drop policy if exists "authenticated write members" on public.members;
drop policy if exists "authenticated read projects" on public.projects;
drop policy if exists "authenticated write projects" on public.projects;
drop policy if exists "authenticated read tasks" on public.tasks;
drop policy if exists "authenticated write tasks" on public.tasks;
drop policy if exists "authenticated read task assignees" on public.task_assignees;
drop policy if exists "authenticated write task assignees" on public.task_assignees;
drop policy if exists "authenticated read project members" on public.project_members;
drop policy if exists "authenticated write project members" on public.project_members;
drop policy if exists "authenticated read project commits" on public.project_commits;
drop policy if exists "authenticated read comments" on public.comments;
drop policy if exists "authenticated write comments" on public.comments;
drop policy if exists "authenticated read project documents" on public.project_documents;
drop policy if exists "authenticated write project documents" on public.project_documents;
drop policy if exists "authenticated read blockers" on public.blockers;
drop policy if exists "authenticated write blockers" on public.blockers;
drop policy if exists "Authenticated users can read expedientes" on public.expedientes;
drop policy if exists "Authenticated users can update expedientes" on public.expedientes;
drop policy if exists "authenticated read alexa activity" on public.alexa_activity_log;

-- Politicas nuevas (por si se re-ejecuta este archivo)
drop policy if exists "authenticated read teams" on public.teams;
drop policy if exists "team read members" on public.members;
drop policy if exists "team write members" on public.members;
drop policy if exists "team read projects" on public.projects;
drop policy if exists "team write projects" on public.projects;
drop policy if exists "team read tasks" on public.tasks;
drop policy if exists "team write tasks" on public.tasks;
drop policy if exists "team read task assignees" on public.task_assignees;
drop policy if exists "team write task assignees" on public.task_assignees;
drop policy if exists "team read project members" on public.project_members;
drop policy if exists "team write project members" on public.project_members;
drop policy if exists "team read project commits" on public.project_commits;
drop policy if exists "team read comments" on public.comments;
drop policy if exists "team write comments" on public.comments;
drop policy if exists "team read project documents" on public.project_documents;
drop policy if exists "team write project documents" on public.project_documents;
drop policy if exists "team read blockers" on public.blockers;
drop policy if exists "team write blockers" on public.blockers;
drop policy if exists "dia read expedientes" on public.expedientes;
drop policy if exists "dia update expedientes" on public.expedientes;
drop policy if exists "dia read alexa activity" on public.alexa_activity_log;

-- teams: todos los autenticados ven la lista de equipos (nombres y colores).
-- Sin politica de escritura: los equipos se administran por SQL / service role.
create policy "authenticated read teams" on public.teams
  for select to authenticated using (true);

-- members: cada equipo ve y administra solo sus miembros.
create policy "team read members" on public.members
  for select to authenticated
  using (team_id = public.current_team_id());

create policy "team write members" on public.members
  for all to authenticated
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());

-- projects: fila completa solo para el equipo dueño.
-- La ficha cruzada entre equipos se expone via la vista project_catalog.
create policy "team read projects" on public.projects
  for select to authenticated
  using (team_id = public.current_team_id());

create policy "team write projects" on public.projects
  for all to authenticated
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());

-- Detalle interno: solo el equipo dueño del proyecto.
create policy "team read tasks" on public.tasks
  for select to authenticated
  using (public.project_belongs_to_current_team(project_id));

create policy "team write tasks" on public.tasks
  for all to authenticated
  using (public.project_belongs_to_current_team(project_id))
  with check (public.project_belongs_to_current_team(project_id));

create policy "team read task assignees" on public.task_assignees
  for select to authenticated
  using (public.task_belongs_to_current_team(task_id));

create policy "team write task assignees" on public.task_assignees
  for all to authenticated
  using (public.task_belongs_to_current_team(task_id))
  with check (public.task_belongs_to_current_team(task_id));

create policy "team read project members" on public.project_members
  for select to authenticated
  using (public.project_belongs_to_current_team(project_id));

create policy "team write project members" on public.project_members
  for all to authenticated
  using (public.project_belongs_to_current_team(project_id))
  with check (public.project_belongs_to_current_team(project_id));

create policy "team read project commits" on public.project_commits
  for select to authenticated
  using (public.project_belongs_to_current_team(project_id));

create policy "team read comments" on public.comments
  for select to authenticated
  using (
    (project_id is not null and public.project_belongs_to_current_team(project_id))
    or (task_id is not null and public.task_belongs_to_current_team(task_id))
  );

create policy "team write comments" on public.comments
  for all to authenticated
  using (
    (project_id is not null and public.project_belongs_to_current_team(project_id))
    or (task_id is not null and public.task_belongs_to_current_team(task_id))
  )
  with check (
    (project_id is not null and public.project_belongs_to_current_team(project_id))
    or (task_id is not null and public.task_belongs_to_current_team(task_id))
  );

create policy "team read project documents" on public.project_documents
  for select to authenticated
  using (public.project_belongs_to_current_team(project_id));

create policy "team write project documents" on public.project_documents
  for all to authenticated
  using (public.project_belongs_to_current_team(project_id))
  with check (public.project_belongs_to_current_team(project_id));

create policy "team read blockers" on public.blockers
  for select to authenticated
  using (public.task_belongs_to_current_team(task_id));

create policy "team write blockers" on public.blockers
  for all to authenticated
  using (public.task_belongs_to_current_team(task_id))
  with check (public.task_belongs_to_current_team(task_id));

-- Modulos internos de DIA (no ligados a proyectos): solo equipo DIA.
create policy "dia read expedientes" on public.expedientes
  for select to authenticated
  using (public.current_team_slug() = 'dia');

create policy "dia update expedientes" on public.expedientes
  for update to authenticated
  using (public.current_team_slug() = 'dia')
  with check (public.current_team_slug() = 'dia');

create policy "dia read alexa activity" on public.alexa_activity_log
  for select to authenticated
  using (public.current_team_slug() = 'dia');

-- ============================================================
-- 6) Vista project_catalog: ficha publica de proyectos entre equipos
-- Vista security definer (dueño postgres): expone solo campos de ficha
-- de todos los equipos. Excluye note, progress, staging y production.
-- ============================================================

drop view if exists public.project_catalog;

create view public.project_catalog as
select
  p.id,
  p.name,
  p.description,
  p.requester_area,
  p.functional_owner,
  p.stack,
  p.repository_url,
  p.repository_url_secondary,
  p.website_url,
  p.status,
  p.priority,
  p.start_date,
  p.estimated_delivery,
  p.active,
  p.created_at,
  p.updated_at,
  p.team_id,
  t.slug as team_slug,
  t.name as team_name,
  t.color as team_color,
  m.full_name as technical_owner_name
from public.projects p
join public.teams t on t.id = p.team_id
left join public.members m on m.id = p.technical_owner_id;

revoke all on public.project_catalog from anon;
grant select on public.project_catalog to authenticated;
