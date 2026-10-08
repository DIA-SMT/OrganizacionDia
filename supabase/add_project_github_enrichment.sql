-- Completa los proyectos con lo que informa GitHub (app/api/github/sync-projects): fecha de
-- inicio, sitio publicado, tecnologias y un resumen del README. Se puede ejecutar varias veces.
--
-- github_enriched_at marca que el proyecto ya se analizo: cada uno se procesa una sola vez,
-- asi el resumen con IA no se vuelve a pedir en cada sincronizacion. Para volver a
-- analizar un proyecto alcanza con ponerlo en null.

alter table public.projects
  add column if not exists github_enriched_at timestamptz;
