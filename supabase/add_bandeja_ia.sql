-- Organizacion DIA - Bandeja IA (correo institucional: alertas, responsables y seguimiento)
--
-- NO EJECUTADA. Revisar y correr manualmente en Supabase > SQL Editor cuando se apruebe.
-- Requiere: schema.sql (o add_teams.sql) por current_member_id() y current_team_slug().
-- Idempotente: se puede ejecutar varias veces. Reversible: supabase/rollback_bandeja_ia.sql.
-- Detalle de diseno: docs/bandeja-ia.md
--
-- Principios:
-- * Acceso por permiso ESPECIFICO (bandeja_ia_permissions). Pertenecer a DIA o ser Admin
--   del Dashboard no da acceso al correo. Sin fila valida: acceso denegado.
-- * Del correo solo se guardan metadatos (remitente, asunto, fecha, etiquetas y, si se
--   habilita, un extracto corto). Nunca cuerpos ni adjuntos.
-- * Mensajes, estado de sincronizacion y eventos de Pub/Sub los escribe SOLO el servidor
--   con service role (que saltea RLS). Ningun usuario puede escribirlos desde el navegador.
-- * La auditoria la escriben triggers; nadie puede editarla ni borrarla.

create extension if not exists pgcrypto;

-- ============================================================
-- 1) Permisos especificos
-- ============================================================

create table if not exists public.bandeja_ia_permissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  role text not null check (role in ('admin', 'operador', 'lector')),
  active boolean not null default true,
  granted_by uuid references public.members(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

-- Rol de Bandeja IA de la persona logueada, o null. Exige: integrante activo, del equipo
-- DIA, con permiso activo y no revocado. security definer para evitar recursion de RLS.
create or replace function public.bandeja_ia_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.bandeja_ia_permissions p
  join public.members m on m.id = p.member_id
  where p.member_id = public.current_member_id()
    and p.active
    and p.revoked_at is null
    and m.active
    and public.current_team_slug() = 'dia'
  limit 1
$$;

create or replace function public.bandeja_ia_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bandeja_ia_current_role() is not null
$$;

create or replace function public.bandeja_ia_can_operate()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.bandeja_ia_current_role() in ('admin', 'operador'), false)
$$;

create or replace function public.bandeja_ia_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.bandeja_ia_current_role() = 'admin', false)
$$;

-- ============================================================
-- 2) Configuracion general (una sola fila) y reglas de clasificacion
-- ============================================================

create table if not exists public.bandeja_ia_settings (
  id boolean primary key default true check (id),
  mailbox_address text,
  time_zone text not null default 'America/Argentina/Tucuman',
  -- Interruptores: arrancan apagados. El servidor ademas exige BANDEJA_IA_GMAIL_ENABLED=true.
  gmail_enabled boolean not null default false,
  alerts_enabled boolean not null default false,
  telegram_enabled boolean not null default false,
  store_snippets boolean not null default false,
  initial_sync_days integer not null default 30 check (initial_sync_days between 1 and 365),
  -- Guardias: dias con guardia (1 = lunes ... 7 = domingo) y lunes desde el que cuenta la rotacion.
  guard_weekdays smallint[] not null default '{1,2,3,4,5}' check (guard_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]),
  guard_anchor_date date not null default (date_trunc('week', now() at time zone 'America/Argentina/Tucuman'))::date,
  updated_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.bandeja_ia_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.bandeja_ia_rules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  field text not null check (field in ('subject', 'from', 'snippet', 'subject_snippet')),
  keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  category text check (category in ('invitacion', 'reunion', 'fecha_limite', 'solicitud_respuesta', 'documentacion', 'informativo')),
  priority text check (priority in ('critica', 'alta', 'normal', 'informativa')),
  requires_response boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3) Guardias y suplencias
-- ============================================================

-- Rotacion base: orden de integrantes y dias con guardia (1 = lunes ... 7 = domingo).
create table if not exists public.bandeja_ia_guard_rotation (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  position integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Excepciones por dia sobre la rotacion (ausencias, cambios). null = lo que indica la rotacion.
create table if not exists public.bandeja_ia_guard_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null unique,
  member_id uuid references public.members(id) on delete set null,
  backup_member_id uuid references public.members(id) on delete set null,
  status text not null default 'programada' check (status in ('programada', 'cambiada', 'ausencia')),
  reason text,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_id is null or backup_member_id is null or member_id <> backup_member_id)
);

