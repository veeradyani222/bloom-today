ALTER TABLE users
ADD COLUMN IF NOT EXISTS companion_session_id TEXT;
