exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO users (clerk_id, name, email, role, language)
    VALUES
      ('es_001', 'John ES', 'john.es@test.com', 'ES', 'English'),
      ('es_002', 'Maria ES', 'maria.es@test.com', 'ES', 'Spanish'),
      ('es_003', 'Alex ES', 'alex.es@test.com', 'ES', 'English'),
      ('es_004', 'Laura ES', 'laura.es@test.com', 'ES', 'Spanish');

    INSERT INTO users (clerk_id, name, email, role, language)
    VALUES
      ('as_001', 'Carlos AS', 'carlos.as@test.com', 'AS', 'Spanish'),
      ('as_002', 'Sofia AS', 'sofia.as@test.com', 'AS', 'English');

    INSERT INTO users (clerk_id, name, email, role, language)
    VALUES
      ('admin_001', 'Head ES', 'head.es@test.com', 'ADMIN', 'English');
  `);
};

exports.down = (pgm) => {
  pgm.sql("DELETE FROM users WHERE clerk_id = ANY(ARRAY['es_001','es_002','es_003','es_004','as_001','as_002','admin_001']);");
};
