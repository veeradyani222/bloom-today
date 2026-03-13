-- Hierarchical compressed memory for each user.
-- level 0 = one entry per day (upserted each call)
-- level 1 = compressed from 10 level-0 entries
-- level 2 = compressed from 10 level-1 entries
-- Each level compresses when it reaches 10 rows, keeping total rows small.
CREATE TABLE IF NOT EXISTS user_memories (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  level       SMALLINT NOT NULL DEFAULT 0,
  bucket_date DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, level, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
