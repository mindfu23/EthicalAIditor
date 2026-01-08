-- EthicalAIditor D1 Database Schema
-- For user auth, rate limiting, and future manuscript sync

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('anonymous', 'free', 'premium')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Daily usage records for quota tracking
CREATE TABLE IF NOT EXISTS daily_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  queries INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- API call logs (granular tracking for analytics)
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  endpoint TEXT,
  tokens_consumed INTEGER DEFAULT 0,
  latency_ms INTEGER,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Rate limit state (for server-side quota management)
-- EthicalAIditor limits: anonymous=5, free=30, premium=200
CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  calls_today INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 30,
  UNIQUE(user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- MANUSCRIPT SYNC TABLES (for future cloud sync)
-- ============================================================

-- Manuscripts (for future cloud sync when users sign up)
CREATE TABLE IF NOT EXISTS manuscripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  manuscript_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT DEFAULT 'txt',
  size INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, manuscript_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Chat history per manuscript (for future sync)
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  manuscript_id TEXT NOT NULL,
  messages TEXT NOT NULL, -- JSON array of messages
  model TEXT,
  mcp TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, manuscript_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sync metadata for multi-device support
CREATE TABLE IF NOT EXISTS sync_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_sync_at INTEGER,
  sync_version INTEGER DEFAULT 1,
  UNIQUE(user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_api_logs_user_created ON api_usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_date ON rate_limits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_manuscripts_user ON manuscripts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
