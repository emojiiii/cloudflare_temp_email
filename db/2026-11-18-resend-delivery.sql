ALTER TABLE sendbox ADD COLUMN resend_email_id TEXT;
ALTER TABLE sendbox ADD COLUMN resend_rejection_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sendbox_resend_email_id
    ON sendbox(resend_email_id) WHERE resend_email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS resend_delivery (
    resend_email_id TEXT PRIMARY KEY NOT NULL,
    delivery_status TEXT NOT NULL,
    delivery_reason TEXT,
    delivery_updated_at TEXT NOT NULL,
    delivery_rank INTEGER NOT NULL
);
