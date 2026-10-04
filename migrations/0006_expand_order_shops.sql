INSERT OR IGNORE INTO order_categories
  (id,label,description,discord_channel_id,enabled,sort_order)
VALUES
  ('logs-seeds','Logs & Seeds','Woodcutting logs and seed supplies',NULL,1,25),
  ('thieving','Thieving Supplies','Items sourced from Thieving nodes',NULL,1,75),
  ('construction','Construction','Construction crafts and materials',NULL,1,80),
  ('tinkering','Tinkering','Tinkering crafts and devices',NULL,1,85),
  ('combat','Combat Drops','Drops from monsters suppliers are willing to farm',NULL,1,90);

UPDATE order_categories
SET label='Cooking & Fish',
    description='Cooked fish and non-fish Cooking orders'
WHERE id='fish';

CREATE TABLE IF NOT EXISTS combat_supplier_monsters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monster_key TEXT NOT NULL,
  monster_name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, monster_key)
);

CREATE INDEX IF NOT EXISTS combat_supplier_monsters_monster_idx
  ON combat_supplier_monsters(monster_key);

CREATE TABLE IF NOT EXISTS combat_monster_cache (
  monster_key TEXT PRIMARY KEY,
  monster_name TEXT NOT NULL,
  area TEXT,
  combat_level INTEGER,
  monster_type TEXT,
  slayer_only INTEGER NOT NULL DEFAULT 0,
  drops_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
