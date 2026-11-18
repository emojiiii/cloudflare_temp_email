import type { Context, Next } from 'hono';
import i18n from '../i18n';
import {
    deleteProviderCredential, getLegacyAdminDeepSeekKey, getLegacyResendKey, getStoredResendDomains,
    hasProviderCredential, isProviderApiKey, isProviderStorageConfigured,
    migrateLegacyAdminProviderCredentials, setProviderCredential,
} from '../provider_credentials';
import { getDomains, trimLower } from '../utils';

export async function requireProviderAdmin(c: Context<HonoCustomType>, next: Next) {
    c.header('Cache-Control', 'private, no-store');
    if (!c.get('adminSenderOwner')) return c.text(i18n.getMessagesbyContext(c).NeedAdminPasswordMsg, 403);
    await next();
}

export async function getProviderSettings(c: Context<HonoCustomType>) {
    const storageConfigured = isProviderStorageConfigured(c);
    const [storedDeepSeek, storedResendDomains] = await Promise.all([
        storageConfigured && hasProviderCredential(c, 'admin', 'deepseek'), getStoredResendDomains(c),
    ]);
    const legacyDeepSeek = Boolean(getLegacyAdminDeepSeekKey(c));
    let canMigrateLegacy = legacyDeepSeek && !storedDeepSeek;
    const resendDomains = getDomains(c).map(domain => {
        const stored = storedResendDomains.has(domain);
        const legacy = Boolean(getLegacyResendKey(c, domain));
        canMigrateLegacy ||= legacy && !stored;
        return { domain, configured: stored || legacy };
    });
    return c.json({
        storageConfigured, deepseekConfigured: storedDeepSeek || legacyDeepSeek, resendDomains,
        canMigrateLegacy: storageConfigured && canMigrateLegacy,
    });
}

export async function setAdminDeepSeek(c: Context<HonoCustomType>) {
    const input = await c.req.json<{ apiKey?: unknown } | null>();
    if (!isProviderApiKey(input?.apiKey)) return c.text(i18n.getMessagesbyContext(c).InvalidInputMsg, 400);
    await setProviderCredential(c, 'admin', 'deepseek', input.apiKey.trim());
    return c.body(null, 204);
}

export async function deleteAdminDeepSeek(c: Context<HonoCustomType>) {
    await deleteProviderCredential(c, 'admin', 'deepseek');
    return c.body(null, 204);
}

export async function setAdminResend(c: Context<HonoCustomType>) {
    const domain = trimLower(c.req.param('domain'));
    const input = await c.req.json<{ apiKey?: unknown } | null>();
    if (!getDomains(c).includes(domain) || !isProviderApiKey(input?.apiKey)) {
        return c.text(i18n.getMessagesbyContext(c).InvalidInputMsg, 400);
    }
    await setProviderCredential(c, 'admin', 'resend', input.apiKey.trim(), domain);
    return c.body(null, 204);
}

export async function deleteAdminResend(c: Context<HonoCustomType>) {
    const domain = trimLower(c.req.param('domain'));
    if (!getDomains(c).includes(domain)) return c.text(i18n.getMessagesbyContext(c).InvalidInputMsg, 400);
    await deleteProviderCredential(c, 'admin', 'resend', domain);
    return c.body(null, 204);
}

export async function migrateAdminProviderSettings(c: Context<HonoCustomType>) {
    const migratedCount = await migrateLegacyAdminProviderCredentials(c, getDomains(c));
    return c.json({ migratedCount });
}
