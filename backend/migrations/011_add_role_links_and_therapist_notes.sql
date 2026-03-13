CREATE TABLE IF NOT EXISTS support_role_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  support_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type VARCHAR(24) NOT NULL CHECK (role_type IN ('therapist', 'trusted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, support_user_id, role_type),
  CHECK (owner_user_id <> support_user_id)
);

CREATE INDEX IF NOT EXISTS idx_support_role_links_owner_role
  ON support_role_links (owner_user_id, role_type);

CREATE INDEX IF NOT EXISTS idx_support_role_links_support_role
  ON support_role_links (support_user_id, role_type);

CREATE TABLE IF NOT EXISTS therapist_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  therapist_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL DEFAULT '',
  companion_instruction TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (owner_user_id <> therapist_user_id)
);

CREATE INDEX IF NOT EXISTS idx_therapist_notes_owner_created
  ON therapist_notes (owner_user_id, created_at DESC);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS therapist_key_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trusted_key_version INTEGER NOT NULL DEFAULT 1;
