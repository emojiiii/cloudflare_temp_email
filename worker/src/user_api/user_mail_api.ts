import { Context } from "hono";
import i18n from "../i18n";
import { getBooleanValue } from "../utils";
import { listInboxMails, updateInboxReadStatus } from '../mails_api/inbox';

const userOwnsMail = `EXISTS (SELECT 1 FROM users_address ua`
    + ` JOIN address a ON a.id = ua.address_id`
    + ` WHERE ua.user_id = ? AND a.name = raw_mails.address)`;

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const { user_id } = c.get("userPayload");
        const address = c.req.query('address');
        const filters = ['ua.user_id = ?'];
        const filterParams = [String(user_id)];
        if (address) {
            filters.push('rm.address = ?');
            filterParams.push(address);
        }
        const from = `users_address ua`
            + ` JOIN address a ON a.id = ua.address_id`
            + ` JOIN raw_mails rm ON rm.address = a.name`;
        return listInboxMails(c, from, filters, filterParams);
    },
    updateMailReadStatus: (c: Context<HonoCustomType>) => {
        const { user_id } = c.get('userPayload');
        return updateInboxReadStatus(c, ` AND ${userOwnsMail}`, [String(user_id)]);
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const msgs = i18n.getMessagesbyContext(c);
        if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
            return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
        }
        const { id } = c.req.param();
        const { user_id } = c.get("userPayload");
        const { success } = await c.env.DB.prepare(
            `DELETE FROM raw_mails WHERE id = ? AND ${userOwnsMail}`
        ).bind(id, user_id).run();
        return c.json({
            success: success
        })
    }
}
