-- Newton AI Agent — Full Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  email               TEXT        UNIQUE,
  -- Newton portal login (AES-256-GCM encrypted, stored as base64)
  portal_username     TEXT        NOT NULL UNIQUE,
  portal_password_enc TEXT        NOT NULL,
  -- LLM config
  llm_provider        TEXT        NOT NULL DEFAULT 'anthropic'
                                  CHECK (llm_provider IN ('anthropic', 'openai', 'gemini')),
  llm_api_key_enc     TEXT        NOT NULL,
  -- Extension auth token (prefix naa_)
  api_token           TEXT        NOT NULL UNIQUE
                                  DEFAULT 'naa_' || encode(gen_random_bytes(32), 'hex'),
  -- Optional Telegram chat ID for notifications
  telegram_chat_id    TEXT,
  enabled             BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One browser session cookie store per user (upsert on refresh)
CREATE TABLE IF NOT EXISTS sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cookies        JSONB       NOT NULL DEFAULT '[]',
  last_refreshed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_type       TEXT        NOT NULL
                              CHECK (task_type IN ('mcq', 'coding', 'assignment')),
  title           TEXT        NOT NULL,
  url             TEXT,
  course_hash     TEXT,
  assessment_hash TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'solving', 'solved', 'failed', 'skipped')),
  score           TEXT,
  error_message   TEXT,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per LLM call / retry attempt
CREATE TABLE IF NOT EXISTS runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt       INTEGER     NOT NULL DEFAULT 1,
  prompt        TEXT        NOT NULL,
  response      TEXT,
  success       BOOLEAN,
  error_message TEXT,
  tokens_used   INTEGER,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_user_id     ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_detected    ON tasks(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_type        ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_runs_task_id      ON runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_user_id      ON runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_created      ON runs(created_at DESC);

-- ── updated_at auto-trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ── user_stats view ───────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW user_stats AS
SELECT
  u.id           AS user_id,
  u.name,
  u.enabled,
  u.llm_provider,
  u.created_at,
  COUNT(t.id)                                                    AS total_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'solved')                 AS total_solved,
  COUNT(t.id) FILTER (WHERE t.status = 'failed')                 AS total_failed,
  COUNT(t.id) FILTER (WHERE t.status = 'pending')                AS total_pending,
  COUNT(t.id) FILTER (WHERE t.status = 'solving')                AS total_solving,
  ROUND(
    COUNT(t.id) FILTER (WHERE t.status = 'solved')::NUMERIC /
    NULLIF(
      COUNT(t.id) FILTER (WHERE t.status IN ('solved', 'failed')), 0
    ) * 100,
    1
  )                                                              AS success_rate,
  COUNT(t.id) FILTER (WHERE t.task_type = 'mcq')                AS mcq_count,
  COUNT(t.id) FILTER (WHERE t.task_type = 'coding')             AS coding_count,
  COUNT(t.id) FILTER (WHERE t.task_type = 'assignment')         AS assignment_count,
  COUNT(t.id) FILTER (
    WHERE t.status = 'solved'
    AND   t.detected_at >= NOW() - INTERVAL '24 hours'
  )                                                              AS solved_today,
  MAX(t.completed_at)                                            AS last_solved_at
FROM users u
LEFT JOIN tasks t ON t.user_id = u.id
GROUP BY u.id, u.name, u.enabled, u.llm_provider, u.created_at;

-- ── Row Level Security ────────────────────────────────────────────────────────
-- The backend uses the service-role key, which bypasses RLS entirely.
-- These policies protect against any direct anon/user-role access.

ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs     ENABLE ROW LEVEL SECURITY;

-- Drop & recreate so the script is idempotent
DO $$ BEGIN
  DROP POLICY IF EXISTS "users_self"    ON users;
  DROP POLICY IF EXISTS "sessions_own"  ON sessions;
  DROP POLICY IF EXISTS "tasks_own"     ON tasks;
  DROP POLICY IF EXISTS "runs_own"      ON runs;
END $$;

CREATE POLICY "users_self"   ON users    FOR ALL USING (id = auth.uid());
CREATE POLICY "sessions_own" ON sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "tasks_own"    ON tasks    FOR ALL USING (user_id = auth.uid());
CREATE POLICY "runs_own"     ON runs     FOR ALL USING (user_id = auth.uid());
