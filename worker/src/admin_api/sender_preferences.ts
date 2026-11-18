import { Context } from 'hono';
import { isSendMailEnabled } from '../common';
import i18n from '../i18n';
import { getDomains, getMailDomain, normalizeAddressDomain } from '../utils';

const getPreferences = async (c: Context<HonoCustomType>, owner: string) => {
    const { results } = await c.env.DB.prepare(`
        SELECT address, is_default FROM admin_sender_preferences
        WHERE owner = ? ORDER BY is_default DESC, address
    `).bind(owner).all<{ address: string, is_default: number }>();
    c.header('Cache-Control', 'private, no-store');
    return c.json({
        addresses: results.map(row => row.address),
        defaultAddress: results.find(row => row.is_default === 1)?.address ?? null,
    });
};

export const getAdminSenderPreferences = (c: Context<HonoCustomType>) => {
    const owner = c.get('adminSenderOwner');
    if (!owner) return c.text(i18n.getMessagesbyContext(c).NeedAdminPasswordMsg, 403);
    return getPreferences(c, owner);
};

export const updateAdminSenderPreferences = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    const owner = c.get('adminSenderOwner');
    if (!owner) return c.text(msgs.NeedAdminPasswordMsg, 403);

    const input = await c.req.json<{ action?: unknown, address?: unknown } | null>();
    const action = input?.action;
    const rawAddress = typeof input?.address === 'string' ? input.address.trim() : '';
    if ((action !== 'add' && action !== 'remove' && action !== 'set-default')
        || rawAddress.length > 254 || !/^[^\s\p{Cc}@<>]+@[^\s\p{Cc}@<>]+$/u.test(rawAddress)) {
        return c.text(msgs.InvalidInputMsg, 400);
    }
    const address = normalizeAddressDomain(rawAddress);
    const domain = getMailDomain(address);
    if (action !== 'remove' && (!getDomains(c).includes(domain) || !(await isSendMailEnabled(c, domain)))) {
        return c.text(msgs.EnableSendMailForDomainMsg, 400);
    }

    const db = c.env.DB;
    if (action === 'remove') {
        await db.prepare('DELETE FROM admin_sender_preferences WHERE owner = ? AND address = ?').bind(owner, address).run();
    } else if (action === 'set-default') {
        await db.batch([
            db.prepare('UPDATE admin_sender_preferences SET is_default = 0 WHERE owner = ? AND is_default = 1').bind(owner),
            db.prepare(`INSERT INTO admin_sender_preferences (owner, address, is_default) VALUES (?, ?, 1)
                ON CONFLICT(owner, address) DO UPDATE SET is_default = 1`).bind(owner, address),
        ]);
    } else {
        await db.prepare(`INSERT INTO admin_sender_preferences (owner, address) VALUES (?, ?)
            ON CONFLICT(owner, address) DO NOTHING`).bind(owner, address).run();
    }
    return getPreferences(c, owner);
};
