CREATE TABLE IF NOT EXISTS order_discord_state (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
