CREATE TABLE IF NOT EXISTS provider_credentials (
    scope TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('deepseek', 'resend')),
    identifier TEXT NOT NULL DEFAULT '',
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    encrypted_api_key TEXT NOT NULL,
    PRIMARY KEY (scope, provider, identifier)
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_user_id ON provider_credentials (user_id);
