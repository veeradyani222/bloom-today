CREATE TABLE IF NOT EXISTS companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_instructions TEXT DEFAULT '',
  therapist_instructions TEXT DEFAULT '',
  base_prompt TEXT DEFAULT '',
  agent_id TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companions_user_id ON companions (user_id);
