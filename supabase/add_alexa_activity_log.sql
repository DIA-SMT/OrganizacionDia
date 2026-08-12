create table if not exists public.alexa_activity_log (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  alexa_user_id text not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  response jsonb,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

alter table public.alexa_activity_log enable row level security;

-- Modulo interno de DIA: requiere las funciones de equipo de add_teams.sql
-- (en una base nueva, ejecutar schema.sql antes que este archivo).
drop policy if exists "authenticated read alexa activity" on public.alexa_activity_log;
drop policy if exists "dia read alexa activity" on public.alexa_activity_log;

create policy "dia read alexa activity"
on public.alexa_activity_log for select
to authenticated
using (public.current_team_slug() = 'dia');

create index if not exists alexa_activity_log_created_at_idx
on public.alexa_activity_log(created_at desc);

create index if not exists alexa_activity_log_user_idx
on public.alexa_activity_log(alexa_user_id);
