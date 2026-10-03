PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  discord_username TEXT NOT NULL,
  discord_global_name TEXT,
  discord_avatar TEXT,
  display_name TEXT,
  app_role TEXT NOT NULL DEFAULT 'member' CHECK (app_role IN ('owner','officer','member')),
  koruxa_character_id INTEGER UNIQUE,
  koruxa_name TEXT,
  koruxa_connected INTEGER NOT NULL DEFAULT 0,
  clan_verified INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_koruxa_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS koruxa_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  total_xp INTEGER NOT NULL DEFAULT 0,
  total_level INTEGER NOT NULL DEFAULT 0,
  combat_level INTEGER NOT NULL DEFAULT 0,
  quest_points INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  is_online INTEGER NOT NULL DEFAULT 0,
  is_premium INTEGER NOT NULL DEFAULT 0,
  rank_badge TEXT,
  skills_json TEXT NOT NULL DEFAULT '[]',
  equipment_json TEXT NOT NULL DEFAULT '[]',
  farms_json TEXT NOT NULL DEFAULT '[]',
  research_summary_json TEXT NOT NULL DEFAULT '{}',
  boss_json TEXT NOT NULL DEFAULT '{}',
  event_stats_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS member_snapshots_user_time_idx ON member_snapshots(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS member_snapshots_time_idx ON member_snapshots(captured_at DESC);

CREATE TABLE IF NOT EXISTS member_private_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  research_json TEXT NOT NULL DEFAULT '{}',
  mastery_json TEXT NOT NULL DEFAULT '{}',
  clan_bank_budget_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clan_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  clan_json TEXT NOT NULL DEFAULT '{}',
  bank_json TEXT NOT NULL DEFAULT '{}',
  clan_synced_at TEXT,
  bank_synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clan_bank_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS clan_bank_snapshots_time_idx ON clan_bank_snapshots(captured_at DESC);

CREATE TABLE IF NOT EXISTS bank_watch_items (
  item_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  minimum_qty INTEGER NOT NULL DEFAULT 0,
  preferred_qty INTEGER,
  show_on_home INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  discord_channel_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100
);

INSERT OR IGNORE INTO order_categories (id,label,description,sort_order) VALUES
  ('ore-gems','Ore & Gems','Ore and uncut gem market orders',5),
  ('fish','Fish','Raw and cooked fish orders',10),
  ('smithing','Smithing','Bars, tools, armour and weapons',20),
  ('crafting','Crafting','Crafting orders',30),
  ('jewelery','Jewellery','Cut gems, rings and amulets',40),
  ('herblore','Potions','Herblore and potion orders',50),
  ('fletching','Fletching','Bows, arrows and fletching orders',60),
  ('farming','Farming','Seeds and farming-related orders',70),
  ('other','Other','Anything that does not fit another order tab',999);

CREATE TABLE IF NOT EXISTS fulfilment_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES order_categories(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES order_categories(id),
  requester_user_id TEXT NOT NULL REFERENCES users(id),
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','in_progress','ready','collected','cancelled')),
  claimed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  ready_at TEXT,
  collected_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_status_category_idx ON orders(status, category_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_actions (
  action_key TEXT PRIMARY KEY,
  skill_key TEXT NOT NULL,
  label TEXT NOT NULL,
  min_level INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  xp REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 1,
  reward_item_key TEXT NOT NULL,
  reward_label TEXT NOT NULL,
  image TEXT,
  is_recipe INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  ingredients_json TEXT,
  reward_stats_json TEXT,
  unlock_reqs_json TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS skill_actions_skill_level_idx ON skill_actions(skill_key, min_level);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_modifiers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('server','food','potion','farm','firepit','clan','event','other')),
  label TEXT NOT NULL,
  xp_pct REAL NOT NULL DEFAULT 0,
  speed_pct REAL NOT NULL DEFAULT 0,
  yield_pct REAL NOT NULL DEFAULT 0,
  material_save_pct REAL NOT NULL DEFAULT 0,
  output_mult REAL NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_modifiers_user_active_idx ON member_modifiers(user_id, active);
