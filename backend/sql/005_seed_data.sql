-- ES Users
INSERT INTO users (clerk_id, name, email, role, language)
VALUES 
('es_001', 'John ES', 'john.es@test.com', 'ES', 'English'),
('es_002', 'Maria ES', 'maria.es@test.com', 'ES', 'Spanish'),
('es_003', 'Alex ES', 'alex.es@test.com', 'ES', 'English'),
('es_004', 'Laura ES', 'laura.es@test.com', 'ES', 'Spanish');

-- AS Users
INSERT INTO users (clerk_id, name, email, role, language)
VALUES
('as_001', 'Carlos AS', 'carlos.as@test.com', 'AS', 'Spanish'),
('as_002', 'Sofia AS', 'sofia.as@test.com', 'AS', 'English');

-- Admin User
INSERT INTO users (clerk_id, name, email, role, language)
VALUES
('admin_001', 'Head ES', 'head.es@test.com', 'ADMIN', 'English');