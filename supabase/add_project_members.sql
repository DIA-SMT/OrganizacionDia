create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (project_id, member_id)
);

alter table public.project_members enable row level security;

drop policy if exists "authenticated read project members" on public.project_members;
drop policy if exists "authenticated write project members" on public.project_members;

create policy "authenticated read project members"
on public.project_members for select
to authenticated
using (true);

create policy "authenticated write project members"
on public.project_members for all
to authenticated
using (true)
with check (true);

create index if not exists project_members_project_id_idx on public.project_members(project_id);
create index if not exists project_members_member_id_idx on public.project_members(member_id);
