import { Context } from "hono";
import { getEnabledSendMailDomains, isSendMailBindingEnabled } from "../common";
import i18n from "../i18n";
import { isMessageId, sendMail, submitMail } from "../mails_api/send_mail_api";
import { ensureSendMailLimit, increaseSendMailLimitCount } from "../mails_api/send_mail_limit_utils";
import { getMailDomain } from "../utils";

export const getAdminSenderOptions = async (c: Context<HonoCustomType>) => {
    const query = c.req.query("query")?.trim() || "";
    if (query.length > 254) {
        return c.text(i18n.getMessagesbyContext(c).InvalidInputMsg, 400);
    }

    const domains = await getEnabledSendMailDomains(c);
    if (!domains.length) return c.json({ domains, addresses: [] });

    const { results } = await c.env.DB.prepare(
        `SELECT name FROM address
         WHERE instr(name, '@') > 0
           AND lower(substr(name, instr(name, '@') + 1)) IN (SELECT value FROM json_each(?))
           AND instr(lower(name), lower(?)) > 0
         ORDER BY name LIMIT 20`
    ).bind(JSON.stringify(domains), query).all<{ name: string }>();
    return c.json({ domains, addresses: results.map(row => row.name) });
}

const getAdminSendMailErrorMessage = (
    msgs: ReturnType<typeof i18n.getMessagesbyContext>,
    error: unknown
): string => {
    const message = error instanceof Error ? error.message : "";
    return Object.values(msgs).includes(message)
        ? message
        : msgs.OperationFailedMsg;
}

export const sendMailbyAdmin = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    let reqJson;
    try {
        reqJson = await c.req.json();
    } catch (e) {
        console.error("Admin send_mail invalid json", e);
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const {
        from_name, from_mail,
        to_mail, to_name,
        subject, content, is_html,
        in_reply_to, references, reply_mail_id,
    } = reqJson;
    try {
        await sendMail(c, from_mail, {
            from_name: from_name,
            to_name: to_name,
            to_mail: to_mail,
            subject: subject,
            content: content,
            is_html: is_html,
            in_reply_to,
            references,
            reply_mail_id,
        }, {
            isAdmin: true
        })
    } catch (e) {
        console.error("Admin send_mail failed", e);
        return c.text(getAdminSendMailErrorMessage(msgs, e), 400)
    }
    return c.json({ status: "ok" });
}

export const sendMailByBindingAdmin = async (c: Context<HonoCustomType>) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!c.env.SEND_MAIL) {
        return c.text(msgs.EnableSendMailMsg, 400)
    }
    let reqJson;
    try {
        reqJson = await c.req.json();
    } catch (e) {
        console.error("Admin raw send_mail invalid json", e);
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const {
        from, to, subject,
        html, text,
        cc, bcc, replyTo,
        attachments, headers,
    } = reqJson;
    if (!from || !to || !subject || (!html && !text)) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    const fromMail = typeof from === "string" ? from : from?.email;
    const mailDomain = getMailDomain(fromMail);
    if (!mailDomain) {
        return c.text(msgs.InvalidInputMsg, 400)
    }
    if (!isSendMailBindingEnabled(c, mailDomain)) {
        return c.text(msgs.EnableSendMailForDomainMsg, 400)
    }
    try {
        await ensureSendMailLimit(c);
        const originalId = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === 'in-reply-to')?.[1];
        const history = {
            from_name: typeof from === 'string' ? '' : from.name,
            to_mail: (Array.isArray(to) ? to : [to]).map(target => typeof target === 'string' ? target : target?.email).join(', '),
            to_name: !Array.isArray(to) && typeof to === 'object' ? to.name : '',
            subject,
            content: html || text,
            is_html: !!html,
            in_reply_to: isMessageId(originalId) ? originalId : undefined,
        };
        await submitMail(c, fromMail, history, () => c.env.SEND_MAIL.send({
            from,
            to,
            subject,
            ...(html ? { html } : {}),
            ...(text ? { text } : {}),
            ...(cc ? { cc } : {}),
            ...(bcc ? { bcc } : {}),
            ...(replyTo ? { replyTo } : {}),
            ...(attachments && attachments.length ? { attachments } : {}),
            ...(headers ? { headers } : {}),
        }));
        await increaseSendMailLimitCount(c);
    } catch (e) {
        console.error("Admin raw send_mail failed", e);
        return c.text(getAdminSendMailErrorMessage(msgs, e), 400)
    }
    return c.json({ status: "ok" });
}