-- Solicitudes de cambio y avisos de ausencia (quedan aunque luego se revierta el cambio).
create table if not exists public.bandeja_ia_guard_changes (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.bandeja_ia_guard_shifts(id) on delete cascade,
  kind text not null check (kind in ('ausencia', 'cambio', 'intercambio')),
  from_member_id uuid references public.members(id) on delete set null,
  to_member_id uuid references public.members(id) on delete set null,
  reason text,
  requested_by uuid references public.members(id) on delete set null,
  approved_by uuid references public.members(id) on delete set null,
  status text not null default 'aplicado' check (status in ('pendiente', 'aplicado', 'rechazado')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4) Metadatos de mensajes de Gmail (solo servidor)
-- ============================================================

create table if not exists public.bandeja_ia_messages (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,          -- idempotencia: un mensaje se guarda una vez
  gmail_thread_id text not null,
  history_id numeric(20, 0),
  received_at timestamptz,
  from_name text not null default '',
  from_address text not null default '',
  subject text not null default '',
  snippet text,                                   -- null salvo store_snippets = true
  label_ids text[] not null default '{}',
  has_attachments boolean not null default false,
  rfc822_message_id text,
  ingested_at timestamptz not null default now()
);

create index if not exists bandeja_ia_messages_thread_idx on public.bandeja_ia_messages(gmail_thread_id);
create index if not exists bandeja_ia_messages_received_idx on public.bandeja_ia_messages(received_at desc);

-- ============================================================
-- 5) Asuntos (gestiones), vinculos, notas y asignaciones
-- ============================================================

create table if not exists public.bandeja_ia_asuntos (
  id uuid primary key default gen_random_uuid(),
  gmail_thread_id text unique,                    -- un asunto por conversacion
  title text not null,
  summary text,
  category text not null default 'informativo' check (category in ('invitacion', 'reunion', 'fecha_limite', 'solicitud_respuesta', 'documentacion', 'informativo')),
  priority text not null default 'normal' check (priority in ('critica', 'alta', 'normal', 'informativa')),
  suggested_priority text check (suggested_priority in ('critica', 'alta', 'normal', 'informativa')),
  priority_reasons text[] not null default '{}',
  priority_confirmed_by uuid references public.members(id) on delete set null,
  priority_confirmed_at timestamptz,
  status text not null default 'nuevo' check (status in ('nuevo', 'en_revision', 'asignado', 'esperando_respuesta', 'resuelto', 'descartado')),
  requires_response boolean not null default false,
  detected_dates jsonb not null default '[]'::jsonb,
  due_at timestamptz,
  assignee_member_id uuid references public.members(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('resuelto', 'descartado')) = (resolved_at is not null))
);

create index if not exists bandeja_ia_asuntos_open_idx on public.bandeja_ia_asuntos(priority, due_at) where status not in ('resuelto', 'descartado');
create index if not exists bandeja_ia_asuntos_assignee_idx on public.bandeja_ia_asuntos(assignee_member_id);

create table if not exists public.bandeja_ia_asunto_messages (
  asunto_id uuid not null references public.bandeja_ia_asuntos(id) on delete cascade,
  message_id uuid not null references public.bandeja_ia_messages(id) on delete cascade,
  primary key (asunto_id, message_id)
);

