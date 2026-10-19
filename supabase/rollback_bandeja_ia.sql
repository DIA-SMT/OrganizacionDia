-- Organizacion DIA - Reversion de Bandeja IA (deshace supabase/add_bandeja_ia.sql)
--
-- NO EJECUTADA. Borra TODAS las tablas del modulo y sus datos (permisos, guardias,
-- metadatos de mensajes, asuntos, notas, notificaciones y auditoria). No toca ninguna
-- tabla existente del Dashboard (members, teams, projects, etc.).
-- Si hace falta conservar la auditoria, exportar antes public.bandeja_ia_audit_log.

begin;

drop table if exists public.bandeja_ia_asunto_messages cascade;
drop table if exists public.bandeja_ia_notes cascade;
drop table if exists public.bandeja_ia_assignments cascade;
drop table if exists public.bandeja_ia_notifications cascade;
drop table if exists public.bandeja_ia_asuntos cascade;
drop table if exists public.bandeja_ia_messages cascade;
drop table if exists public.bandeja_ia_guard_changes cascade;
drop table if exists public.bandeja_ia_guard_shifts cascade;
drop table if exists public.bandeja_ia_guard_rotation cascade;
drop table if exists public.bandeja_ia_rules cascade;
drop table if exists public.bandeja_ia_settings cascade;
drop table if exists public.bandeja_ia_sync_runs cascade;
drop table if exists public.bandeja_ia_sync_state cascade;
drop table if exists public.bandeja_ia_pubsub_events cascade;
drop table if exists public.bandeja_ia_audit_log cascade;
drop table if exists public.bandeja_ia_permissions cascade;

drop function if exists public.bandeja_ia_acknowledge_notification(uuid);
drop function if exists public.bandeja_ia_stamp_asunto();
drop function if exists public.bandeja_ia_audit();
drop function if exists public.bandeja_ia_is_admin();
drop function if exists public.bandeja_ia_can_operate();
drop function if exists public.bandeja_ia_has_access();
drop function if exists public.bandeja_ia_current_role();

commit;
