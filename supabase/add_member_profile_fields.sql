alter table public.members
add column if not exists avatar_url text;

alter table public.members
add column if not exists birthday date;

alter table public.members
add column if not exists favorite_food text;

alter table public.members
add column if not exists hobby text;

alter table public.members
add column if not exists favorite_game text;
