-- Organizacion DIA - Bandeja IA v2 (para bases que ya corrieron add_bandeja_ia.sql)
--
-- Conecta la interfaz a la base. Idempotente: se puede ejecutar varias veces.
-- Las instalaciones nuevas no lo necesitan: add_bandeja_ia.sql ya incluye estos cambios.
-- Reversion: supabase/rollback_bandeja_ia.sql borra todo el modulo (incluido esto).
--
-- Cambios:
-- 1) Dias de guardia y fecha de inicio de la rotacion en la configuracion.
-- 2) Quien tiene acceso ve la lista de permisos (para poder asignar asuntos a otra persona).
-- 3) Los operadores registran ausencias e intercambios aunque el dia no tenga fila todavia.

alter table public.bandeja_ia_settings
  add column if not exists guard_weekdays smallint[] not null default '{1,2,3,4,5}',
  add column if not exists guard_anchor_date date not null default (date_trunc('week', now() at time zone 'America/Argentina/Tucuman'))::date;

alter table public.bandeja_ia_settings drop constraint if exists bandeja_ia_settings_guard_weekdays_check;
alter table public.bandeja_ia_settings
  add constraint bandeja_ia_settings_guard_weekdays_check check (guard_weekdays <@ '{1,2,3,4,5,6,7}'::smallint[]);

comment on column public.bandeja_ia_settings.guard_anchor_date is 'Lunes desde el que se cuenta la rotacion de guardias';
comment on table public.bandeja_ia_guard_shifts is 'Excepciones a la rotacion por dia. member_id o backup_member_id en null = el que indica la rotacion';

drop policy if exists "bandeja permisos lectura" on public.bandeja_ia_permissions;
create policy "bandeja permisos lectura" on public.bandeja_ia_permissions
  for select to authenticated
  using (member_id = public.current_member_id() or public.bandeja_ia_has_access());

drop policy if exists "bandeja guardias admin alta" on public.bandeja_ia_guard_shifts;
drop policy if exists "bandeja guardias admin baja" on public.bandeja_ia_guard_shifts;
drop policy if exists "bandeja guardias alta" on public.bandeja_ia_guard_shifts;
drop policy if exists "bandeja guardias baja" on public.bandeja_ia_guard_shifts;

create policy "bandeja guardias alta" on public.bandeja_ia_guard_shifts
  for insert to authenticated with check (public.bandeja_ia_can_operate());
create policy "bandeja guardias baja" on public.bandeja_ia_guard_shifts
  for delete to authenticated using (public.bandeja_ia_can_operate());
