import { Context, Hono } from 'hono'
import { verifyAddressToken } from '../address_auth';
import { createMimeMessage } from 'mimetext';
import { Resend } from 'resend';
import { WorkerMailer, WorkerMailerOptions } from 'worker-mailer';

import i18n from '../i18n';
import { CONSTANTS } from '../constants'
import { getJsonSetting, getDomains, getBooleanValue, getJsonObjectValue, getDomainMapValue, getMailDomain, includesDomain } from '../utils';
import { GeoData } from '../models'
import { handleListQuery, isSendMailBindingEnabled, updateAddressUpdatedAt } from '../common'
import { getSendBalanceState, requestSendMailAccess } from './send_balance';
import { ensureSendMailLimit, increaseSendMailLimitCount } from './send_mail_limit_utils';
import { resendMailSourceTag, sendboxDeliveryJoin, sendboxFields } from './resend_delivery';
import { getResendKey } from '../provider_credentials';


export const api = new Hono<HonoCustomType>()

type SendMailContent = {
    from_name: string;
    to_mail: string;
    to_name: string;
    subject: string;
    content: string;
    is_html: boolean;
}

export type SendMailInput = SendMailContent & {
    in_reply_to?: string;
    references?: string[];
    reply_mail_id?: number;
}

type MailSubmissionStatus = 'accepted' | 'failed' | 'unknown';

class MailSubmissionError extends Error {
    constructor(message: string, readonly status: 'failed' | 'unknown', readonly resendRejectionReason?: string) {
        super(message);
    }
}

const MAX_MAIL_HEADER_LENGTH = 998;

export const isMessageId = (value: unknown): value is string => (
    typeof value === "string"
    && value.length <= MAX_MAIL_HEADER_LENGTH - "In-Reply-To: ".length
    && /^<[^<>@]+@[^<>@]+>$/.test(value)
    && !/[^!-~]/.test(value)
);

const getReplyHeaders = (
    { in_reply_to: inReplyTo, references }: SendMailInput,
    invalidInputMessage: string,
): Record<string, string> | undefined => {
    if ((inReplyTo !== undefined && !isMessageId(inReplyTo))
        || (references !== undefined && (!Array.isArray(references) || !references.every(isMessageId)))) {
        throw new Error(invalidInputMessage);
    }
    if (!inReplyTo && !references?.length) return;

    const ids = new Set(references);
    if (inReplyTo) {
        ids.delete(inReplyTo);
        ids.add(inReplyTo);
    }

    // Keep the newest references when the chain cannot fit on a MIME header line.
    const orderedIds = [...ids];
    let first = orderedIds.length;
    let available = MAX_MAIL_HEADER_LENGTH - "References: ".length + 1;
    while (first > 0 && orderedIds[first - 1].length + 1 <= available) {
        available -= orderedIds[--first].length + 1;
    }
    return {
        ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
        References: orderedIds.slice(first).join(" "),
    };
};

api.post('/api/request_send_mail_access', async (c) => {
    const msgs = i18n.getMessagesbyContext(c);
    const { address } = c.get("jwtPayload")
    if (!address) {
        return c.text(msgs.AddressNotFoundMsg, 400)
    }
    const result = await requestSendMailAccess(c, address);
    if (result.status === "ok") {
        return c.json({ status: "ok" })
    }
    if (result.status === "already_requested") {
        return c.text(msgs.AlreadyRequestedMsg, 400)
    }
    return c.text(msgs.OperationFailedMsg, 500)
})

export const sendMailToVerifyAddress = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: SendMailContent,
    headers?: Record<string, string>,
): Promise<void> => {
    const {
        from_name, to_mail, to_name,
        subject, content, is_html
    } = reqJson;
    const msg = createMimeMessage();
    msg.setSender(from_name ? { name: from_name, addr: address } : address);
    msg.setRecipient(to_name ? { name: to_name, addr: to_mail } : to_mail);
    msg.setSubject(subject);
    if (headers) msg.setHeaders(headers);
    msg.addMessage({
        contentType: is_html ? 'text/html' : 'text/plain',
        data: content
    });
    const { EmailMessage } = await import('cloudflare:email');
    const message = new EmailMessage(address, to_mail, msg.asRaw());
    await c.env.SEND_MAIL.send(message);
}