create table if not exists public.bandeja_ia_notes (
  id uuid primary key default gen_random_uuid(),
  asunto_id uuid not null references public.bandeja_ia_asuntos(id) on delete cascade,
  author_member_id uuid not null references public.members(id),
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.bandeja_ia_assignments (
  id uuid primary key default gen_random_uuid(),
  asunto_id uuid not null references public.bandeja_ia_asuntos(id) on delete cascade,
  from_member_id uuid references public.members(id) on delete set null,
  to_member_id uuid references public.members(id) on delete set null,
  assigned_by uuid references public.members(id) on delete set null,
  kind text not null default 'asignado' check (kind in ('tomado', 'asignado', 'liberado')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists bandeja_ia_assignments_asunto_idx on public.bandeja_ia_assignments(asunto_id, created_at desc);

-- ============================================================
-- 6) Notificaciones y confirmaciones de lectura
-- ============================================================

create table if not exists public.bandeja_ia_notifications (
  id uuid primary key default gen_random_uuid(),
  asunto_id uuid references public.bandeja_ia_asuntos(id) on delete cascade,
  recipient_member_id uuid not null references public.members(id) on delete cascade,
  channel text not null check (channel in ('dashboard', 'telegram')),
  kind text not null check (kind in ('nuevo_importante', 'asignado', 'vencimiento', 'sin_responsable')),
  -- Solo datos no sensibles (prioridad, categoria, enlace). Nunca remitente ni asunto.
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pendiente' check (status in ('pendiente', 'enviada', 'confirmada', 'fallida', 'suprimida')),
  dedupe_key text not null unique,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  acknowledged_at timestamptz
);

create index if not exists bandeja_ia_notifications_recipient_idx on public.bandeja_ia_notifications(recipient_member_id, status);

-- ============================================================
-- 7) Estado de sincronizacion de Gmail (solo servidor)
-- ============================================================

create table if not exists public.bandeja_ia_sync_state (
  mailbox_address text primary key,
  last_history_id numeric(20, 0),
  watch_expiration timestamptz,
  needs_full_sync boolean not null default true,
  status text not null default 'desconectado' check (status in ('desconectado', 'sincronizando', 'ok', 'error', 'reconectar')),
  consecutive_failures integer not null default 0,
  next_retry_at timestamptz,
  last_sync_at timestamptz,
  last_full_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.bandeja_ia_sync_runs (
  id uuid primary key default gen_random_uuid(),
  mailbox_address text not null,
  kind text not null check (kind in ('inicial', 'incremental', 'watch')),
  trigger text not null check (trigger in ('pubsub', 'cron', 'manual')),
  status text not null default 'en_curso' check (status in ('en_curso', 'ok', 'error')),
  messages_found integer not null default 0,
  messages_stored integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists bandeja_ia_sync_runs_started_idx on public.bandeja_ia_sync_runs(started_at desc);

-- Pub/Sub entrega "al menos una vez": cada push se registra una sola vez.
create table if not exists public.bandeja_ia_pubsub_events (
  pubsub_message_id text primary key,
  mailbox_address text not null,
  history_id numeric(20, 0) not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ============================================================
-- 8) Auditoria (solo triggers; sin update ni delete)
-- ============================================================

create table if not exists public.bandeja_ia_audit_log (
  id bigint generated always as identity primary key,
  actor_member_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bandeja_ia_audit_entity_idx on public.bandeja_ia_audit_log(entity_type, entity_id, created_at desc);

create or replace function public.bandeja_ia_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id text;
  changes jsonb := '{}'::jsonb;
begin
  row_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', to_jsonb(new) ->> 'member_id');

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'despues', n.value)), '{}'::jsonb)
    into changes
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value
      and n.key not in ('updated_at');
    if changes = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    changes := to_jsonb(new) - 'body' - 'snippet';
  else
    changes := to_jsonb(old) - 'body' - 'snippet';
  end if;

  insert into public.bandeja_ia_audit_log (actor_member_id, action, entity_type, entity_id, details)
  values (public.current_member_id(), lower(tg_op), tg_table_name, row_id, changes);

  return coalesce(new, old);
end;
$$;

-- updated_at automatico (set_updated_at viene de schema.sql).
do $$
declare
  t text;
begin
  foreach t in array array['bandeja_ia_permissions', 'bandeja_ia_settings', 'bandeja_ia_rules', 'bandeja_ia_guard_shifts', 'bandeja_ia_asuntos', 'bandeja_ia_sync_state']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;

  foreach t in array array['bandeja_ia_permissions', 'bandeja_ia_settings', 'bandeja_ia_rules', 'bandeja_ia_guard_rotation', 'bandeja_ia_guard_shifts', 'bandeja_ia_guard_changes', 'bandeja_ia_asuntos', 'bandeja_ia_notes', 'bandeja_ia_assignments']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.bandeja_ia_audit()', t || '_audit', t);
  end loop;
end;
$$;

-- Las asignaciones y resoluciones las firma la persona logueada, no el navegador.
create or replace function public.bandeja_ia_stamp_asunto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_member_id is distinct from old.assignee_member_id then
    insert into public.bandeja_ia_assignments (asunto_id, from_member_id, to_member_id, assigned_by, kind)
    values (
      new.id,
      old.assignee_member_id,
      new.assignee_member_id,
      public.current_member_id(),
      case
        when new.assignee_member_id is null then 'liberado'
        when new.assignee_member_id = public.current_member_id() then 'tomado'
        else 'asignado'
      end
    );
  end if;

  -- Solo una persona confirma prioridades; una reclasificacion del servidor (service role,
  -- sin integrante) no cuenta como confirmacion.
  if public.current_member_id() is not null
    and (new.priority is distinct from old.priority or new.priority_confirmed_at is distinct from old.priority_confirmed_at) then
    new.priority_confirmed_by := public.current_member_id();
    new.priority_confirmed_at := now();
  elsif public.current_member_id() is null and new.priority is distinct from old.priority then
    new.priority_confirmed_by := null;
    new.priority_confirmed_at := null;
  end if;

  if new.status in ('resuelto', 'descartado') and old.status not in ('resuelto', 'descartado') then
    new.resolved_at := now();
    new.resolved_by := public.current_member_id();
  elsif new.status not in ('resuelto', 'descartado') then
    new.resolved_at := null;
    new.resolved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists bandeja_ia_asuntos_stamp on public.bandeja_ia_asuntos;
create trigger bandeja_ia_asuntos_stamp
before update on public.bandeja_ia_asuntos
for each row execute function public.bandeja_ia_stamp_asunto();

-- Confirmar una notificacion propia sin poder tocar el resto de sus columnas.
create or replace function public.bandeja_ia_acknowledge_notification(notification_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bandeja_ia_notifications
  set status = 'confirmada', acknowledged_at = now()
  where id = notification_id
    and recipient_member_id = public.current_member_id()
    and public.bandeja_ia_has_access()
$$;

-- ============================================================
-- 9) RLS: todo cerrado salvo permiso especifico
-- ============================================================

alter table public.bandeja_ia_permissions enable row level security;
alter table public.bandeja_ia_settings enable row level security;
alter table public.bandeja_ia_rules enable row level security;
alter table public.bandeja_ia_guard_rotation enable row level security;
alter table public.bandeja_ia_guard_shifts enable row level security;
alter table public.bandeja_ia_guard_changes enable row level security;
alter table public.bandeja_ia_messages enable row level security;
alter table public.bandeja_ia_asuntos enable row level security;
alter table public.bandeja_ia_asunto_messages enable row level security;
alter table public.bandeja_ia_notes enable row level security;
alter table public.bandeja_ia_assignments enable row level security;
alter table public.bandeja_ia_notifications enable row level security;
alter table public.bandeja_ia_sync_state enable row level security;
alter table public.bandeja_ia_sync_runs enable row level security;
alter table public.bandeja_ia_pubsub_events enable row level security;
alter table public.bandeja_ia_audit_log enable row level security;

-- Sin acceso anonimo a nada del modulo.
revoke all on
  public.bandeja_ia_permissions, public.bandeja_ia_settings, public.bandeja_ia_rules,
  public.bandeja_ia_guard_rotation, public.bandeja_ia_guard_shifts, public.bandeja_ia_guard_changes,
  public.bandeja_ia_messages, public.bandeja_ia_asuntos, public.bandeja_ia_asunto_messages,
  public.bandeja_ia_notes, public.bandeja_ia_assignments, public.bandeja_ia_notifications,
  public.bandeja_ia_sync_state, public.bandeja_ia_sync_runs, public.bandeja_ia_pubsub_events,
  public.bandeja_ia_audit_log
from anon;

revoke execute on function
  public.bandeja_ia_current_role(), public.bandeja_ia_has_access(), public.bandeja_ia_can_operate(),
  public.bandeja_ia_is_admin(), public.bandeja_ia_acknowledge_notification(uuid)
from public, anon;

grant execute on function
  public.bandeja_ia_current_role(), public.bandeja_ia_has_access(), public.bandeja_ia_can_operate(),
  public.bandeja_ia_is_admin(), public.bandeja_ia_acknowledge_notification(uuid)
to authenticated;

-- Los triggers no se invocan directo.
revoke execute on function public.bandeja_ia_audit(), public.bandeja_ia_stamp_asunto() from public, anon, authenticated;

do $$
declare
  p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename like 'bandeja_ia_%'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- Permisos: quien tiene acceso ve la lista (para poder asignar asuntos); admin administra
-- los de los demas (no el propio, para que nadie se auto-otorgue ni se quite el acceso).
create policy "bandeja permisos lectura" on public.bandeja_ia_permissions
  for select to authenticated
  using (member_id = public.current_member_id() or public.bandeja_ia_has_access());

create policy "bandeja permisos admin" on public.bandeja_ia_permissions
  for all to authenticated
  using (public.bandeja_ia_is_admin() and member_id <> public.current_member_id())
  with check (public.bandeja_ia_is_admin() and member_id <> public.current_member_id());

-- Configuracion y reglas: lectura con acceso, escritura solo admin.
create policy "bandeja settings lectura" on public.bandeja_ia_settings
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja settings admin" on public.bandeja_ia_settings
  for update to authenticated using (public.bandeja_ia_is_admin()) with check (public.bandeja_ia_is_admin());

create policy "bandeja reglas lectura" on public.bandeja_ia_rules
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja reglas admin" on public.bandeja_ia_rules
  for all to authenticated using (public.bandeja_ia_is_admin()) with check (public.bandeja_ia_is_admin());

-- Guardias: lectura con acceso; la rotacion la arma admin. Las excepciones por dia
-- (ausencias, cambios, intercambios) las registra un operador; todo queda en guard_changes
-- y en la auditoria. member_id/backup_member_id en null = el que indica la rotacion.
create policy "bandeja rotacion lectura" on public.bandeja_ia_guard_rotation
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja rotacion admin" on public.bandeja_ia_guard_rotation
  for all to authenticated using (public.bandeja_ia_is_admin()) with check (public.bandeja_ia_is_admin());

create policy "bandeja guardias lectura" on public.bandeja_ia_guard_shifts
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja guardias operar" on public.bandeja_ia_guard_shifts
  for update to authenticated using (public.bandeja_ia_can_operate()) with check (public.bandeja_ia_can_operate());
create policy "bandeja guardias alta" on public.bandeja_ia_guard_shifts
  for insert to authenticated with check (public.bandeja_ia_can_operate());
create policy "bandeja guardias baja" on public.bandeja_ia_guard_shifts
  for delete to authenticated using (public.bandeja_ia_can_operate());

create policy "bandeja cambios guardia lectura" on public.bandeja_ia_guard_changes
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja cambios guardia alta" on public.bandeja_ia_guard_changes
  for insert to authenticated
  with check (public.bandeja_ia_can_operate() and requested_by = public.current_member_id());
create policy "bandeja cambios guardia admin" on public.bandeja_ia_guard_changes
  for update to authenticated using (public.bandeja_ia_is_admin()) with check (public.bandeja_ia_is_admin());

-- Mensajes: solo lectura con acceso. Altas y cambios unicamente con service role.
create policy "bandeja mensajes lectura" on public.bandeja_ia_messages
  for select to authenticated using (public.bandeja_ia_has_access());

create policy "bandeja vinculos lectura" on public.bandeja_ia_asunto_messages
  for select to authenticated using (public.bandeja_ia_has_access());

-- Asuntos: lectura con acceso; gestion (tomar, asignar, estado, prioridad) con operador.
-- Las altas automaticas las hace el servidor; un operador puede crear uno manual.
create policy "bandeja asuntos lectura" on public.bandeja_ia_asuntos
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja asuntos alta" on public.bandeja_ia_asuntos
  for insert to authenticated with check (public.bandeja_ia_can_operate() and gmail_thread_id is null);
create policy "bandeja asuntos gestion" on public.bandeja_ia_asuntos
  for update to authenticated using (public.bandeja_ia_can_operate()) with check (public.bandeja_ia_can_operate());

-- Notas: se agregan firmadas por quien las escribe; no se editan ni se borran.
create policy "bandeja notas lectura" on public.bandeja_ia_notes
  for select to authenticated using (public.bandeja_ia_has_access());
create policy "bandeja notas alta" on public.bandeja_ia_notes
  for insert to authenticated
  with check (public.bandeja_ia_can_operate() and author_member_id = public.current_member_id());

-- Asignaciones: las escribe el trigger; se leen con acceso.
create policy "bandeja asignaciones lectura" on public.bandeja_ia_assignments
  for select to authenticated using (public.bandeja_ia_has_access());

-- Notificaciones: cada quien ve las suyas (admin todas). Se confirman con la funcion.
create policy "bandeja notificaciones lectura" on public.bandeja_ia_notifications
  for select to authenticated
  using (public.bandeja_ia_has_access() and (recipient_member_id = public.current_member_id() or public.bandeja_ia_is_admin()));

-- Sincronizacion: solo admin la ve (monitoreo). Escritura solo service role.
create policy "bandeja sync estado admin" on public.bandeja_ia_sync_state
  for select to authenticated using (public.bandeja_ia_is_admin());
create policy "bandeja sync corridas admin" on public.bandeja_ia_sync_runs
  for select to authenticated using (public.bandeja_ia_is_admin());
-- bandeja_ia_pubsub_events: sin politicas (nadie fuera del servidor la lee).

-- Auditoria: lectura con acceso; nadie la modifica.
create policy "bandeja auditoria lectura" on public.bandeja_ia_audit_log
  for select to authenticated using (public.bandeja_ia_has_access());

-- ============================================================
-- 10) Primer administrador (manual)
-- ============================================================
-- Nadie tiene acceso hasta que se cargue a mano el primer admin desde el SQL Editor:
--
--   insert into public.bandeja_ia_permissions (member_id, role, notes)
--   select id, 'admin', 'Alta inicial'
--   from public.members
--   where lower(email) = lower('persona@smt.gob.ar') and active;
