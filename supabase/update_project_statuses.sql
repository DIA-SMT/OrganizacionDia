do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'projects'
      and constraint_name = 'projects_status_check'
  ) then
    alter table public.projects drop constraint projects_status_check;
  end if;
end $$;

update public.projects
set status = case
  when status in ('Backlog', 'Planificacion') then 'Planificación'
  when status = 'En aprobacion' then 'MVP aprobado'
  when status = 'Deployado' then 'En Producción'
  when status = 'Mantenimiento' then 'Pausado'
  else status
end;

alter table public.projects
alter column status set default 'Planificación';

alter table public.projects
add constraint projects_status_check check (
  status in ('Planificación', 'En desarrollo', 'MVP aprobado', 'QA', 'En Producción', 'Pausado')
);
