CREATE TABLE IF NOT EXISTS call_session_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL UNIQUE REFERENCES call_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  analysis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_session_analyses_user_time
  ON call_session_analyses (user_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_session_analyses_user_call
  ON call_session_analyses (user_id, call_session_id);
