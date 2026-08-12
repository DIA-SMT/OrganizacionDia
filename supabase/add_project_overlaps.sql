-- Organizacion DIA - Etapa 3 multi-equipo: deteccion de cruces entre proyectos
-- Detecta proyectos similares entre equipos distintos (nombre, descripcion o repo)
-- y los registra en project_overlaps para revisarlos desde el Radar.
-- Ejecutar en Supabase SQL Editor despues de add_teams.sql. Idempotente.
-- Detalle de diseño: docs/plan-multi-equipo-ditec.md

-- ============================================================
-- 1) Extensiones de similitud de texto
-- ============================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ============================================================
-- 2) Normalizadores
-- ============================================================

-- Texto sin acentos y en minusculas, para comparar con trigramas.
create or replace function public.normalize_project_text(input text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select lower(unaccent(coalesce(input, '')))
$$;

-- URL de repo comparable: sin protocolo, www, ".git" ni barras finales.
create or replace function public.normalize_repo_url(input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(input, ''))), '^https?://(www\.)?', ''),
      '(\.git)?/*$',
      ''
    ),
    ''
  )
$$;

-- ============================================================
-- 3) Candidatos de cruce: proyectos parecidos de OTROS equipos
-- security definer: compara contra proyectos que RLS no deja leer,
-- pero devuelve solo datos de ficha (nombre, equipo, estado).
-- ============================================================

