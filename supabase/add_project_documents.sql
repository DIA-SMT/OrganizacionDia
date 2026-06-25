insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-pdfs', 'project-pdfs', true, 10485760, array['application/pdf'])
on conflict (id) do update
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf'];

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  storage_path text,
  mime_type text not null default 'application/pdf',
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.project_documents enable row level security;

drop policy if exists "authenticated read project documents" on public.project_documents;
drop policy if exists "authenticated write project documents" on public.project_documents;

create policy "authenticated read project documents"
on public.project_documents for select
to authenticated
using (true);

create policy "authenticated write project documents"
on public.project_documents for all
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated read project pdfs" on storage.objects;
drop policy if exists "authenticated write project pdfs" on storage.objects;

create policy "authenticated read project pdfs"
on storage.objects for select
to authenticated
using (bucket_id = 'project-pdfs');

create policy "authenticated write project pdfs"
on storage.objects for all
to authenticated
using (bucket_id = 'project-pdfs')
with check (bucket_id = 'project-pdfs');

create index if not exists project_documents_project_id_idx
on public.project_documents(project_id);
