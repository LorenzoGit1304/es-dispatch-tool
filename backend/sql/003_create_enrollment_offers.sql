CREATE TABLE enrollment_offers (
    id SERIAL PRIMARY KEY,
    enrollment_id INTEGER NOT NULL,
    es_id INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    offered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    responded_at TIMESTAMP NULL,
    CONSTRAINT fk_enrollment
        FOREIGN KEY (enrollment_id)
        REFERENCES enrollments(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_es
        FOREIGN KEY (es_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);