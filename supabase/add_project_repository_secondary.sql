alter table public.projects
add column if not exists repository_url_secondary text;
