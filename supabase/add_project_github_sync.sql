-- Alta automatica de proyectos desde los repos de GitHub (app/api/github/sync-projects).
-- Se puede ejecutar varias veces.
--
-- github_repo_id guarda el id numerico del repo principal: identifica al repo aunque se
-- renombre y, al ser unico, evita que dos sincronizaciones simultaneas dupliquen un proyecto.
-- Los NULL no chocan entre si, asi que los proyectos sin repo no se ven afectados.

alter table public.projects
  add column if not exists github_repo_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_github_repo_id_key'
  ) then
    alter table public.projects
      add constraint projects_github_repo_id_key unique (github_repo_id);
  end if;
end;
$$;
