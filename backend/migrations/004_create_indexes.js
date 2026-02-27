exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX idx_users_role_status
    ON users(role, status);

    CREATE INDEX idx_enrollments_status
    ON enrollments(status);

    CREATE INDEX idx_offers_status_expires
    ON enrollment_offers(status, expires_at);

    CREATE INDEX idx_offers_es_id
    ON enrollment_offers(es_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_offers_es_id;
    DROP INDEX IF EXISTS idx_offers_status_expires;
    DROP INDEX IF EXISTS idx_enrollments_status;
    DROP INDEX IF EXISTS idx_users_role_status;
  `);
};
