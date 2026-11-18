import { Context } from 'hono';
import { handleMailListQuery } from '../common';
import { normalizeMailSearch } from '../email/search-headers';
import i18n from '../i18n';
import { getBooleanValue } from '../utils';

export const listInboxMails = (
    c: Context<HonoCustomType>, from: string, filters: string[], params: string[]
) => {
    const { limit, offset, q, unread } = c.req.query();
    const keyword = q?.trim();
    if (keyword && keyword.length > 200) return c.text(i18n.getMessagesbyContext(c).InvalidInputMsg, 400);
    if (keyword) {
        const search = normalizeMailSearch(keyword);
        filters.push(`(instr(COALESCE(rm.search_sender, lower(rm.source)), ?) > 0 OR instr(rm.search_subject, ?) > 0)`);
        params.push(search, search);
    }
    if (unread === '1') {
        if (!getBooleanValue(c.env.ENABLE_MAIL_READ_STATUS)) {
            return c.json({ error: 'Mail read status is disabled' }, 403);
        }
        filters.push('rm.is_unread = 1');
    }
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    return handleMailListQuery(c,
        `SELECT rm.* FROM ${from}${where}`,
        `SELECT count(*) AS count FROM ${from}${where}`,
        params, limit, offset, 'rm.id desc'
    );
};

export const updateInboxReadStatus = async (
    c: Context<HonoCustomType>, scope: string = '', params: string[] = []
) => {
    if (!getBooleanValue(c.env.ENABLE_MAIL_READ_STATUS)) {
        return c.json({ error: 'Mail read status is disabled' }, 403);
    }
    const { id } = c.req.param();
    const input = await c.req.json<{ isUnread?: boolean } | null>();
    if (typeof input?.isUnread !== 'boolean') {
        return c.json({ error: 'isUnread must be a boolean' }, 400);
    }
    const value = input.isUnread ? 1 : 0;
    const { success } = await c.env.DB.prepare(
        `UPDATE raw_mails SET is_unread = ? WHERE id = ? AND COALESCE(is_unread, 0) != ?${scope}`
    ).bind(value, id, value, ...params).run();
    return c.json({ success });
};
