import type { Context } from 'hono';
import i18n from '../i18n';
import {
    deleteProviderCredential, getAdminDeepSeekKey, getProviderCredential, hasAdminDeepSeekKey,
    hasProviderCredential, isProviderApiKey, isProviderStorageConfigured, setProviderCredential, userCredentialScope,
} from '../provider_credentials';
import { getBooleanValue } from '../utils';

export async function getCredentialAccount(c: Context<HonoCustomType>): Promise<UserPayload | null> {
    const user = c.get('userPayload');
    if (!Number.isSafeInteger(user.user_id) || user.user_id <= 0 || typeof user.user_email !== 'string' || !user.user_email) {
        return null;
    }
    const id = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? AND user_email = ?')
        .bind(user.user_id, user.user_email).first<number>('id');
    return id === null ? null : user;
}

export async function getUserDeepSeekKey(c: Context<HonoCustomType>, user: UserPayload): Promise<string | null> {
    const personalKey = isProviderStorageConfigured(c)
        ? await getProviderCredential(c, userCredentialScope(user), 'deepseek')
        : null;
    return personalKey ?? (getBooleanValue(c.env.RECEIVE_ONLY_USERS) ? null : await getAdminDeepSeekKey(c));
}

async function hasPersonalDeepSeekKey(c: Context<HonoCustomType>, user: UserPayload): Promise<boolean> {
    return isProviderStorageConfigured(c) && await hasProviderCredential(c, userCredentialScope(user), 'deepseek');
}

export async function hasUserDeepSeekKey(c: Context<HonoCustomType>, user: UserPayload): Promise<boolean> {
    return await hasPersonalDeepSeekKey(c, user)
        || (!getBooleanValue(c.env.RECEIVE_ONLY_USERS) && await hasAdminDeepSeekKey(c));
}

export default {
    async get(c: Context<HonoCustomType>) {
        c.header('Cache-Control', 'private, no-store');
        const user = await getCredentialAccount(c);
        if (!user) return c.text(i18n.getMessagesbyContext(c).UserTokenExpiredMsg, 401);

        const deepseekConfigured = await hasPersonalDeepSeekKey(c, user);
        return c.json({ deepseekConfigured });
    },
    async saveDeepSeek(c: Context<HonoCustomType>) {
        c.header('Cache-Control', 'private, no-store');
        const msgs = i18n.getMessagesbyContext(c);
        const user = await getCredentialAccount(c);
        if (!user) return c.text(msgs.UserTokenExpiredMsg, 401);

        const input = await c.req.json<{ apiKey?: unknown } | null>();
        const apiKey = input?.apiKey;
        if (!isProviderApiKey(apiKey)) return c.text(msgs.InvalidInputMsg, 400);

        await setProviderCredential(c, userCredentialScope(user), 'deepseek', apiKey.trim());
        return c.json({ deepseekConfigured: true });
    },
    async deleteDeepSeek(c: Context<HonoCustomType>) {
        c.header('Cache-Control', 'private, no-store');
        const user = await getCredentialAccount(c);
        if (!user) return c.text(i18n.getMessagesbyContext(c).UserTokenExpiredMsg, 401);

        await deleteProviderCredential(c, userCredentialScope(user), 'deepseek');
        return c.json({ deepseekConfigured: false });
    },
};
