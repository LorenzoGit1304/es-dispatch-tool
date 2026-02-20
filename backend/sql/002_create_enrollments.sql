CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    premise_id VARCHAR(100) NOT NULL,
    requested_by INTEGER NOT NULL,
    timeslot VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'WAITING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_requested_by
        FOREIGN KEY (requested_by)
        REFERENCES users(id)
        ON DELETE CASCADE
);