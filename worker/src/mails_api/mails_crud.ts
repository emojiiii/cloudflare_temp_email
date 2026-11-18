import { Context } from 'hono'

import i18n from '../i18n';
import { getBooleanValue } from '../utils';
import { deleteAddressWithData, updateAddressUpdatedAt } from '../common'
import { resolveRawEmailRow } from '../gzip'
import { getSendBalanceState } from './send_balance';
import { renewAddressPasswordLoginToken } from '../address_auth';
import { listInboxMails, updateInboxReadStatus } from './inbox';

const listMails = async (c: Context<HonoCustomType>) => {
    const { address } = c.get("jwtPayload")
    if (!address) {
        return c.json({ "error": "No address" }, 400)
    }
    const offset = c.req.query('offset');
    if (offset && Number.parseInt(offset) <= 0) updateAddressUpdatedAt(c, address);
    return listInboxMails(c, 'raw_mails rm', ['rm.address = ?'], [address]);
};

const updateMailReadStatus = async (c: Context<HonoCustomType>) => {
    const { address } = c.get("jwtPayload");
    return updateInboxReadStatus(c, ' AND address = ?', [address]);
};

const getMail = async (c: Context<HonoCustomType>) => {
    const { address } = c.get("jwtPayload")
    const { mail_id } = c.req.param();
    const result = await c.env.DB.prepare(
        `SELECT * FROM raw_mails where id = ? and address = ?`
    ).bind(mail_id, address).first();
    if (!result) return c.json(null);
    return c.json(await resolveRawEmailRow(result));
};

const deleteMail = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { id } = c.req.param();
    // TODO: add toLowerCase() to handle old data
    const { success } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address = ? and id = ? `
    ).bind(address.toLowerCase(), id).run();
    return c.json({ success });
};

const getSettings = async (c: Context<HonoCustomType>) => {
    const { address } = c.get("jwtPayload")

    updateAddressUpdatedAt(c, address);

    const { balance, isNoLimitSender } = await getSendBalanceState(c, address);
    return c.json({
        address: address,
        send_balance: balance || 0,
        send_unlimited: isNoLimitSender,
        new_address_token: await renewAddressPasswordLoginToken(c, c.get("jwtPayload")),
    });
};

const deleteAddress = async (c: Context<HonoCustomType>) => {
    const { address, address_id } = c.get("jwtPayload")
    const success = await deleteAddressWithData(c, address, address_id);
    return c.json({ success });
};

const clearInbox = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { success } = await c.env.DB.prepare(
        `DELETE FROM raw_mails WHERE address = ?`
    ).bind(address).run();
    if (!success) {
        return c.text(msgs.FailedClearInboxMsg, 500)
    }
    return c.json({ success });
};

const clearSentItems = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { success } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address = ?`
    ).bind(address).run();
    if (!success) {
        return c.text(msgs.FailedClearSentItemsMsg, 500)
    }
    return c.json({ success });
};

export default { listMails, getMail, updateMailReadStatus, deleteMail, getSettings, deleteAddress, clearInbox, clearSentItems };
