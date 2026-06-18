ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_dashboard_role VARCHAR(24);

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_preferred_dashboard_role_check;

ALTER TABLE users
ADD CONSTRAINT users_preferred_dashboard_role_check
CHECK (preferred_dashboard_role IN ('mom', 'therapist', 'trusted'));
