-- Align schema with route logic and enforce valid status values.

ALTER TABLE enrollments
ADD COLUMN IF NOT EXISTS assigned_es_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
ADD CONSTRAINT users_status_check
CHECK (status IN ('AVAILABLE', 'BUSY', 'UNAVAILABLE'));

ALTER TABLE enrollment_offers
ADD CONSTRAINT enrollment_offers_status_check
CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'));

CREATE INDEX IF NOT EXISTS idx_enrollments_assigned_es_id
ON enrollments(assigned_es_id);
