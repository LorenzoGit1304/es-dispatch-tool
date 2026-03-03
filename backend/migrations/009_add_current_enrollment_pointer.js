exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS current_enrollment_id INTEGER
    REFERENCES enrollments(id)
    ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_users_current_enrollment_id
    ON users(current_enrollment_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_users_current_enrollment_id;
    ALTER TABLE users DROP COLUMN IF EXISTS current_enrollment_id;
  `);
};
