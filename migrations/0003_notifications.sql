PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  can_manage_users INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_users IN (0,1)),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO user_permissions (user_id, can_manage_users, updated_at)
SELECT id, 1, datetime('now') FROM users WHERE LOWER(email) = 'ari.imam@daya-motora.com';

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audit_id TEXT REFERENCES audits(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('INFO', 'DEADLINE', 'COMPLETED')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  read_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_active
  ON notifications(user_id, deleted_at, created_at);
