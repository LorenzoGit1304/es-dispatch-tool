-- Speeds up queries on user availability
CREATE INDEX idx_users_role_status
ON users(role, status);

-- Speeds up enrollment status lookups
CREATE INDEX idx_enrollments_status
ON enrollments(status);

-- Speeds up checking pending offers & expirations
CREATE INDEX idx_offers_status_expires
ON enrollment_offers(status, expires_at);

-- Speeds up queries by ES
CREATE INDEX idx_offers_es_id
ON enrollment_offers(es_id);