export const sendMailByBinding = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: SendMailContent,
    headers?: Record<string, string>,
): Promise<void> => {
    const {
        from_name, to_mail, to_name,
        subject, content, is_html
    } = reqJson;
    await c.env.SEND_MAIL.send({
        from: from_name ? { email: address, name: from_name } : address,
        to: to_name ? [`${to_name} <${to_mail}>`] : [to_mail],
        subject,
        ...(headers ? { headers } : {}),
        ...(is_html ? { html: content } : { text: content }),
    });
}

const sendMailByResend = async (
    token: string, address: string,
    reqJson: SendMailContent,
    headers?: Record<string, string>,
): Promise<string> => {
    const resend = new Resend(token);
    const { data, error } = await resend.emails.send({
        from: reqJson.from_name ? `${reqJson.from_name} <${address}>` : address,
        to: reqJson.to_name ? `${reqJson.to_name} <${reqJson.to_mail}>` : reqJson.to_mail,
        subject: reqJson.subject,
        headers,
        tags: [resendMailSourceTag],
        ...(reqJson.is_html ? {
            html: reqJson.content,
        } : {
            text: reqJson.content,
        })
    });
    if (error) {
        const status = error.statusCode;
        const state = status !== null && status >= 400 && status < 500 && status !== 408 ? 'failed' : 'unknown';
        const reason = state === 'failed' && /^[a-z][a-z0-9_]{1,79}$/.test(error.name) ? error.name : undefined;
        throw new MailSubmissionError(`Resend error: ${error.name} ${error.message}`, state, reason);
    }
    if (!data?.id) {
        throw new MailSubmissionError('Resend returned no message ID', 'unknown');
    }
    console.log(`Resend success: ${JSON.stringify(data)}`);
    return data.id;
}

const sendMailBySmtp = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: SendMailContent,
    smtpOptions: WorkerMailerOptions,
    headers?: Record<string, string>,
): Promise<void> => {
    try {
        await WorkerMailer.send(smtpOptions, {
            from: { name: reqJson.from_name, email: address },
            to: { name: reqJson.to_name, email: reqJson.to_mail },
            subject: reqJson.subject,
            headers,
            text: reqJson.is_html ? undefined : reqJson.content,
            html: reqJson.is_html ? reqJson.content : undefined,
        });
    } catch (error) {
        // WorkerMailer exposes negative SMTP replies in the transaction error message.
        if (error instanceof Error && /^(?:Invalid (?:MAIL FROM|RCPT TO): [^\r\n]*?> |Failed (?:to send DATA|send email body): )[45]\d{2}(?:[ -]|$)/.test(error.message)) {
            throw new MailSubmissionError(error.message, 'failed');
        }
        throw error;
    }
}

const submissionFailureStatus = (error: unknown): 'failed' | 'unknown' => {
    if (error instanceof MailSubmissionError) return error.status;
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        && /^E_[A-Z_]+$/.test(error.code) && error.code !== 'E_INTERNAL_SERVER_ERROR') {
        return 'failed';
    }
    return 'unknown';
};

