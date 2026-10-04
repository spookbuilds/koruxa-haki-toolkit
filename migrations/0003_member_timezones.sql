CREATE TABLE IF NOT EXISTS member_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS member_preferences_timezone_idx ON member_preferences(timezone);
