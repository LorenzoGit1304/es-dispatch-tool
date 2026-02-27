exports.up = (pgm) => {
  pgm.sql(`
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
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_enrollments_assigned_es_id;
    ALTER TABLE enrollment_offers DROP CONSTRAINT IF EXISTS enrollment_offers_status_check;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
    ALTER TABLE enrollments DROP COLUMN IF EXISTS assigned_es_id;
  `);
};
