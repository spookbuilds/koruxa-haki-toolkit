create table if not exists public.member_modifiers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('server','food','potion','farm','other')),
  label text not null,
  xp_pct numeric not null default 0,
  speed_pct numeric not null default 0,
  yield_pct numeric not null default 0,
  material_save_pct numeric not null default 0,
  output_mult numeric not null default 1 check (output_mult > 0),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists member_modifiers_profile_active_idx on public.member_modifiers(profile_id, active);

alter table public.member_modifiers enable row level security;
drop policy if exists member_modifiers_self on public.member_modifiers;
create policy member_modifiers_self on public.member_modifiers
for all to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists profiles_update_self_or_owner on public.profiles;
drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles
for update to authenticated
using (public.is_app_owner())
with check (public.is_app_owner());

create or replace function public.set_my_discord_user_id(new_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := nullif(btrim(coalesce(new_id,'')), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if cleaned is not null and cleaned !~ '^[0-9]{15,22}$' then
    raise exception 'Discord user ID must be a numeric ID';
  end if;
  update public.profiles
  set discord_user_id = cleaned, updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.set_my_discord_user_id(text) to authenticated;

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.app_role is distinct from new.app_role then
    if public.is_app_owner(auth.uid()) then
      return new;
    end if;

    if old.id = auth.uid()
      and new.app_role = 'owner'
      and not exists(select 1 from public.profiles where app_role = 'owner' and active)
    then
      return new;
    end if;

    raise exception 'Only an Owner can change app roles';
  end if;
  return new;
end;
$$;
