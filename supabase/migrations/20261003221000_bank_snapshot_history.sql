create table if not exists public.clan_bank_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  item_count integer not null default 0,
  coins bigint not null default 0,
  items jsonb not null default '[]'::jsonb
);
create index if not exists clan_bank_snapshots_time_idx on public.clan_bank_snapshots(captured_at desc);

alter table public.clan_bank_snapshots enable row level security;
drop policy if exists clan_bank_snapshots_read on public.clan_bank_snapshots;
create policy clan_bank_snapshots_read on public.clan_bank_snapshots for select to authenticated using (true);
