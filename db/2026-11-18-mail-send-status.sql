ALTER TABLE raw_mails ADD COLUMN is_replied INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sendbox ADD COLUMN send_status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (send_status IN ('accepted', 'failed', 'unknown'));

WITH replies AS (
    SELECT address, json_extract(CASE WHEN json_valid(raw) THEN raw END, '$.in_reply_to') AS message_id
    FROM sendbox
    WHERE send_status = 'accepted'
)
UPDATE raw_mails
SET is_replied = 1
FROM replies
WHERE raw_mails.address = replies.address
    AND substr(replies.message_id, 1, 1) = '<'
    AND substr(replies.message_id, -1) = '>'
    AND raw_mails.message_id IN (replies.message_id, substr(replies.message_id, 2, length(replies.message_id) - 2));
