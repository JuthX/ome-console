// Console-owned state (PRD §8). Created empty in Sprint 2; each table is
// populated by the sprint that builds its feature (noted per table below).
// OME itself is never the source of truth for any of this — everything
// here is either desired state the reconciler re-applies, or console-only
// bookkeeping that has no OME equivalent.
//
// A plain TS string (not a loose .sql file) so Next.js's standalone output
// tracing doesn't need to know about a non-JS asset at runtime.
export const SCHEMA_SQL = `
-- Sprint 8a: real users, replacing the single CONSOLE_ADMIN_USER/
-- CONSOLE_ADMIN_PASSWORD_HASH env-var login. role is baked into the signed
-- session token at login (src/auth/session.ts) rather than looked up fresh
-- on every request, so src/proxy.ts's role checks stay Edge-runtime
-- compatible (better-sqlite3 is Node-only) — a role change takes effect on
-- that user's next login, a documented tradeoff, not a bug.
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL, -- viewer | operator | engineer
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at  TEXT
);

-- Multi-server registry. Single-server UI until Sprint 8b, but the table
-- supports more than one row from the start (PRD §5, §9).
CREATE TABLE IF NOT EXISTS servers (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  name                   TEXT NOT NULL,
  api_base_url           TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  version                TEXT,
  last_seen_at           TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 5: desired push tasks, reconciled onto OME on boot/reconnect/30s.
CREATE TABLE IF NOT EXISTS desired_push_tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vhost        TEXT NOT NULL,
  app          TEXT NOT NULL,
  stream_name  TEXT NOT NULL,
  config       TEXT NOT NULL, -- JSON: protocol, url, key, variant selection
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 5: desired record tasks, same reconciliation as above.
CREATE TABLE IF NOT EXISTS desired_record_tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vhost        TEXT NOT NULL,
  app          TEXT NOT NULL,
  stream_name  TEXT NOT NULL,
  config       TEXT NOT NULL, -- JSON: tracks, segment interval/schedule, path template
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 4: push destination templates with keys, reused across streams.
CREATE TABLE IF NOT EXISTS push_presets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  protocol     TEXT NOT NULL, -- rtmp | srt | mpegts
  url_template TEXT NOT NULL,
  stream_key   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- UI sweep: publish-key templates (protocol + a relative expiry duration) —
-- holder and stream name are always per-use, not saved, since they're never
-- reused across events the way protocol/expiry conventions are.
CREATE TABLE IF NOT EXISTS key_presets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  protocol          TEXT NOT NULL, -- rtmp | srt
  expires_in_hours  INTEGER, -- NULL = no expiry
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 7: publish keys / device links, enforced via the console's own
-- admission webhook.
CREATE TABLE IF NOT EXISTS keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_name   TEXT NOT NULL,
  protocol      TEXT NOT NULL,
  holder        TEXT NOT NULL, -- device/person label
  expires_at    TEXT,
  revoked       INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 7: signed viewer links with expiry.
CREATE TABLE IF NOT EXISTS viewer_links (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_name  TEXT NOT NULL,
  protocol     TEXT NOT NULL, -- webrtc | llhls | srt
  url          TEXT NOT NULL,
  expires_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 7: alert rule -> notification channel routing.
CREATE TABLE IF NOT EXISTS alert_routes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name    TEXT NOT NULL,
  channel      TEXT NOT NULL, -- slack | sms | email
  target       TEXT NOT NULL, -- webhook URL, phone number, or address
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sprint 8: multiviewer layout/labels. Single global row until per-user
-- (Sprint 8's real users table) makes "owner" meaningful.
CREATE TABLE IF NOT EXISTS layouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  layout_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every write the console makes, from Sprint 3 onward, plus the admission
-- webhook's allow/deny log (Sprint 7).
CREATE TABLE IF NOT EXISTS audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor        TEXT NOT NULL, -- the logged-in username (Sprint 8a: users.username)
  action       TEXT NOT NULL,
  target       TEXT,
  detail       TEXT, -- JSON
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