const saveMailSubmission = async (
    c: Context<HonoCustomType>, address: string, mail: SendMailInput, status: MailSubmissionStatus,
    resendEmailId: string | null = null, resendRejectionReason: string | null = null,
): Promise<void> => {
    const {
        from_name, to_mail, to_name, subject, content, is_html, in_reply_to, references, reply_mail_id,
    } = mail;
    try {
        const geoData = new GeoData(c.req.raw.headers.get('cf-connecting-ip'), c.req.raw.cf as any);
        const raw = JSON.stringify({
            version: 'v2', from_name, to_mail, to_name, subject, content, is_html,
            in_reply_to, references, reply_mail_id, geoData,
        });
        const statements = [c.env.DB.prepare(
            'INSERT INTO sendbox (address, raw, send_status, resend_email_id, resend_rejection_reason) VALUES (?, ?, ?, ?, ?)',
        ).bind(address, raw, status, resendEmailId, resendRejectionReason)];
        if (status === 'accepted' && reply_mail_id !== undefined) {
            statements.push(c.env.DB.prepare(
                'UPDATE raw_mails SET is_replied = 1 WHERE address = ? AND id = ?',
            ).bind(address, reply_mail_id));
        } else if (status === 'accepted' && in_reply_to) {
            statements.push(c.env.DB.prepare(
                'UPDATE raw_mails SET is_replied = 1 WHERE address = ? AND message_id IN (?, ?)',
            ).bind(address, in_reply_to, in_reply_to.slice(1, -1)));
        }
        const results = await c.env.DB.batch(statements);
        if (results.some(result => !result.success)) console.warn('Failed to save mail submission history');
    } catch {
        // An accepted send remains successful even when its local history cannot be recorded.
        console.warn('Failed to save mail submission history');
    }
};

export const submitMail = async (
    c: Context<HonoCustomType>, address: string, mail: SendMailInput, submit: () => Promise<unknown>,
): Promise<void> => {
    let result: unknown;
    try {
        result = await submit();
    } catch (error) {
        const reason = error instanceof MailSubmissionError ? error.resendRejectionReason : undefined;
        await saveMailSubmission(c, address, mail, submissionFailureStatus(error), null, reason);
        throw error;
    }
    await saveMailSubmission(c, address, mail, 'accepted', typeof result === 'string' ? result : null);
};

export const sendMail = async (
    c: Context<HonoCustomType>, address: string,
    reqJson: SendMailInput,
    options?: {
        isAdmin?: boolean
    }
): Promise<void> => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!address) {
        throw new Error(msgs.AddressNotFoundMsg)
    }
    // check domain
    const mailDomain = getMailDomain(address);
    const domains = getDomains(c);
    if (!includesDomain(domains, mailDomain)) {
        throw new Error(msgs.InvalidDomainMsg)
    }
    const sendBalanceState = await getSendBalanceState(c, address, {
        isAdmin: options?.isAdmin,
    });
    if (sendBalanceState.needCheckBalance) {
        if (!sendBalanceState.balance || sendBalanceState.balance <= 0) {
            throw new Error(msgs.NoBalanceMsg)
        }
    }
    const {
        from_name, to_mail, to_name,
        subject, content, is_html
    } = reqJson;
    if (!to_mail) {
        throw new Error(msgs.InvalidToMailMsg)
    }
    // check SEND_BLOCK_LIST_KEY
    const sendBlockList = await getJsonSetting(c, CONSTANTS.SEND_BLOCK_LIST_KEY) as string[];
    if (sendBlockList && sendBlockList.some((item) => to_mail.includes(item))) {
        throw new Error(msgs.AddressBlockedMsg)
    }
    if (!subject) {
        throw new Error(msgs.SubjectEmptyMsg)
    }
    if (!content) {
        throw new Error(msgs.ContentEmptyMsg)
    }
    if (reqJson.reply_mail_id !== undefined && (!Number.isSafeInteger(reqJson.reply_mail_id) || reqJson.reply_mail_id < 1)) {
        throw new Error(msgs.InvalidInputMsg);
    }
    const replyHeaders = getReplyHeaders(reqJson, msgs.InvalidInputMsg);
    await ensureSendMailLimit(c);

    // send by smtp
    const smtpConfigMap = getJsonObjectValue<Record<string, WorkerMailerOptions>>(c.env.SMTP_CONFIG);
    const smtpConfig = getDomainMapValue(smtpConfigMap, mailDomain);
    // send by verified address list
    const verifiedAddressList = c.env.SEND_MAIL ? await getJsonSetting(c, CONSTANTS.VERIFIED_ADDRESS_LIST_KEY) || [] : [];
    const sendByVerifiedAddressList = verifiedAddressList.includes(to_mail);
    const resendKey = sendByVerifiedAddressList ? null : await getResendKey(c, mailDomain);
    let submit: () => Promise<void | string>;
    if (sendByVerifiedAddressList) {
        submit = () => sendMailToVerifyAddress(c, address, reqJson, replyHeaders);
    } else if (resendKey) {
        submit = () => sendMailByResend(resendKey, address, reqJson, replyHeaders);
    } else if (smtpConfig) {
        submit = () => sendMailBySmtp(c, address, reqJson, smtpConfig, replyHeaders);
    } else if (isSendMailBindingEnabled(c, mailDomain)) {
        submit = () => sendMailByBinding(c, address, reqJson, replyHeaders);
    } else {
        throw new Error(`${msgs.EnableResendOrSmtpOrSendMailMsg} (${mailDomain})`);
    }
    await submitMail(c, address, reqJson, submit);
    await increaseSendMailLimitCount(c);

    // update balance
    if (!sendByVerifiedAddressList && sendBalanceState.needCheckBalance) {
        try {
            const { success } = await c.env.DB.prepare(
                `UPDATE address_sender SET balance = balance - 1 where address = ?`
            ).bind(address).run();
            if (!success) {
                console.warn(`Failed to update balance for ${address}`);
            }
        } catch (e) {
            console.warn(`Failed to update balance for ${address}`);
        }
    }
    // update address updated_at
    updateAddressUpdatedAt(c, address);
}

