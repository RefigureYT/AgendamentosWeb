CREATE TABLE
    excel_uploads (
        id SERIAL PRIMARY KEY,
        uuid VARCHAR(36) NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT NOW ()
    );