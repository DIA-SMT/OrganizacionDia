-- Organizacion DIA - Registro de cuentas Supabase (Etapa infra)
-- DIA usa un mismo correo del municipio con alias +N (ej: base+14@dominio)
-- para crear varias cuentas Supabase y quedarse en el free tier. Este modulo
-- lleva el inventario: que alias existen, cual fue el ultimo y que proyectos
-- vive en cada cuenta.
-- Modulo interno de DIA. Ejecutar en Supabase SQL Editor despues de add_teams.sql.
-- Idempotente: se puede ejecutar varias veces.

create table if not exists public.supabase_accounts (
  id uuid primary key default gen_random_uuid(),
  alias_number integer not null unique,
  email text,
  label text,
  notes text,
  project_limit integer not null default 2 check (project_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supabase_accounts_alias_idx on public.supabase_accounts(alias_number);

drop trigger if exists supabase_accounts_set_updated_at on public.supabase_accounts;
create trigger supabase_accounts_set_updated_at
before update on public.supabase_accounts
for each row execute function public.set_updated_at();

-- Vinculo proyecto -> cuenta Supabase que lo hospeda (nullable: no todos usan Supabase).
alter table public.projects
  add column if not exists supabase_account_id uuid references public.supabase_accounts(id) on delete set null;

create index if not exists projects_supabase_account_idx on public.projects(supabase_account_id);

alter table public.supabase_accounts enable row level security;

drop policy if exists "dia read supabase accounts" on public.supabase_accounts;
drop policy if exists "dia write supabase accounts" on public.supabase_accounts;

-- Modulo interno de DIA: requiere current_team_slug() de add_teams.sql.
create policy "dia read supabase accounts" on public.supabase_accounts
  for select to authenticated
  using (public.current_team_slug() = 'dia');

create policy "dia write supabase accounts" on public.supabase_accounts
  for all to authenticated
  using (public.current_team_slug() = 'dia')
  with check (public.current_team_slug() = 'dia');
