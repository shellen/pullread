-- ABOUTME: D1 schema for email subscriber storage.
-- ABOUTME: Tracks download and newsletter signups with CAN-SPAM unsubscribe support.

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('download', 'newsletter')),
  platform TEXT CHECK(platform IN ('apple_silicon', 'intel')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  unsubscribed_at TEXT,
  UNIQUE(email, source)
);
