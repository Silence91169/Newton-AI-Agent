-- Newton AI Agent — Supabase Schema (auto-register architecture)
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- MIGRATION NOTE: If you have an existing project, run these DROP statements
-- first to remove the old tables, or run this in a fresh project:
--
--   DROP TABLE IF EXISTS runs     CASCADE;
--   DROP TABLE IF EXISTS tasks    CASCADE;
--   DROP TABLE IF EXISTS sessions CASCADE;
--   DROP TABLE IF EXISTS users    CASCADE;

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── users ─────────────────────────────────────────────────────────────────────
-- Auto-created on first solve. newton_user_id comes from the decoded JWT
-- (sub / user_id / id claim). Falls back to sha256 prefix of the Groq key.

CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  newton_user_id   TEXT        NOT NULL UNIQUE,  -- stable identifier from Newton JWT
  email            TEXT,
  username         TEXT,
  groq_api_key_enc TEXT        NOT NULL,         -- AES-256-GCM encrypted, base64url
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── usage_logs ────────────────────────────────────────────────────────────────
-- One row per solve attempt.

CREATE TABLE IF NOT EXISTS usage_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  newton_user_id TEXT        NOT NULL,
  task_type      TEXT        NOT NULL
                             CHECK (task_type IN ('mcq', 'coding', 'assignment')),
  page_url       TEXT,
  success        BOOLEAN,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_newton_user_id      ON users(newton_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_newton_user_id ON usage_logs(newton_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created        ON usage_logs(created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Backend uses the service-role key which bypasses RLS.
-- These deny direct anon/user-role access to either table.

ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
