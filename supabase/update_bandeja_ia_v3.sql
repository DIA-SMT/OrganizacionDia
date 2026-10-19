-- Organizacion DIA - Bandeja IA v3 (para bases que ya corrieron add_bandeja_ia.sql y la v2)
--
-- Idempotente: se puede ejecutar varias veces. Correr ANTES de desplegar la version que
-- clasifica los avisos de Supabase (si no, esos asuntos no se pueden guardar).
-- Las instalaciones nuevas no lo necesitan: add_bandeja_ia.sql ya incluye estos cambios.
-- Reversion: supabase/rollback_bandeja_ia.sql borra todo el modulo (incluido esto).
--
-- Cambios:
-- 1) Categoria nueva 'base_pausa': avisos de Supabase de que un proyecto se va a pausar.
-- 2) Reglas con condicion de remitente (from_keywords), para que esa regla solo aplique a
--    correos que vienen de Supabase.

alter table public.bandeja_ia_asuntos drop constraint if exists bandeja_ia_asuntos_category_check;
alter table public.bandeja_ia_asuntos
  add constraint bandeja_ia_asuntos_category_check
  check (category in ('base_pausa', 'invitacion', 'reunion', 'fecha_limite', 'solicitud_respuesta', 'documentacion', 'informativo'));

alter table public.bandeja_ia_rules drop constraint if exists bandeja_ia_rules_category_check;
alter table public.bandeja_ia_rules
  add constraint bandeja_ia_rules_category_check
  check (category in ('base_pausa', 'invitacion', 'reunion', 'fecha_limite', 'solicitud_respuesta', 'documentacion', 'informativo'));

alter table public.bandeja_ia_rules add column if not exists from_keywords text[] not null default '{}';
