create table if not exists public.project_commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sha text not null,
  message text not null,
  author text not null,
  author_login text,
  author_avatar_url text,
  committed_at timestamptz,
  commit_url text not null,
  repository text not null,
  repository_label text not null,
  synced_at timestamptz not null default now(),
  unique (project_id, sha)
);

alter table public.project_commits enable row level security;

drop policy if exists "authenticated read project commits" on public.project_commits;
create policy "authenticated read project commits"
on public.project_commits for select
to authenticated
using (true);

create index if not exists project_commits_project_id_idx on public.project_commits(project_id);
create index if not exists project_commits_committed_at_idx on public.project_commits(committed_at desc);
