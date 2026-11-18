CREATE TABLE IF NOT EXISTS admin_sender_preferences (
    owner TEXT NOT NULL,
    address TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    PRIMARY KEY (owner, address)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sender_preferences_default
    ON admin_sender_preferences (owner) WHERE is_default = 1;
