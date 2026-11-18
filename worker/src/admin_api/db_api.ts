import { Context } from "hono";
import { CONSTANTS } from "../constants";
import utils from "../utils";
import { compareVersions } from "../utils/version";

const DB_INIT_QUERIES = `
CREATE TABLE IF NOT EXISTS raw_mails (
    id INTEGER PRIMARY KEY,
    message_id TEXT,
    source TEXT,
    address TEXT,
    raw TEXT,
    raw_blob BLOB,
    metadata TEXT,
    is_unread INTEGER,
    is_replied INTEGER NOT NULL DEFAULT 0,
    search_sender TEXT,
    search_subject TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_mails_address ON raw_mails(address);

CREATE INDEX IF NOT EXISTS idx_raw_mails_created_at ON raw_mails(created_at);

CREATE INDEX IF NOT EXISTS idx_raw_mails_message_id ON raw_mails(message_id);

CREATE INDEX IF NOT EXISTS idx_raw_mails_cleanup_unknown ON raw_mails(created_at, id, address);

CREATE INDEX IF NOT EXISTS idx_raw_mails_source_domain_created_at ON raw_mails(lower(trim(substr(source, instr(source, '@') + 1), ' <>')), created_at, id);

CREATE TABLE IF NOT EXISTS mail_translations (
    mail_id INTEGER NOT NULL REFERENCES raw_mails(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    target_language TEXT NOT NULL,
    part INTEGER NOT NULL CHECK (part BETWEEN 0 AND 29),
    digest TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (mail_id, scope, target_language, part)
);

CREATE TABLE IF NOT EXISTS address (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    password TEXT,
    source_meta TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_address_name ON address(name);

CREATE INDEX IF NOT EXISTS idx_address_created_at ON address(created_at);

CREATE INDEX IF NOT EXISTS idx_address_updated_at ON address(updated_at);

CREATE INDEX IF NOT EXISTS idx_address_source_meta ON address(source_meta);

CREATE TABLE IF NOT EXISTS auto_reply_mails (
    id INTEGER PRIMARY KEY,
    source_prefix TEXT,
    name TEXT,
    address TEXT UNIQUE,
    subject TEXT,
    message TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_mails_address ON auto_reply_mails(address);

CREATE TABLE IF NOT EXISTS address_sender (
    id INTEGER PRIMARY KEY,
    address TEXT UNIQUE,
    balance INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_address_sender_address ON address_sender(address);

CREATE TABLE IF NOT EXISTS sendbox (
    id INTEGER PRIMARY KEY,
    address TEXT,
    raw TEXT,
    send_status TEXT NOT NULL DEFAULT 'accepted' CHECK (send_status IN ('accepted', 'failed', 'unknown')),
    resend_email_id TEXT,
    resend_rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sendbox_address ON sendbox(address);
CREATE INDEX IF NOT EXISTS idx_sendbox_created_at ON sendbox(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sendbox_resend_email_id ON sendbox(resend_email_id) WHERE resend_email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS resend_delivery (
    resend_email_id TEXT PRIMARY KEY NOT NULL,
    delivery_status TEXT NOT NULL,
    delivery_reason TEXT,
    delivery_updated_at TEXT NOT NULL,
    delivery_rank INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    user_email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    user_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_user_email ON users(user_email);

CREATE TABLE IF NOT EXISTS provider_credentials (
    scope TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('deepseek', 'resend')),
    identifier TEXT NOT NULL DEFAULT '',
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    encrypted_api_key TEXT NOT NULL,
    PRIMARY KEY (scope, provider, identifier)
);

CREATE INDEX IF NOT EXISTS idx_provider_credentials_user_id ON provider_credentials (user_id);

CREATE TABLE IF NOT EXISTS users_address (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    address_id INTEGER UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_address_user_id ON users_address(user_id);

CREATE INDEX IF NOT EXISTS idx_users_address_address_id ON users_address(address_id);

CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
    role_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

CREATE TABLE IF NOT EXISTS user_passkeys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    passkey_name TEXT NOT NULL,
    passkey_id TEXT NOT NULL,
    passkey TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_passkeys_user_id_passkey_id ON user_passkeys(user_id, passkey_id);

CREATE TABLE IF NOT EXISTS redeem_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    redeem_type TEXT NOT NULL,
    value TEXT NOT NULL,
    result TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    redeemed INTEGER NOT NULL DEFAULT 0 CHECK (redeemed IN (0, 1)),
    expires_at DATETIME NOT NULL,
    redeemed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_type ON redeem_codes(redeem_type);

CREATE TABLE IF NOT EXISTS admin_sender_preferences (
    owner TEXT NOT NULL,
    address TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    PRIMARY KEY (owner, address)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_sender_preferences_default
    ON admin_sender_preferences (owner) WHERE is_default = 1;
`

