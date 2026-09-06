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

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- What was rejected. Deliberately not constrained to posts: the same table
  -- carries a rejected docket item, a rejected prospect, a rejected scoring
  -- change or a rejected facts sheet correction, because the owner's reason is
  -- worth the same in every case and a second parallel store would guarantee
  -- one of them gets forgotten.
  item_kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  -- Who wrote the thing. This is the whole point: a reason filed against an
  -- item teaches nobody, a reason filed against the persona that wrote it is
  -- read back before that persona writes for the same venture again.
  persona TEXT,
  venture TEXT,
  category TEXT,
  verdict TEXT NOT NULL DEFAULT 'rejected',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_persona ON feedback (persona, venture);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);

CREATE TABLE IF NOT EXISTS venture_facts (
  venture TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  -- Where the value came from, so a number in a deliverable can be traced back
  -- to the page that stated it rather than to whoever last remembered it.
  source_url TEXT NOT NULL DEFAULT '',
  -- When this entry was last checked against that source. Updated on every
  -- check, whether or not the value moved, because "checked today and
  -- unchanged" and "not checked since June" are different things.
  verified_at TEXT NOT NULL,
  -- When the value itself last moved, which is what the change trigger reads.
  updated_at TEXT NOT NULL,
  PRIMARY KEY (venture, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_facts_verified ON venture_facts (verified_at);

CREATE TABLE IF NOT EXISTS fact_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venture TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  noticed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fact_changes_noticed ON fact_changes (noticed_at);

CREATE TABLE IF NOT EXISTS reference_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_type TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Held verbatim. The register and the structure are the standard, and a
  -- summary of a register is not a register.
  body TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reference_type ON reference_examples (campaign_type);

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  venture TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'need_led',
  organisation TEXT NOT NULL,
  -- The named human and the route to them. A prospect with no named human is
  -- not reachable and scores accordingly.
  contacts TEXT NOT NULL DEFAULT '[]',
  locale TEXT NOT NULL DEFAULT '',
  -- The three things Section 4 requires before anything is written: what they
  -- do, what is missing, why now. Nothing is written until all three are here.
  research TEXT NOT NULL DEFAULT '{}',
  -- Why the score is what it is, kept beside it. A score with no reasoning
  -- cannot be argued with, and the owner's rejections need something to correct.
  evidence TEXT NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'researching',
  notes TEXT NOT NULL DEFAULT '',
  -- Set the moment a draft attempt fails a hard gate or a standing rule, and
  -- cleared the moment one succeeds. A prospect with this set is never a
  -- message: it sits in the needs-research list until the gap it names is
  -- closed, rather than reaching the owner looking finished.
  last_blocker TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prospects_venture ON prospects (venture, status);
CREATE INDEX IF NOT EXISTS idx_prospects_org ON prospects (organisation);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  venture TEXT NOT NULL,
  campaign_type TEXT NOT NULL,
  identity TEXT NOT NULL DEFAULT '',
  to_addresses TEXT NOT NULL DEFAULT '',
  cc_addresses TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  -- The owner's own wording for whatever was corrected, kept beside the
  -- version that obeys the house rules, so an automatic correction is visible
  -- rather than silent. Currently a subject line whose em dash was resolved.
  original_wording TEXT NOT NULL DEFAULT '',
  locale_note TEXT NOT NULL DEFAULT '',
  -- The City Pin offer, kept on the message rather than only on the prospect,
  -- because what was offered is a property of what was sent and has to stay
  -- readable after the prospect record moves on.
  city TEXT NOT NULL DEFAULT '',
  vertical TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  price_usd INTEGER NOT NULL DEFAULT 0,
  rule_findings TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  send_after TEXT,
  sent_at TEXT,
  -- Set by hand, the same as sent_at: there is no inbound mail rail here
  -- either, so a reply is recorded when the owner says one arrived. Null
  -- means either never sent or sent and not yet replied to.
  replied_at TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'email',
  form_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON outreach_messages (status, send_after);

-- Who signs a venture's outreach, set from the desk rather than hardcoded
-- anywhere in a template. A message with nobody named in it is not from a
-- legacy business, it is from a machine, so composing a draft for a venture
-- with no row here is refused rather than left to sign itself "the house".
CREATE TABLE IF NOT EXISTS outreach_owners (
  venture TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exclusives (
  -- One exclusive per vertical per city, enforced by the key rather than by
  -- remembering. The 790 SKU is worth nothing the first time it is sold twice.
  city TEXT NOT NULL,
  vertical TEXT NOT NULL,
  prospect_id TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  sold_at TEXT NOT NULL,
  PRIMARY KEY (city, vertical)
);

CREATE TABLE IF NOT EXISTS city_register (
  id TEXT PRIMARY KEY,
  venture TEXT NOT NULL DEFAULT 'glotemp',
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  organisation TEXT NOT NULL DEFAULT '',
  vertical TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  wave INTEGER NOT NULL DEFAULT 0,
  food_url TEXT NOT NULL DEFAULT '',
  pulse_url TEXT NOT NULL DEFAULT '',
  dmo_contact TEXT NOT NULL DEFAULT '',
  operator_email_if_public TEXT NOT NULL DEFAULT '',
  resolved_contact_email TEXT NOT NULL DEFAULT '',
  contact_source TEXT NOT NULL DEFAULT '',
  route_type TEXT NOT NULL DEFAULT '',
  form_url TEXT NOT NULL DEFAULT '',
  url_check_ok INTEGER NOT NULL DEFAULT 0,
  url_check_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_register_wave ON city_register (wave, status);
CREATE INDEX IF NOT EXISTS idx_register_city ON city_register (city);

CREATE TABLE IF NOT EXISTS rival_locks (
  city TEXT PRIMARY KEY,
  locked INTEGER NOT NULL DEFAULT 1,
  released_at TEXT,
  released_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_slots (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  vertical TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notified_expiring INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_live_slots_status ON live_slots (status, window_end);
