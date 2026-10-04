CREATE TABLE IF NOT EXISTS order_supplier_offers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES order_categories(id) ON DELETE CASCADE,
  offer_key TEXT NOT NULL,
  offer_label TEXT NOT NULL,
  skill_key TEXT,
  min_level INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id, offer_key)
);

CREATE INDEX IF NOT EXISTS order_supplier_offers_category_idx
  ON order_supplier_offers(category_id, offer_key);
