create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('owner','officer','member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('open','claimed','in_progress','ready','collected','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  koruxa_character_id bigint unique,
  koruxa_name text,
  app_role public.app_role not null default 'member',
  discord_user_id text,
  active boolean not null default true,
  koruxa_connected boolean not null default false,
  last_koruxa_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.koruxa_tokens (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.member_snapshots (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  captured_at timestamptz not null default now(),
  total_xp bigint not null default 0,
  total_level integer not null default 0,
  combat_level integer not null default 0,
  skills jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  farms jsonb not null default '[]'::jsonb,
  research_summary jsonb not null default '{}'::jsonb
);
create index if not exists member_snapshots_profile_time_idx on public.member_snapshots(profile_id, captured_at desc);

create table if not exists public.member_private_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  research jsonb not null default '{}'::jsonb,
  mastery jsonb not null default '{}'::jsonb,
  clan_bank_budget jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.clan_state (
  id integer primary key default 1 check (id = 1),
  clan_json jsonb not null default '{}'::jsonb,
  bank_json jsonb not null default '{}'::jsonb,
  clan_synced_at timestamptz,
  bank_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_watch_items (
  item_key text primary key,
  display_name text not null,
  minimum_qty bigint not null default 0 check (minimum_qty >= 0),
  preferred_qty bigint check (preferred_qty is null or preferred_qty >= 0),
  show_on_home boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_categories (
  id text primary key,
  label text not null,
  description text,
  discord_channel_id text,
  enabled boolean not null default true,
  sort_order integer not null default 100
);

insert into public.order_categories (id,label,description,sort_order) values
  ('fish','Fish','Raw and cooked fish orders',10),
  ('smithing','Smithing','Bars, tools, armour and weapons',20),
  ('crafting','Crafting','Crafting orders',30),
  ('jewelery','Jewellery','Cut gems, rings and amulets',40),
  ('herblore','Potions','Herblore and potion orders',50),
  ('fletching','Fletching','Bows, arrows and fletching orders',60),
  ('farming','Farming','Seeds and farming-related orders',70),
  ('other','Other','Anything that does not fit another order tab',999)
on conflict (id) do nothing;

create table if not exists public.fulfilment_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category_id text not null references public.order_categories(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, category_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.order_categories(id),
  requester_profile_id uuid not null references public.profiles(id),
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.order_status not null default 'open',
  claimed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists orders_status_category_idx on public.orders(status, category_id, created_at desc);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_actions (
  action_key text primary key,
  skill_key text not null,
  label text not null,
  min_level integer not null default 1,
  duration_ms integer not null default 0,
  xp numeric not null default 0,
  amount numeric not null default 1,
  reward_item_key text not null,
  reward_label text not null,
  image text,
  is_recipe boolean not null default false,
  category text,
  ingredients jsonb,
  reward_stats jsonb,
  unlock_reqs jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists skill_actions_skill_level_idx on public.skill_actions(skill_key, min_level);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create or replace function public.is_app_owner(user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = user_id and app_role = 'owner' and active);
$$;

create or replace function public.is_app_officer(user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = user_id and app_role in ('owner','officer') and active);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.app_role is distinct from new.app_role and not public.is_app_owner(auth.uid()) then
    raise exception 'Only an Owner can change app roles';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role_change on public.profiles;
create trigger guard_profile_role_change before update on public.profiles for each row execute procedure public.guard_profile_role_change();

create or replace function public.claim_initial_owner()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  lock table public.profiles in share row exclusive mode;
  if exists(select 1 from public.profiles where app_role = 'owner') then
    return false;
  end if;
  update public.profiles set app_role = 'owner', updated_at = now() where id = auth.uid();
  return found;
end;
$$;

create or replace function public.set_member_role(target_profile uuid, new_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  old_role public.app_role;
  owner_count integer;
begin
  if not public.is_app_owner(auth.uid()) then raise exception 'Owner access required'; end if;
  select app_role into old_role from public.profiles where id = target_profile for update;
  if old_role is null then raise exception 'Profile not found'; end if;
  if old_role = 'owner' and new_role <> 'owner' then
    select count(*) into owner_count from public.profiles where app_role = 'owner' and active;
    if owner_count <= 1 then raise exception 'The app must always have at least one Owner'; end if;
  end if;
  update public.profiles set app_role = new_role, updated_at = now() where id = target_profile;
end;
$$;

create or replace function public.claim_order(target_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_category text;
  current_status public.order_status;
begin
  select category_id, status into target_category, current_status from public.orders where id = target_order for update;
  if current_status <> 'open' then raise exception 'Order is no longer open'; end if;
  if not public.is_app_officer(auth.uid()) and not exists (
    select 1 from public.fulfilment_permissions where profile_id = auth.uid() and category_id = target_category
  ) then
    raise exception 'You are not approved to fulfil this order category';
  end if;
  update public.orders set status='claimed', claimed_by=auth.uid(), claimed_at=now() where id=target_order;
  insert into public.order_events(order_id,event_type,actor_profile_id) values(target_order,'claimed',auth.uid());
end;
$$;

create or replace function public.mark_order_ready(target_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  assigned uuid;
begin
  select claimed_by into assigned from public.orders where id=target_order for update;
  if assigned is distinct from auth.uid() and not public.is_app_officer(auth.uid()) then raise exception 'Only the assigned fulfiller or an officer can mark this ready'; end if;
  update public.orders set status='ready', ready_at=now() where id=target_order and status in ('claimed','in_progress');
  if not found then raise exception 'Order cannot be marked ready from its current status'; end if;
  insert into public.order_events(order_id,event_type,actor_profile_id) values(target_order,'ready',auth.uid());
end;
$$;

create or replace function public.mark_order_collected(target_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  requester uuid;
begin
  select requester_profile_id into requester from public.orders where id=target_order for update;
  if requester is distinct from auth.uid() and not public.is_app_officer(auth.uid()) then raise exception 'Only the requester or an officer can mark this collected'; end if;
  update public.orders set status='collected', collected_at=now() where id=target_order and status='ready';
  if not found then raise exception 'Order is not ready for collection'; end if;
  insert into public.order_events(order_id,event_type,actor_profile_id) values(target_order,'collected',auth.uid());
end;
$$;

create or replace function public.log_new_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.order_events(order_id,event_type,actor_profile_id) values(new.id,'created',new.requester_profile_id);
  return new;
end;
$$;
drop trigger if exists orders_created_event on public.orders;
create trigger orders_created_event after insert on public.orders for each row execute procedure public.log_new_order();

create or replace view public.latest_member_snapshots with (security_invoker = true) as
select distinct on (s.profile_id)
  s.profile_id, p.koruxa_name, p.display_name, s.captured_at, s.total_xp, s.total_level, s.combat_level,
  s.skills, s.equipment, s.farms, s.research_summary
from public.member_snapshots s
join public.profiles p on p.id=s.profile_id
where p.active
order by s.profile_id, s.captured_at desc;

create or replace view public.skill_leaderboard with (security_invoker = true) as
with expanded as (
  select
    l.profile_id,
    coalesce(l.koruxa_name,l.display_name,'Unknown') as koruxa_name,
    skill->>'skill_key' as skill_key,
    coalesce((skill->>'level')::int,0) as level,
    coalesce((skill->>'xp')::bigint,0) as xp
  from public.latest_member_snapshots l
  cross join lateral jsonb_array_elements(l.skills) skill
)
select *, row_number() over(partition by skill_key order by level desc, xp desc, koruxa_name asc)::int as rank
from expanded;

create or replace view public.bank_watch_status with (security_invoker = true) as
select
  w.item_key,
  w.display_name,
  w.minimum_qty,
  w.preferred_qty,
  w.show_on_home,
  coalesce((matched.item->>'quantity')::bigint,0) as quantity,
  case
    when coalesce((matched.item->>'quantity')::bigint,0) <= 0 then 'empty'
    when coalesce((matched.item->>'quantity')::bigint,0) < w.minimum_qty then 'critical'
    when w.preferred_qty is not null and coalesce((matched.item->>'quantity')::bigint,0) < w.preferred_qty then 'low'
    else 'healthy'
  end as status
from public.bank_watch_items w
left join public.clan_state c on c.id=1
left join lateral (
  select item
  from jsonb_array_elements(coalesce(c.bank_json->'items','[]'::jsonb)) item
  where item->>'item_key'=w.item_key
  limit 1
) matched on true;

create or replace function public.skill_xp_gains(since_at timestamptz)
returns table(profile_id uuid, koruxa_name text, skill_key text, xp_gain bigint, level_now int)
language sql stable security invoker set search_path=public as $$
  with points as (
    select s.profile_id, coalesce(p.koruxa_name,p.display_name,'Unknown') as koruxa_name, s.captured_at,
      skill->>'skill_key' skill_key, (skill->>'xp')::bigint xp, (skill->>'level')::int level
    from public.member_snapshots s
    join public.profiles p on p.id=s.profile_id
    cross join lateral jsonb_array_elements(s.skills) skill
    where s.captured_at >= since_at
  ),
  firsts as (
    select distinct on(profile_id,skill_key) profile_id,skill_key,xp
    from points order by profile_id,skill_key,captured_at asc
  ),
  lasts as (
    select distinct on(profile_id,skill_key) profile_id,koruxa_name,skill_key,xp,level
    from points order by profile_id,skill_key,captured_at desc
  )
  select l.profile_id,l.koruxa_name,l.skill_key,greatest(0,l.xp-f.xp),l.level
  from lasts l join firsts f using(profile_id,skill_key)
  order by xp_gain desc;
$$;

alter table public.profiles enable row level security;
alter table public.koruxa_tokens enable row level security;
alter table public.member_snapshots enable row level security;
alter table public.member_private_state enable row level security;
alter table public.clan_state enable row level security;
alter table public.bank_watch_items enable row level security;
alter table public.order_categories enable row level security;
alter table public.fulfilment_permissions enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.skill_actions enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id=auth.uid());
drop policy if exists profiles_update_self_or_owner on public.profiles;
create policy profiles_update_self_or_owner on public.profiles for update to authenticated using (id=auth.uid() or public.is_app_owner()) with check (id=auth.uid() or public.is_app_owner());

drop policy if exists snapshots_read on public.member_snapshots;
create policy snapshots_read on public.member_snapshots for select to authenticated using (true);

drop policy if exists private_state_self_read on public.member_private_state;
create policy private_state_self_read on public.member_private_state for select to authenticated using (profile_id=auth.uid());

drop policy if exists clan_state_read on public.clan_state;
create policy clan_state_read on public.clan_state for select to authenticated using (true);

drop policy if exists bank_watch_read on public.bank_watch_items;
create policy bank_watch_read on public.bank_watch_items for select to authenticated using (true);
drop policy if exists bank_watch_manage on public.bank_watch_items;
create policy bank_watch_manage on public.bank_watch_items for all to authenticated using (public.is_app_officer()) with check (public.is_app_officer());

drop policy if exists order_categories_read on public.order_categories;
create policy order_categories_read on public.order_categories for select to authenticated using (true);
drop policy if exists order_categories_manage on public.order_categories;
create policy order_categories_manage on public.order_categories for all to authenticated using (public.is_app_officer()) with check (public.is_app_officer());

drop policy if exists fulfilment_read on public.fulfilment_permissions;
create policy fulfilment_read on public.fulfilment_permissions for select to authenticated using (true);
drop policy if exists fulfilment_manage on public.fulfilment_permissions;
create policy fulfilment_manage on public.fulfilment_permissions for all to authenticated using (public.is_app_officer()) with check (public.is_app_officer());

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (true);
drop policy if exists orders_create on public.orders;
create policy orders_create on public.orders for insert to authenticated with check (requester_profile_id=auth.uid() and status='open');

drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events for select to authenticated using (true);

drop policy if exists skill_actions_read on public.skill_actions;
create policy skill_actions_read on public.skill_actions for select to authenticated using (true);
drop policy if exists skill_actions_manage on public.skill_actions;
create policy skill_actions_manage on public.skill_actions for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists app_settings_manage on public.app_settings;
create policy app_settings_manage on public.app_settings for all to authenticated using (public.is_app_owner()) with check (public.is_app_owner());

grant execute on function public.claim_initial_owner() to authenticated;
grant execute on function public.set_member_role(uuid,public.app_role) to authenticated;
grant execute on function public.claim_order(uuid) to authenticated;
grant execute on function public.mark_order_ready(uuid) to authenticated;
grant execute on function public.mark_order_collected(uuid) to authenticated;
grant execute on function public.skill_xp_gains(timestamptz) to authenticated;
