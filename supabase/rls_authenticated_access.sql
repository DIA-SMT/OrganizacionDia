-- Organizacion DIA - politicas RLS para usuarios autenticados
-- Ejecutar en Supabase SQL Editor.
-- No habilita acceso anonimo: solo usuarios logueados.

alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.blockers enable row level security;

drop policy if exists "authenticated read members" on public.members;
drop policy if exists "authenticated write members" on public.members;
drop policy if exists "authenticated read projects" on public.projects;
drop policy if exists "authenticated write projects" on public.projects;
drop policy if exists "authenticated read tasks" on public.tasks;
drop policy if exists "authenticated write tasks" on public.tasks;
drop policy if exists "authenticated read task assignees" on public.task_assignees;
drop policy if exists "authenticated write task assignees" on public.task_assignees;
drop policy if exists "authenticated read comments" on public.comments;
drop policy if exists "authenticated write comments" on public.comments;
drop policy if exists "authenticated read blockers" on public.blockers;
drop policy if exists "authenticated write blockers" on public.blockers;

create policy "authenticated read members"
on public.members for select
to authenticated
using (true);

create policy "authenticated write members"
on public.members for all
to authenticated
using (true)
with check (true);

create policy "authenticated read projects"
on public.projects for select
to authenticated
using (true);

create policy "authenticated write projects"
on public.projects for all
to authenticated
using (true)
with check (true);

create policy "authenticated read tasks"
on public.tasks for select
to authenticated
using (true);

create policy "authenticated write tasks"
on public.tasks for all
to authenticated
using (true)
with check (true);

create policy "authenticated read task assignees"
on public.task_assignees for select
to authenticated
using (true);

create policy "authenticated write task assignees"
on public.task_assignees for all
to authenticated
using (true)
with check (true);

create policy "authenticated read comments"
on public.comments for select
to authenticated
using (true);

create policy "authenticated write comments"
on public.comments for all
to authenticated
using (true)
with check (true);

create policy "authenticated read blockers"
on public.blockers for select
to authenticated
using (true);

create policy "authenticated write blockers"
on public.blockers for all
to authenticated
using (true)
with check (true);
