create table if not exists public.expedientes (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  name text not null,
  summary text not null default '',
  drive_url text not null,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  drive_created_at timestamptz not null,
  drive_modified_at timestamptz not null,
  detected_at timestamptz not null default now(),
  status text not null default 'Nuevo' check (status in ('Nuevo', 'Leído', 'En revisión', 'Archivado')),
  priority text not null default 'Media' check (priority in ('Alta', 'Media', 'Baja')),
  brief_generated_at timestamptz,
  brief_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expedientes
  add column if not exists priority text not null default 'Media';

alter table public.expedientes
  add column if not exists brief_generated_at timestamptz;

alter table public.expedientes
  add column if not exists brief_error text;

update public.expedientes
set brief_error = null
where brief_error like 'No endpoints found for google/gemini%'
   or brief_error like 'Setting up fake worker failed%';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expedientes_priority_check'
  ) then
    alter table public.expedientes
      add constraint expedientes_priority_check
      check (priority in ('Alta', 'Media', 'Baja'));
  end if;
end $$;

alter table public.expedientes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'expedientes'
      and policyname = 'Authenticated users can read expedientes'
  ) then
    create policy "Authenticated users can read expedientes"
      on public.expedientes for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'expedientes'
      and policyname = 'Authenticated users can update expedientes'
  ) then
    create policy "Authenticated users can update expedientes"
      on public.expedientes for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

create index if not exists expedientes_drive_created_at_idx on public.expedientes (drive_created_at desc);
create index if not exists expedientes_status_idx on public.expedientes (status);
create index if not exists expedientes_priority_idx on public.expedientes (priority);
