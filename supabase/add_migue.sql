-- Organizacion DIA - Metricas de los Migues (asistentes de IA de cada proyecto)
-- Cada Migue reporta sus conversaciones a /api/migue/conversaciones (Migue DIA, que vive en
-- este repo, directo desde el servidor). La pantalla /migue lee la vista diaria y las funciones.
-- Modulo interno de DIA. Ejecutar en Supabase SQL Editor despues de add_teams.sql.
-- Idempotente: se puede ejecutar varias veces.

-- 1) Conversaciones. Una fila por conversacion: el bot puede reenviarla con los valores
-- acumulados (mismo external_id) y la fila se actualiza.
create table if not exists public.migue_conversations (
  id uuid primary key default gen_random_uuid(),
  migue_slug text not null,
  external_id text not null,
  channel text,
  started_at timestamptz not null,
  ended_at timestamptz,
  messages integer not null default 0 check (messages >= 0),
  outcome text not null check (outcome in ('resuelta', 'derivada', 'sin_respuesta')),
  feedback text check (feedback in ('positiva', 'negativa')),
  avg_response_ms integer check (avg_response_ms >= 0),
  tokens_in integer check (tokens_in >= 0),
  tokens_out integer check (tokens_out >= 0),
  cost_usd numeric(12, 6) check (cost_usd >= 0),
  topic text,
  -- Solo la pregunta que no supo responder, sin datos personales (ver docs/migue-conexion.md).
  unanswered_question text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (migue_slug, external_id)
);

create index if not exists migue_conversations_slug_started_idx
on public.migue_conversations(migue_slug, started_at desc);

-- Las consultas de la pantalla filtran por Migue y dia (hora de Tucuman).
create index if not exists migue_conversations_slug_day_idx
on public.migue_conversations(migue_slug, ((started_at at time zone 'America/Argentina/Tucuman')::date));

-- Un reenvio atrasado (reintento que llega despues de uno mas nuevo) no pisa los valores
-- acumulados: si trae menos mensajes o una actividad anterior, se ignora.
create or replace function public.migue_conversations_keep_latest()
returns trigger
language plpgsql
as $$
begin
  if new.messages < old.messages
    or coalesce(new.ended_at, new.started_at) < coalesce(old.ended_at, old.started_at) then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists migue_conversations_keep_latest on public.migue_conversations;
create trigger migue_conversations_keep_latest
before update on public.migue_conversations
for each row execute function public.migue_conversations_keep_latest();

drop trigger if exists migue_conversations_set_updated_at on public.migue_conversations;
create trigger migue_conversations_set_updated_at
before update on public.migue_conversations
for each row execute function public.set_updated_at();

-- 2) Claves de cada bot. Se guarda solo el hash SHA-256 de la clave (se genera con
-- npm run migue:token). La escritura la hace el servidor con la service role.
create table if not exists public.migue_ingest_keys (
  migue_slug text primary key,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.migue_conversations enable row level security;
alter table public.migue_ingest_keys enable row level security;

drop policy if exists "dia read migue conversations" on public.migue_conversations;
drop policy if exists "dia read migue ingest keys" on public.migue_ingest_keys;

-- Modulo interno de DIA: solo lectura para el equipo. No hay politicas de escritura:
-- inserta el servidor con la service role. El (select ...) evalua la funcion una vez por
-- consulta y no una vez por fila.
create policy "dia read migue conversations" on public.migue_conversations
  for select to authenticated
  using ((select public.current_team_slug()) = 'dia');

-- Lectura para mostrar que Migues tienen clave y cuando reportaron por ultima vez.
-- El hash no sirve para reconstruir la clave.
create policy "dia read migue ingest keys" on public.migue_ingest_keys
  for select to authenticated
  using ((select public.current_team_slug()) = 'dia');

-- 3) Vista diaria (dia en hora de Tucuman). security_invoker: respeta el RLS de la tabla.
-- Se recrea (drop + create) para poder cambiar sus columnas en futuras versiones.
drop view if exists public.migue_daily_topics;
drop view if exists public.migue_daily_unanswered;
drop view if exists public.migue_daily_stats;

create view public.migue_daily_stats
with (security_invoker = true) as
select
  migue_slug,
  (started_at at time zone 'America/Argentina/Tucuman')::date as day,
  count(*)::integer as conversations,
  coalesce(sum(messages), 0)::bigint as messages,
  (count(*) filter (where outcome = 'resuelta'))::integer as resolved,
  (count(*) filter (where outcome = 'derivada'))::integer as handed_off,
  (count(*) filter (where outcome = 'sin_respuesta'))::integer as unanswered,
  (count(*) filter (where feedback = 'positiva'))::integer as positive_feedback,
  (count(*) filter (where feedback = 'negativa'))::integer as negative_feedback,
  -- El promedio de respuesta se calcula solo con las conversaciones que lo informan.
  count(avg_response_ms)::integer as timed_conversations,
  coalesce(sum(avg_response_ms), 0)::float8 as response_ms_total,
  coalesce(sum(cost_usd), 0)::float8 as cost_usd
from public.migue_conversations
group by migue_slug, (started_at at time zone 'America/Argentina/Tucuman')::date;

grant select on public.migue_daily_stats to authenticated;

-- 4) Temas y preguntas sin respuesta mas frecuentes de un Migue en un rango de dias.
-- total: todas las conversaciones del rango con tema (o sin respuesta), para los porcentajes.
create or replace function public.migue_top_topics(p_slug text, p_from date, p_to date, p_limit integer default 5)
returns table (topic text, count bigint, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select topic, count(*) as count, (sum(count(*)) over ())::bigint as total
  from public.migue_conversations
  where migue_slug = p_slug
    and (started_at at time zone 'America/Argentina/Tucuman')::date between p_from and p_to
    and topic is not null and btrim(topic) <> ''
  group by topic
  order by count(*) desc, topic
  limit p_limit;
$$;

-- Agrupa sin distinguir mayusculas y muestra la version mas reciente de cada pregunta.
create or replace function public.migue_top_unanswered(p_slug text, p_from date, p_to date, p_limit integer default 5)
returns table (question text, count bigint, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (array_agg(btrim(unanswered_question) order by started_at desc))[1] as question,
    count(*) as count,
    (sum(count(*)) over ())::bigint as total
  from public.migue_conversations
  where migue_slug = p_slug
    and (started_at at time zone 'America/Argentina/Tucuman')::date between p_from and p_to
    and outcome = 'sin_respuesta'
    and unanswered_question is not null and btrim(unanswered_question) <> ''
  group by lower(btrim(unanswered_question))
  order by count(*) desc, 1
  limit p_limit;
$$;

grant execute on function public.migue_top_topics(text, date, date, integer) to authenticated;
grant execute on function public.migue_top_unanswered(text, date, date, integer) to authenticated;
