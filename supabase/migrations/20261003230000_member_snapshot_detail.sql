alter table public.member_snapshots
  add column if not exists quest_points integer not null default 0,
  add column if not exists coins bigint not null default 0,
  add column if not exists is_online boolean not null default false,
  add column if not exists is_premium boolean not null default false,
  add column if not exists boss jsonb not null default '{}'::jsonb,
  add column if not exists event_stats jsonb not null default '{}'::jsonb;

create or replace view public.latest_member_snapshots with (security_invoker = true) as
select distinct on (s.profile_id)
  s.profile_id,
  p.koruxa_name,
  p.display_name,
  s.captured_at,
  s.total_xp,
  s.total_level,
  s.combat_level,
  s.quest_points,
  s.coins,
  s.is_online,
  s.is_premium,
  s.skills,
  s.equipment,
  s.farms,
  s.research_summary,
  s.boss,
  s.event_stats
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
