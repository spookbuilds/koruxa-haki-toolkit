CREATE TABLE IF NOT EXISTS order_supplier_status (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES order_categories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','busy')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS order_supplier_status_category_idx
  ON order_supplier_status(category_id, status);
