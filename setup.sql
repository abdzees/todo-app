create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('todo', 'note')),
  text text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table items enable row level security;

grant select, insert, update, delete on items to authenticated;

create policy "own items" on items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table items;

alter table items add column position double precision not null default extract(epoch from now());
