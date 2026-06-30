create table if not exists public.keep_alive (
  id smallint primary key default 1 check (id = 1),
  created_at timestamptz not null default now()
);

insert into public.keep_alive (id)
values (1)
on conflict (id) do nothing;

alter table public.keep_alive enable row level security;

drop policy if exists "public can read keep alive" on public.keep_alive;

create policy "public can read keep alive"
on public.keep_alive
for select
to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant select on table public.keep_alive to anon, authenticated;
