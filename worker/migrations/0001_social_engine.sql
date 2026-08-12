-- Ninth House distribution engine, initial schema.
--
-- Generated from worker/src/social/db.js (SCHEMA_SQL). Do not hand edit: change
-- SCHEMA_SQL and regenerate, or the two copies drift and scripts/check-social.mjs
-- fails the build.
--
-- Apply with the CLI:   cd worker && npx wrangler d1 migrations apply ninth-house-social --remote
-- Or from the admin:    Queue tab, Setup, Prepare storage. Same statements, no CLI needed.
CREATE TABLE IF NOT EXISTS ventures (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  site_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  positioning TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  banned_language TEXT NOT NULL DEFAULT '',
  platforms TEXT NOT NULL DEFAULT '[]',
  cadence TEXT NOT NULL DEFAULT '{}',
  category_mix TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  venture TEXT NOT NULL,
  platform TEXT NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  image_url TEXT,
  link TEXT,
  source_article TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_for TEXT,
  posted_at TEXT,
  external_id TEXT,
  error TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_venture ON posts (venture);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts (status, scheduled_for);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  impressions INTEGER,
  engagements INTEGER,
  clicks INTEGER,
  captured_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_post ON metrics (post_id);
CREATE INDEX IF NOT EXISTS idx_metrics_captured ON metrics (captured_at);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_ok TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