export default {
    initialize: async (c: Context<HonoCustomType>) => {
        // remove all \r and \n characters from the query string
        // split by ; and join with a ;\n
        const query = DB_INIT_QUERIES.replace(/[\r\n]/g, "")
            .split(";")
            .map((query) => query.trim())
            .join(";\n");
        await c.env.DB.exec(query);

        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        if (version) {
            return c.json({ message: "Database already initialized" });
        }
        await utils.saveSetting(c, CONSTANTS.DB_VERSION_KEY, CONSTANTS.DB_VERSION);
        return c.json({ message: "Database initialized" });
    },
    migrate: async (c: Context<HonoCustomType>) => {
        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        if (version && compareVersions(version, "v0.0.2") <= 0) {
            // migration to v0.0.3: add password column
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(address)`
            ).all();
            const hasPassword = tableInfo.results?.some(
                (col: any) => col.name === 'password'
            );
            if (!hasPassword) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN password TEXT;`);
            }
        }
        if (version && compareVersions(version, "v0.0.3") <= 0) {
            // migration to v0.0.4: add metadata column
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(raw_mails)`
            ).all();
            const hasMetadata = tableInfo.results?.some(
                (col: any) => col.name === 'metadata'
            );
            if (!hasMetadata) {
                await c.env.DB.exec(`ALTER TABLE raw_mails ADD COLUMN metadata TEXT;`);
            }
        }
        if (version && compareVersions(version, "v0.0.4") <= 0) {
            // migration to v0.0.5: add source_meta column
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(address)`
            ).all();
            const hasSourceMeta = tableInfo.results?.some(
                (col: any) => col.name === 'source_meta'
            );
            if (!hasSourceMeta) {
                await c.env.DB.exec(`ALTER TABLE address ADD COLUMN source_meta TEXT;`);
                await c.env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_address_source_meta ON address(source_meta);`);
            }
        }
        if (version && compareVersions(version, "v0.0.5") <= 0) {
            // migration to v0.0.6: add message_id index on raw_mails
            await c.env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_raw_mails_message_id ON raw_mails(message_id);`);
        }
        if (version && compareVersions(version, "v0.0.6") <= 0) {
            // migration to v0.0.7: add raw_blob column for gzip compressed email storage
            const tableInfo = await c.env.DB.prepare(
                `PRAGMA table_info(raw_mails)`
            ).all();
            const hasRawBlob = tableInfo.results?.some(
                (col: any) => col.name === 'raw_blob'
            );
            if (!hasRawBlob) {
                await c.env.DB.exec(`ALTER TABLE raw_mails ADD COLUMN raw_blob BLOB;`);
            }
        }
        if (version && compareVersions(version, "v0.0.7") <= 0) {
            const tableInfo = await c.env.DB.prepare(`PRAGMA table_info(raw_mails)`).all();
            if (!tableInfo.results?.some((col: any) => col.name === 'is_unread')) {
                await c.env.DB.exec(
                    `ALTER TABLE raw_mails ADD COLUMN is_unread INTEGER;`
                );
            }
        }
        if (!version || compareVersions(version, 'v0.0.10') <= 0) {
            const { results } = await c.env.DB.prepare('PRAGMA table_info(raw_mails)').all<{ name: string }>();
            const columns = new Set(results.map(column => column.name));
            if (columns.size) {
                if (!columns.has('search_sender')) await c.env.DB.exec('ALTER TABLE raw_mails ADD COLUMN search_sender TEXT');
                if (!columns.has('search_subject')) await c.env.DB.exec('ALTER TABLE raw_mails ADD COLUMN search_subject TEXT');
            }
        }
        if (!version || compareVersions(version, 'v0.0.12') <= 0) {
            const [inboxColumns, sendboxColumns] = await c.env.DB.batch<{ name: string }>([
                c.env.DB.prepare('PRAGMA table_info(raw_mails)'),
                c.env.DB.prepare('PRAGMA table_info(sendbox)'),
            ]);
            if (inboxColumns.results.length && sendboxColumns.results.length) {
                const migration: D1PreparedStatement[] = [];
                if (!inboxColumns.results.some(column => column.name === 'is_replied')) {
                    migration.push(c.env.DB.prepare('ALTER TABLE raw_mails ADD COLUMN is_replied INTEGER NOT NULL DEFAULT 0'));
                }
                if (!sendboxColumns.results.some(column => column.name === 'send_status')) {
                    migration.push(c.env.DB.prepare(`ALTER TABLE sendbox ADD COLUMN send_status TEXT NOT NULL DEFAULT 'accepted'
                        CHECK (send_status IN ('accepted', 'failed', 'unknown'))`));
                }
                migration.push(c.env.DB.prepare(`WITH replies AS (
                    SELECT address, json_extract(CASE WHEN json_valid(raw) THEN raw END, '$.in_reply_to') AS message_id
                    FROM sendbox WHERE send_status = 'accepted'
                ) UPDATE raw_mails SET is_replied = 1 FROM replies
                WHERE raw_mails.address = replies.address
                    AND substr(replies.message_id, 1, 1) = '<' AND substr(replies.message_id, -1) = '>'
                    AND raw_mails.message_id IN (replies.message_id, substr(replies.message_id, 2, length(replies.message_id) - 2))`));
                await c.env.DB.batch(migration);
            }
        }
        if (!version || compareVersions(version, 'v0.0.13') <= 0) {
            const { results } = await c.env.DB.prepare('PRAGMA table_info(sendbox)').all<{ name: string }>();
            if (results.length) {
                const migration: D1PreparedStatement[] = [];
                if (!results.some(column => column.name === 'resend_email_id')) {
                    migration.push(c.env.DB.prepare('ALTER TABLE sendbox ADD COLUMN resend_email_id TEXT'));
                }
                if (!results.some(column => column.name === 'resend_rejection_reason')) {
                    migration.push(c.env.DB.prepare('ALTER TABLE sendbox ADD COLUMN resend_rejection_reason TEXT'));
                }
                if (migration.length) await c.env.DB.batch(migration);
            }
        }
        if (!version || compareVersions(version, CONSTANTS.DB_VERSION) < 0) {
            // remove all \r and \n characters from the query string
            // split by ; and join with a ;\n
            const query = DB_INIT_QUERIES.replace(/[\r\n]/g, "")
                .split(";")
                .map((query) => query.trim())
                .join(";\n");
            await c.env.DB.exec(query);
            // Update the version in the settings table
            await utils.saveSetting(c, CONSTANTS.DB_VERSION_KEY, CONSTANTS.DB_VERSION);
            return c.json({
                success: true,
                message: "Database migrated"
            });
        }
        return c.json({
            success: true,
            message: "Database does not need migration"
        });
    },
    getVersion: async (c: Context<HonoCustomType>) => {
        const version = await utils.getSetting(c, CONSTANTS.DB_VERSION_KEY);
        const sizeResult = await c.env.DB.prepare("SELECT 1").run();
        return c.json({
            need_initialization: !version,
            need_migration: version && compareVersions(version, CONSTANTS.DB_VERSION) < 0,
            current_db_version: version,
            code_db_version: CONSTANTS.DB_VERSION,
            database_size: sizeResult.meta.size_after ?? null
        });
    },
}
