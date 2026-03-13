CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  companion_name TEXT,
  companion_instructions TEXT,
  companion_agent_id TEXT,
  companion_session_id TEXT,
  share_key VARCHAR(16) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_type VARCHAR(24) NOT NULL CHECK (connection_type IN ('therapist', 'trusted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, target_user_id, connection_type),
  CHECK (owner_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_owner_type ON connections (owner_user_id, connection_type);
CREATE INDEX IF NOT EXISTS idx_connections_target_type ON connections (target_user_id, connection_type);
