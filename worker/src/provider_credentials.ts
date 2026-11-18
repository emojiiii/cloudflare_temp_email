import type { Context } from 'hono';

type CredentialProvider = 'deepseek' | 'resend';
type CredentialScope = 'admin' | `user:${number}:${string}`;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const userCredentialScope = (user: UserPayload): CredentialScope =>
    `user:${user.user_id}:${user.user_email}`;

export const isProviderApiKey = (value: unknown): value is string =>
    typeof value === 'string' && /^[!-~]{1,512}$/.test(value.trim());

export const isProviderStorageConfigured = (c: Context<HonoCustomType>): boolean =>
    Boolean(c.env.CREDENTIALS_ENCRYPTION_KEY?.trim());

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

async function getEncryptionKey(c: Context<HonoCustomType>): Promise<CryptoKey> {
    const value = c.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
    if (!value) throw new Error('CREDENTIALS_ENCRYPTION_KEY is required to store provider credentials');
    if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(value)) {
        throw new Error('CREDENTIALS_ENCRYPTION_KEY must encode 32 bytes in Base64');
    }
    const raw = decodeBase64(value.replace(/-/g, '+').replace(/_/g, '/'));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function credentialAad(scope: CredentialScope, provider: CredentialProvider, identifier: string) {
    return encoder.encode(JSON.stringify([scope, provider, identifier]));
}

export async function getProviderCredential(
    c: Context<HonoCustomType>, scope: CredentialScope, provider: CredentialProvider, identifier = '',
): Promise<string | null> {
    const encrypted = await c.env.DB.prepare(`SELECT encrypted_api_key FROM provider_credentials
        WHERE scope = ? AND provider = ? AND identifier = ?`)
        .bind(scope, provider, identifier).first<string>('encrypted_api_key');
    if (!encrypted) return null;

    const [version, encodedIv, encodedCiphertext] = encrypted.split('.');
    if (version !== 'v1') throw new Error('Unsupported provider credential format');
    const key = await getEncryptionKey(c);
    const plaintext = await crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: decodeBase64(encodedIv),
        additionalData: credentialAad(scope, provider, identifier),
    }, key, decodeBase64(encodedCiphertext));
    return decoder.decode(plaintext);
}

export async function hasProviderCredential(
    c: Context<HonoCustomType>, scope: CredentialScope, provider: CredentialProvider, identifier = '',
): Promise<boolean> {
    const exists = await c.env.DB.prepare(`SELECT 1 AS found FROM provider_credentials
        WHERE scope = ? AND provider = ? AND identifier = ?`)
        .bind(scope, provider, identifier).first<number>('found');
    return exists === 1;
}

async function prepareCredentialWrite(
    c: Context<HonoCustomType>, key: CryptoKey, scope: CredentialScope, provider: CredentialProvider,
    apiKey: string, identifier: string, replace: boolean,
): Promise<D1PreparedStatement> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({
        name: 'AES-GCM', iv, additionalData: credentialAad(scope, provider, identifier),
    }, key, encoder.encode(apiKey));
    const encrypted = `v1.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(ciphertext))}`;
    const userId = scope === 'admin' ? null : Number(scope.split(':', 2)[1]);
    const conflictAction = replace ? 'DO UPDATE SET encrypted_api_key = excluded.encrypted_api_key' : 'DO NOTHING';
    return c.env.DB.prepare(`INSERT INTO provider_credentials (scope, provider, identifier, user_id, encrypted_api_key)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT (scope, provider, identifier) ${conflictAction}`)
        .bind(scope, provider, identifier, userId, encrypted);
}

export async function setProviderCredential(
    c: Context<HonoCustomType>, scope: CredentialScope, provider: CredentialProvider, apiKey: string, identifier = '',
): Promise<void> {
    const key = await getEncryptionKey(c);
    const write = await prepareCredentialWrite(c, key, scope, provider, apiKey, identifier, true);
    await write.run();
}

export async function deleteProviderCredential(
    c: Context<HonoCustomType>, scope: CredentialScope, provider: CredentialProvider, identifier = '',
): Promise<void> {
    await c.env.DB.prepare('DELETE FROM provider_credentials WHERE scope = ? AND provider = ? AND identifier = ?')
        .bind(scope, provider, identifier).run();
}

export function getLegacyResendKey(c: Context<HonoCustomType>, domain: string): string | null {
    const name = `RESEND_TOKEN_${domain.replace(/\./g, '_').toUpperCase()}` as const;
    return c.env[name]?.trim() || c.env.RESEND_TOKEN?.trim() || null;
}

export function getLegacyAdminDeepSeekKey(c: Context<HonoCustomType>): string | null {
    return c.env.DEEPSEEK_API_KEY?.trim() || null;
}

export async function getAdminDeepSeekKey(c: Context<HonoCustomType>): Promise<string | null> {
    const stored = isProviderStorageConfigured(c) ? await getProviderCredential(c, 'admin', 'deepseek') : null;
    return stored ?? getLegacyAdminDeepSeekKey(c);
}

export async function hasAdminDeepSeekKey(c: Context<HonoCustomType>): Promise<boolean> {
    return Boolean(getLegacyAdminDeepSeekKey(c))
        || (isProviderStorageConfigured(c) && await hasProviderCredential(c, 'admin', 'deepseek'));
}

export async function getResendKey(c: Context<HonoCustomType>, domain: string): Promise<string | null> {
    const stored = isProviderStorageConfigured(c) ? await getProviderCredential(c, 'admin', 'resend', domain) : null;
    return stored ?? getLegacyResendKey(c, domain);
}

export async function getStoredResendDomains(c: Context<HonoCustomType>): Promise<Set<string>> {
    if (!isProviderStorageConfigured(c)) return new Set();
    const { results } = await c.env.DB.prepare(`SELECT identifier FROM provider_credentials
        WHERE scope = 'admin' AND provider = 'resend'`).all<{ identifier: string }>();
    return new Set(results.map(row => row.identifier));
}

export async function migrateLegacyAdminProviderCredentials(c: Context<HonoCustomType>, domains: string[]): Promise<number> {
    const credentials: { provider: CredentialProvider; identifier: string; apiKey: string }[] = [];
    const deepSeek = getLegacyAdminDeepSeekKey(c);
    if (deepSeek) credentials.push({ provider: 'deepseek', identifier: '', apiKey: deepSeek });
    for (const domain of domains) {
        const resend = getLegacyResendKey(c, domain);
        if (resend) credentials.push({ provider: 'resend', identifier: domain, apiKey: resend });
    }
    if (!credentials.length) return 0;

    const key = await getEncryptionKey(c);
    const writes = await Promise.all(credentials.map(({ provider, identifier, apiKey }) =>
        prepareCredentialWrite(c, key, 'admin', provider, apiKey, identifier, false)));
    const results = await c.env.DB.batch(writes);
    return results.reduce((count, result) => count + result.meta.changes, 0);
}
