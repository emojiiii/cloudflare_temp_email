import { Context } from 'hono';
import { Resend } from 'resend';

export const resendMailSourceTag = { name: 'mail_source', value: 'cloudflare_temp_email' };

export const sendboxFields = 'sb.id, sb.address, sb.raw, sb.created_at, sb.send_status, '
    + 'rd.delivery_status, COALESCE(rd.delivery_reason, sb.resend_rejection_reason) AS delivery_reason, rd.delivery_updated_at';
export const sendboxDeliveryJoin = ' LEFT JOIN resend_delivery rd ON rd.resend_email_id = sb.resend_email_id';

const eventTypes = {
    'email.delivery_delayed': { status: 'delayed', rank: 0 },
    'email.delivered': { status: 'delivered', rank: 1 },
    'email.failed': { status: 'failed', rank: 2 },
    'email.bounced': { status: 'bounced', rank: 3 },
    'email.suppressed': { status: 'suppressed', rank: 4 },
    'email.complained': { status: 'complained', rank: 5 },
} as const;

type DeliveryWebhook = {
    type?: string;
    created_at?: string;
    data?: {
        email_id?: string;
        tags?: Record<string, string>;
        bounce?: { message?: string; subType?: string; type?: string };
        failed?: { reason?: string };
        suppressed?: { message?: string; type?: string };
    };
};

// Only webhook verification is used. The SDK constructor still requires an API-key argument.
const verifier = new Resend('webhook-verification').webhooks;

const formatDeliveryReason = (value: unknown): string | null => typeof value === 'string'
    ? value.replace(/\p{Cc}+/gu, ' ').trim().slice(0, 500) || null
    : null;

export async function receiveResendDelivery(c: Context<HonoCustomType>) {
    const webhookSecret = c.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) return c.text('Webhook signing secret is not configured', 503);

    const id = c.req.header('svix-id');
    const timestamp = c.req.header('svix-timestamp');
    const signature = c.req.header('svix-signature');
    if (!id || !timestamp || !signature) return c.text('Missing webhook signature headers', 400);

    let payload: DeliveryWebhook | null;
    const body = await c.req.text();
    try {
        payload = verifier.verify({ payload: body, headers: { id, timestamp, signature }, webhookSecret });
    } catch {
        return c.text('Invalid webhook signature or payload', 400);
    }
    const { type, created_at, data } = payload ?? {};
    if (typeof type !== 'string') return c.text('Invalid webhook event type', 400);
    if (!Object.hasOwn(eventTypes, type)) return c.json({ ok: true });
    const emailId = data?.email_id;
    const createdAt = typeof created_at === 'string' ? Date.parse(created_at) : NaN;
    if (!data || typeof emailId !== 'string' || !emailId || emailId.length > 128 || !Number.isFinite(createdAt)) {
        return c.text('Invalid webhook email ID or event time', 400);
    }

    const { status, rank } = eventTypes[type as keyof typeof eventTypes];
    const reason = formatDeliveryReason(
        data.bounce?.message || data.bounce?.subType || data.bounce?.type || data.failed?.reason
        || data.suppressed?.message || data.suppressed?.type,
    );
    const isAppSend = data.tags?.[resendMailSourceTag.name] === resendMailSourceTag.value;

    // The tag allows pending outcomes to arrive first. Untagged events need an existing ID match.
    await c.env.DB.prepare(`
        INSERT INTO resend_delivery (resend_email_id, delivery_status, delivery_reason, delivery_updated_at, delivery_rank)
        SELECT ?, ?, ?, ?, ? WHERE ? = 1 OR EXISTS (SELECT 1 FROM sendbox WHERE resend_email_id = ?)
        ON CONFLICT(resend_email_id) DO UPDATE SET
            delivery_status = excluded.delivery_status,
            delivery_reason = excluded.delivery_reason,
            delivery_updated_at = excluded.delivery_updated_at,
            delivery_rank = excluded.delivery_rank
        WHERE (excluded.delivery_updated_at > resend_delivery.delivery_updated_at
            OR (excluded.delivery_updated_at = resend_delivery.delivery_updated_at
                AND excluded.delivery_rank > resend_delivery.delivery_rank))
            AND (excluded.delivery_status <> 'delayed' OR resend_delivery.delivery_status = 'delayed')
            AND resend_delivery.delivery_status <> 'complained'
    `).bind(emailId, status, reason, new Date(createdAt).toISOString(), rank, isAppSend ? 1 : 0, emailId).run();

    return c.json({ ok: true });
}