create or replace function public.project_similarity_candidates(
  p_team_id uuid,
  p_name text,
  p_description text,
  p_repository_url text,
  p_repository_url_secondary text,
  p_exclude_project_id uuid
)
returns table (
  project_id uuid,
  project_name text,
  project_status text,
  team_id uuid,
  team_name text,
  team_slug text,
  score numeric,
  match_reason text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with entrada as (
    select
      public.normalize_project_text(p_name) as nombre,
      public.normalize_project_text(coalesce(p_name, '') || ' ' || coalesce(p_description, '')) as texto,
      public.normalize_repo_url(p_repository_url) as repo1,
      public.normalize_repo_url(p_repository_url_secondary) as repo2
  ),
  candidatos as (
    select
      p.id,
      p.name,
      p.status,
      p.team_id,
      t.name as team_name,
      t.slug as team_slug,
      similarity(public.normalize_project_text(p.name), e.nombre) as sim_nombre,
      word_similarity(public.normalize_project_text(p.name), e.texto) as sim_directa,
      word_similarity(e.nombre, public.normalize_project_text(p.name || ' ' || coalesce(p.description, ''))) as sim_inversa,
      (
        (e.repo1 is not null and e.repo1 in (public.normalize_repo_url(p.repository_url), public.normalize_repo_url(p.repository_url_secondary)))
        or (e.repo2 is not null and e.repo2 in (public.normalize_repo_url(p.repository_url), public.normalize_repo_url(p.repository_url_secondary)))
      ) as mismo_repo
    from public.projects p
    join public.teams t on t.id = p.team_id
    cross join entrada e
    where p.active
      and p.team_id is distinct from p_team_id
      and (p_exclude_project_id is null or p.id <> p_exclude_project_id)
      and coalesce(trim(p_name), '') <> ''
  )
  select
    c.id,
    c.name,
    c.status,
    c.team_id,
    c.team_name,
    c.team_slug,
    round(greatest(
      case when c.mismo_repo then 1.0 else 0.0 end,
      c.sim_nombre,
      c.sim_directa * 0.9,
      c.sim_inversa * 0.9
    )::numeric, 2) as score,
    case
      when c.mismo_repo then 'Mismo repositorio'
      when c.sim_nombre >= 0.35 then 'Nombre similar'
      else 'Coincidencia en la descripcion'
    end as match_reason
  from candidatos c
  where c.mismo_repo
    or c.sim_nombre >= 0.35
    or c.sim_directa >= 0.62
    or c.sim_inversa >= 0.62
  order by 7 desc
  limit 10
$$;

revoke execute on function public.project_similarity_candidates(uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.project_similarity_candidates(uuid, text, text, text, text, uuid) to authenticated, service_role;

-- RPC para el formulario de alta: compara contra los equipos ajenos al usuario.
create or replace function public.find_similar_projects(
  p_name text,
  p_description text default null,
  p_repository_url text default null,
  p_repository_url_secondary text default null,
  p_exclude_project_id uuid default null
)
returns table (
  project_id uuid,
  project_name text,
  project_status text,
  team_id uuid,
  team_name text,
  team_slug text,
  score numeric,
  match_reason text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select *
  from public.project_similarity_candidates(
    public.current_team_id(),
    p_name,
    p_description,
    p_repository_url,
    p_repository_url_secondary,
    p_exclude_project_id
  )
$$;

revoke execute on function public.find_similar_projects(text, text, text, text, uuid) from public, anon;
grant execute on function public.find_similar_projects(text, text, text, text, uuid) to authenticated;

-- ============================================================
-- 4) Registro de cruces detectados
-- El par siempre se guarda ordenado (a < b) para no duplicar en espejo.
-- ============================================================

create table if not exists public.project_overlaps (
  id uuid primary key default gen_random_uuid(),
  project_a_id uuid not null references public.projects(id) on delete cascade,
  project_b_id uuid not null references public.projects(id) on delete cascade,
  score numeric not null,
  match_reason text not null,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Confirmado', 'Descartado')),
  reviewed_by_id uuid references public.members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (project_a_id < project_b_id),
  unique (project_a_id, project_b_id)
);

create index if not exists project_overlaps_status_idx on public.project_overlaps(status);
create index if not exists project_overlaps_project_a_idx on public.project_overlaps(project_a_id);
create index if not exists project_overlaps_project_b_idx on public.project_overlaps(project_b_id);

drop trigger if exists project_overlaps_set_updated_at on public.project_overlaps;
create trigger project_overlaps_set_updated_at
before update on public.project_overlaps
for each row execute function public.set_updated_at();

alter table public.project_overlaps enable row level security;

drop policy if exists "team read overlaps" on public.project_overlaps;
drop policy if exists "team review overlaps" on public.project_overlaps;

-- Ven y revisan el cruce los dos equipos involucrados.
-- No hay politica de insert/delete: solo escribe el trigger (definer).
create policy "team read overlaps" on public.project_overlaps
  for select to authenticated
  using (
    public.project_belongs_to_current_team(project_a_id)
    or public.project_belongs_to_current_team(project_b_id)
  );

create policy "team review overlaps" on public.project_overlaps
  for update to authenticated
  using (
    public.project_belongs_to_current_team(project_a_id)
    or public.project_belongs_to_current_team(project_b_id)
  )
  with check (
    public.project_belongs_to_current_team(project_a_id)
    or public.project_belongs_to_current_team(project_b_id)
  );

-- ============================================================
-- 5) Deteccion automatica al crear o editar proyectos
-- ============================================================

create or replace function public.detect_project_overlaps()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  candidato record;
begin
  -- Los pendientes del proyecto se recalculan; los revisados se conservan.
  delete from public.project_overlaps o
  where o.status = 'Pendiente'
    and (o.project_a_id = new.id or o.project_b_id = new.id);

  for candidato in
    select *
    from public.project_similarity_candidates(
      new.team_id,
      new.name,
      new.description,
      new.repository_url,
      new.repository_url_secondary,
      new.id
    )
  loop
    insert into public.project_overlaps (project_a_id, project_b_id, score, match_reason)
    values (
      least(new.id, candidato.project_id),
      greatest(new.id, candidato.project_id),
      candidato.score,
      candidato.match_reason
    )
    on conflict (project_a_id, project_b_id) do update
      set score = excluded.score,
          match_reason = excluded.match_reason
      where project_overlaps.status = 'Pendiente';
  end loop;

  return new;
end;
$$;

drop trigger if exists projects_detect_overlaps on public.projects;
create trigger projects_detect_overlaps
after insert or update of name, description, repository_url, repository_url_secondary, team_id, active on public.projects
for each row
when (new.active)
execute function public.detect_project_overlaps();

-- Deteccion inicial sobre los proyectos ya cargados.
do $$
declare
  proyecto record;
begin
  for proyecto in
    select id, team_id, name, description, repository_url, repository_url_secondary
    from public.projects
    where active
  loop
    insert into public.project_overlaps (project_a_id, project_b_id, score, match_reason)
    select
      least(proyecto.id, c.project_id),
      greatest(proyecto.id, c.project_id),
      c.score,
      c.match_reason
    from public.project_similarity_candidates(
      proyecto.team_id,
      proyecto.name,
      proyecto.description,
      proyecto.repository_url,
      proyecto.repository_url_secondary,
      proyecto.id
    ) c
    on conflict (project_a_id, project_b_id) do nothing;
  end loop;
end $$;

-- ============================================================
-- 6) Vista para el panel del Radar
-- Vista security definer: muestra el cruce con los nombres de ambos
-- proyectos (ficha), filtrando a los cruces que involucran al equipo
-- del usuario y a proyectos activos.
-- ============================================================

drop view if exists public.project_overlaps_detail;

create view public.project_overlaps_detail as
select
  o.id,
  o.score,
  o.match_reason,
  o.status,
  o.reviewed_at,
  o.created_at,
  o.project_a_id,
  pa.name as project_a_name,
  ta.name as team_a_name,
  ta.slug as team_a_slug,
  ta.color as team_a_color,
  o.project_b_id,
  pb.name as project_b_name,
  tb.name as team_b_name,
  tb.slug as team_b_slug,
  tb.color as team_b_color,
  rm.full_name as reviewed_by_name
from public.project_overlaps o
join public.projects pa on pa.id = o.project_a_id
join public.teams ta on ta.id = pa.team_id
join public.projects pb on pb.id = o.project_b_id
join public.teams tb on tb.id = pb.team_id
left join public.members rm on rm.id = o.reviewed_by_id
where pa.active
  and pb.active
  and (pa.team_id = public.current_team_id() or pb.team_id = public.current_team_id());

revoke all on public.project_overlaps_detail from anon;
grant select on public.project_overlaps_detail to authenticated;
