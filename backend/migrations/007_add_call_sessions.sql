-- Call sessions: one row per voice/video call
CREATE TABLE IF NOT EXISTS call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_type VARCHAR(16) NOT NULL CHECK (call_type IN ('voice', 'video')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual transcript messages per call
CREATE TABLE IF NOT EXISTS call_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_user_id ON call_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_user_ended ON call_sessions (user_id, ended_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_call_messages_session_id ON call_messages (call_session_id);
