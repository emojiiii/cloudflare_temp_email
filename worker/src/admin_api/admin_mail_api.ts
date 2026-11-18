import { Context } from "hono";
import { handleMailListQuery } from "../common";
import { resolveRawEmailRow } from "../gzip";
import { listInboxMails, updateInboxReadStatus } from '../mails_api/inbox';

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const address = c.req.query('address');
        return listInboxMails(c, 'raw_mails rm', address ? ['rm.address = ?'] : [], address ? [address] : []);
    },
    updateMailReadStatus: (c: Context<HonoCustomType>) => updateInboxReadStatus(c),
    getUnknowMails: async (c: Context<HonoCustomType>) => {
        const { limit, offset } = c.req.query();
        return await handleMailListQuery(c,
            `SELECT * FROM raw_mails where address NOT IN (select name from address) `,
            `SELECT count(*) as count FROM raw_mails`
            + ` where address NOT IN (select name from address) `,
            [], limit, offset
        );
    },
    getMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const result = await c.env.DB.prepare(
            `SELECT * FROM raw_mails WHERE id = ?`
        ).bind(id).first();
        if (!result) return c.json(null);
        return c.json(await resolveRawEmailRow(result));
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const { success } = await c.env.DB.prepare(
            `DELETE FROM raw_mails WHERE id = ? `
        ).bind(id).run();
        return c.json({
            success: success
        })
    }
}