api.post('/api/send_mail', async (c) => {
    const { address } = c.get("jwtPayload")
    const reqJson = await c.req.json();
    try {
        await sendMail(c, address, reqJson);
    } catch (e) {
        console.error("Failed to send mail", e);
        return c.text(`Failed to send mail ${(e as Error).message}`, 400)
    }
    return c.json({ status: "ok" })
})

api.post('/external/api/send_mail', async (c) => {
    const body = await c.req.json();
    try {
        const { address } = await verifyAddressToken(c, body?.token);
        const { from_name, to_mail, to_name, subject, content, is_html, in_reply_to, references, reply_mail_id } = body;
        const reqJson = { from_name, to_mail, to_name, subject, content, is_html, in_reply_to, references, reply_mail_id };
        await sendMail(c, address as string, reqJson);
        return c.json({ status: "ok" })
    } catch (e) {
        console.error("Failed to send mail", e);
        return c.text(`Failed to send mail ${(e as Error).message}`, 400)
    }
})

export const getSendbox = async (
    c: Context<HonoCustomType>,
    address: string, limit: string, offset: string
): Promise<Response> => {
    if (!address) {
        return c.json({ "error": "No address" }, 400)
    }
    return await handleListQuery(c,
        `SELECT ${sendboxFields} FROM sendbox sb${sendboxDeliveryJoin} WHERE sb.address = ?`,
        `SELECT count(*) as count FROM sendbox where address = ? `,
        [address], limit, offset
    );
}

api.get('/api/sendbox', async (c) => {
    const { address } = c.get("jwtPayload")
    const { limit, offset } = c.req.query();
    return getSendbox(c, address, limit, offset);
})

api.delete('/api/sendbox/:id', async (c) => {
    const msgs = i18n.getMessagesbyContext(c);
    if (!getBooleanValue(c.env.ENABLE_USER_DELETE_EMAIL)) {
        return c.text(msgs.UserDeleteEmailDisabledMsg, 403)
    }
    const { address } = c.get("jwtPayload")
    const { id } = c.req.param();
    const { success } = await c.env.DB.prepare(
        `DELETE FROM sendbox WHERE address = ? and id = ? `
    ).bind(address, id).run();
    return c.json({
        success: success
    })
})
