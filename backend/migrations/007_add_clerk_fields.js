exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id VARCHAR(255) UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
  `);
};

exports.down = () => {
  // Historical migration kept for compatibility with existing SQL sequence.
  // No-op down avoids dropping columns that may have been created earlier.
};
