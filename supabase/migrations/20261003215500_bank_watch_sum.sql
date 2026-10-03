create or replace view public.bank_watch_status with (security_invoker = true) as
select
  w.item_key,
  w.display_name,
  w.minimum_qty,
  w.preferred_qty,
  w.show_on_home,
  coalesce(matched.quantity,0) as quantity,
  case
    when coalesce(matched.quantity,0) <= 0 then 'empty'
    when coalesce(matched.quantity,0) < w.minimum_qty then 'critical'
    when w.preferred_qty is not null and coalesce(matched.quantity,0) < w.preferred_qty then 'low'
    else 'healthy'
  end as status
from public.bank_watch_items w
left join public.clan_state c on c.id=1
left join lateral (
  select coalesce(sum((item->>'quantity')::bigint),0)::bigint as quantity
  from jsonb_array_elements(coalesce(c.bank_json->'items','[]'::jsonb)) item
  where item->>'item_key'=w.item_key
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
  ),
  lasts as (
    select distinct on(profile_id,skill_key) profile_id,koruxa_name,skill_key,xp,level,captured_at
    from points order by profile_id,skill_key,captured_at desc
  ),
  baselines_before as (
    select distinct on(profile_id,skill_key) profile_id,skill_key,xp,captured_at
    from points
    where captured_at <= since_at
    order by profile_id,skill_key,captured_at desc
  ),
  baselines_after as (
    select distinct on(profile_id,skill_key) profile_id,skill_key,xp,captured_at
    from points
    where captured_at > since_at
    order by profile_id,skill_key,captured_at asc
  ),
  baselines as (
    select l.profile_id,l.skill_key,
      coalesce(bb.xp,ba.xp) as xp,
      coalesce(bb.captured_at,ba.captured_at) as captured_at
    from lasts l
    left join baselines_before bb using(profile_id,skill_key)
    left join baselines_after ba using(profile_id,skill_key)
  )
  select l.profile_id,l.koruxa_name,l.skill_key,greatest(0,l.xp-b.xp),l.level
  from lasts l join baselines b using(profile_id,skill_key)
  where b.captured_at < l.captured_at
  order by xp_gain desc;
$$;
