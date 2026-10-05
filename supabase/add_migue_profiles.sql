-- Organizacion DIA - Migues agregados o editados desde el dashboard (Migue > Agregar Migue)
-- El catalogo de lib/migue.ts sigue siendo la base: una fila con el mismo slug lo pisa (o lo
-- oculta con active = false) y una fila nueva suma un Migue. Las portadas y los modelos 3D van
-- al bucket migue-assets. Modulo interno de DIA: lee y escribe solo ese equipo.
-- Ejecutar en Supabase SQL Editor despues de add_teams.sql y add_migue.sql.
-- Idempotente: se puede ejecutar varias veces.

-- 1) Fichas
create table if not exists public.migue_profiles (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  name text not null check (char_length(name) between 2 and 60),
  look text not null default '' check (char_length(look) <= 80),
  project_name text not null check (char_length(project_name) between 2 and 80),
  area text not null default '' check (char_length(area) <= 60),
  description text not null default '' check (char_length(description) <= 240),
  channels text[] not null default '{}'
    check (channels <@ array['WhatsApp', 'Telegram', 'Web', 'App', 'Pantallas']),
  llm_model text not null default '' check (char_length(llm_model) <= 80),
  status text not null default 'En desarrollo' check (status in ('En produccion', 'Piloto', 'En desarrollo')),
  accent text not null default '#d7dcef' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  -- URLs publicas del bucket migue-assets. null: se usan las vistas y el modelo del repo.
  poster_url text check (char_length(poster_url) <= 500),
  model_url text check (char_length(model_url) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

-- Las 4 vistas del giro (frente, perfil derecho, espalda, perfil izquierdo), recortadas por el
-- formulario a partir de la lamina de 8 vistas o de las vistas sueltas. null: solo la portada.
alter table public.migue_profiles add column if not exists frame_urls text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'migue_profiles_frame_urls_check') then
    alter table public.migue_profiles
      add constraint migue_profiles_frame_urls_check check (frame_urls is null or cardinality(frame_urls) <= 4);
  end if;
end;
$$;

-- Quien y cuando lo pone la base, no el navegador.
create or replace function public.migue_profiles_touch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  else
    new.created_at = old.created_at;
  end if;
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists migue_profiles_touch on public.migue_profiles;
create trigger migue_profiles_touch
before insert or update on public.migue_profiles
for each row execute function public.migue_profiles_touch();

alter table public.migue_profiles enable row level security;

drop policy if exists "dia read migue profiles" on public.migue_profiles;
drop policy if exists "dia insert migue profiles" on public.migue_profiles;
drop policy if exists "dia update migue profiles" on public.migue_profiles;

-- Sin politica de borrado: un Migue se oculta (active = false) y sus estadisticas quedan.
create policy "dia read migue profiles" on public.migue_profiles
  for select to authenticated
  using ((select public.current_team_slug()) = 'dia');

create policy "dia insert migue profiles" on public.migue_profiles
  for insert to authenticated
  with check ((select public.current_team_slug()) = 'dia');

create policy "dia update migue profiles" on public.migue_profiles
  for update to authenticated
  using ((select public.current_team_slug()) = 'dia')
  with check ((select public.current_team_slug()) = 'dia');

-- 2) Archivos: portadas en webp (el navegador las convierte; png si no sabe) y modelos .glb ya
-- optimizados.
-- Publico para leer (la pantalla los muestra con su URL); sube solo el equipo DIA.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('migue-assets', 'migue-assets', true, 6291456, array['image/webp', 'image/png', 'model/gltf-binary'])
on conflict (id) do update
set public = true,
    file_size_limit = 6291456,
    allowed_mime_types = array['image/webp', 'image/png', 'model/gltf-binary'];

drop policy if exists "dia read migue assets" on storage.objects;
drop policy if exists "dia upload migue assets" on storage.objects;

create policy "dia read migue assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'migue-assets' and (select public.current_team_slug()) = 'dia');

-- Cada subida va a una ruta nueva (<slug>/<fecha>-portada.webp): no hace falta pisar archivos.
create policy "dia upload migue assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'migue-assets' and (select public.current_team_slug()) = 'dia');
