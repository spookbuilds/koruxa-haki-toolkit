insert into public.order_categories (id,label,description,sort_order) values
  ('ore-gems','Ore & Gems','Ore and uncut gem market orders',5)
on conflict (id) do update set
  label=excluded.label,
  description=excluded.description,
  sort_order=excluded.sort_order;
