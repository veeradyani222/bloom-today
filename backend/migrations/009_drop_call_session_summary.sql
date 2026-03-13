-- Remove call summary persistence from call sessions
ALTER TABLE call_sessions
  DROP COLUMN IF EXISTS summary;
