alter table public.projects
add column if not exists progress integer not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'projects'
      and constraint_name = 'projects_progress_check'
  ) then
    alter table public.projects drop constraint projects_progress_check;
  end if;
end $$;

alter table public.projects
add constraint projects_progress_check check (progress >= 0 and progress <= 100);
