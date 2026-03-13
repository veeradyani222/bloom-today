CREATE TABLE IF NOT EXISTS trusted_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trusted_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (owner_user_id <> trusted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_notes_owner_created
  ON trusted_notes (owner_user_id, created_at DESC);
