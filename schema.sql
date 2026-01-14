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
-- TENANT SESSION TABLES (for anonymous multi-tenant isolation)
-- ============================================================

-- Tenant sessions for anonymous users
-- Provides data isolation without requiring signup
CREATE TABLE IF NOT EXISTS tenant_sessions (
  id TEXT PRIMARY KEY,                                    -- UUID tenant_id
  user_id TEXT,                                           -- Optional: linked user if authenticated
  quota_tier TEXT DEFAULT 'anonymous' CHECK (quota_tier IN ('anonymous', 'free', 'premium')),
  created_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,                               -- Session expiration (e.g., 30 days)
  metadata TEXT,                                          -- JSON: device info, preferences
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tenant rate limits (separate from user rate limits for anonymous tenants)
CREATE TABLE IF NOT EXISTS tenant_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,
  calls_today INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 5,                          -- anonymous=5, free=30, premium=200
  UNIQUE(tenant_id, date),
  FOREIGN KEY (tenant_id) REFERENCES tenant_sessions(id)
);

-- Inference logs with tenant isolation (for ethical provenance tracking)
CREATE TABLE IF NOT EXISTS inference_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  model_name TEXT NOT NULL,                               -- e.g., 'PleIAs/Pleias-350m-Preview'
  model_version TEXT,                                     -- Version string if available
  adapter TEXT,                                           -- LoRA adapter if used (e.g., 'professional-v2')
  intent TEXT,                                            -- e.g., 'rewrite_clarity', 'answer_question'
  prompt_hash TEXT NOT NULL,                              -- SHA256 of prompt (not raw text for privacy)
  tokens_input INTEGER,
  tokens_output INTEGER,
  latency_ms INTEGER,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenant_sessions(id)
);

-- ============================================================
-- RAG FOUNDATION TABLES (Phase 2)
-- ============================================================

-- Document chunks for RAG retrieval
-- Stores text chunks with metadata, vectors stored in Vectorize
CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,                                    -- UUID for chunk
  tenant_id TEXT NOT NULL,
  manuscript_id TEXT,                                     -- Optional: link to manuscript
  chunk_index INTEGER NOT NULL,                           -- Position in document
  content TEXT NOT NULL,                                  -- Raw text content
  char_start INTEGER NOT NULL,                            -- Start position in original doc
  char_end INTEGER NOT NULL,                              -- End position in original doc
  embedding_id TEXT,                                      -- Reference to Vectorize vector ID
  metadata TEXT,                                          -- JSON: section, chapter, etc.
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenant_sessions(id)
);

-- Style assets for tenant customization
CREATE TABLE IF NOT EXISTS style_assets (
  id TEXT PRIMARY KEY,                                    -- UUID for asset
  tenant_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('style_guide', 'glossary', 'rule', 'character', 'world')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,                                  -- JSON: rules, definitions, etc.
  priority INTEGER DEFAULT 0,                             -- Higher = more important
  active INTEGER DEFAULT 1,                               -- Whether to include in context
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenant_sessions(id)
);

-- Audit jobs for whole-book processing
CREATE TABLE IF NOT EXISTS audit_jobs (
  id TEXT PRIMARY KEY,                                    -- UUID for job
  tenant_id TEXT NOT NULL,
  manuscript_id TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('full_audit', 'style_check', 'consistency', 'grammar')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress INTEGER DEFAULT 0,                             -- 0-100 percentage
  total_chunks INTEGER DEFAULT 0,
  processed_chunks INTEGER DEFAULT 0,
  results TEXT,                                           -- JSON: findings array
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenant_sessions(id)
);

-- Cache for embeddings and completions
CREATE TABLE IF NOT EXISTS cache_entries (
  id TEXT PRIMARY KEY,                                    -- Hash of input
  cache_type TEXT NOT NULL CHECK (cache_type IN ('embedding', 'completion', 'retrieval')),
  tenant_id TEXT,                                         -- Optional: some cache is global
  input_hash TEXT NOT NULL,                               -- SHA256 of input
  output TEXT NOT NULL,                                   -- Cached result (JSON)
  hit_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,                                        -- Optional TTL
  FOREIGN KEY (tenant_id) REFERENCES tenant_sessions(id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_api_logs_user_created ON api_usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_date ON rate_limits(user_id, date);
CREATE INDEX IF NOT EXISTS idx_manuscripts_user ON manuscripts(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_expires ON tenant_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tenant_rate_limits_tenant_date ON tenant_rate_limits(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_inference_logs_tenant ON inference_logs(tenant_id, created_at);

-- RAG indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant ON document_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_manuscript ON document_chunks(manuscript_id);
CREATE INDEX IF NOT EXISTS idx_style_assets_tenant_type ON style_assets(tenant_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_audit_jobs_tenant_status ON audit_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cache_entries_hash ON cache_entries(input_hash);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires ON cache_entries(expires_at);
