-- Completa los proyectos con lo que informa GitHub (app/api/github/sync-projects): fecha de
-- inicio, sitio publicado, tecnologias y un resumen del README. Se puede ejecutar varias veces.
--
-- github_filled_at: ya se completaron una vez, desde el listado de repos, la fecha de inicio,
-- el sitio, el lenguaje y la descripcion corta. Un campo que despues alguien vacia a proposito
-- no vuelve a llenarse.
-- github_enriched_at: el README ya se analizo (resumen con IA y tecnologias). Para volver a
-- analizar un proyecto alcanza con ponerlo en null.
-- github_readme_failed_at: el ultimo analisis fallo (GitHub o el modelo); se reintenta despues
-- de unas horas, sin trabar al resto.

alter table public.projects
  add column if not exists github_enriched_at timestamptz;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'github_filled_at'
  ) then
    alter table public.projects add column github_filled_at timestamptz;
    -- Las marcas de analisis anteriores a esta columna las pudo poner una version que marcaba
    -- sin resumen ante un cupo agotado o una falla del modelo: se vuelven a analizar una vez.
    -- No toca descripciones: un resumen ya escrito no se vuelve a pedir.
    update public.projects set github_enriched_at = null where github_enriched_at is not null;
  end if;
end;
$$;

alter table public.projects
  add column if not exists github_readme_failed_at timestamptz;
