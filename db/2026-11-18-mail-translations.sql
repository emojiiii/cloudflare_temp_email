CREATE TABLE IF NOT EXISTS mail_translations (
    mail_id INTEGER NOT NULL REFERENCES raw_mails(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    target_language TEXT NOT NULL,
    part INTEGER NOT NULL CHECK (part BETWEEN 0 AND 29),
    digest TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (mail_id, scope, target_language, part)
);
