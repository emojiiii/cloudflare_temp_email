import { createHmac, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { WORKER_URL, WORKER_URL_ENV_OFF } from '../../fixtures/test-helpers';

const endpoint = '/open_api/resend_webhook';
const signingKey = Buffer.from('e2e-resend-webhook-fixture-key');

const webhookHeaders = (body: string, timestamp = Math.floor(Date.now() / 1000)) => {
  const id = `msg_${randomUUID()}`;
  const digest = createHmac('sha256', signingKey).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'Content-Type': 'application/json',
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${digest}`,
  };
};

test('accepts the signed Resend payload and rejects changed or stale requests', async ({ request }) => {
  const data = JSON.stringify({
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: { email_id: randomUUID(), bounce: { message: 'Synthetic recipient rejection' } },
  }, null, 2);
  const url = `${WORKER_URL}${endpoint}`;
  const headers = webhookHeaders(data);

  expect((await request.post(url, { headers, data })).status()).toBe(200);
  expect((await request.post(url, { headers, data: `${data}\n` })).status()).toBe(400);
  const stale = webhookHeaders(data, Number(headers['svix-timestamp']) - 600);
  expect((await request.post(url, { headers: stale, data })).status()).toBe(400);
  expect((await request.post(url, { data })).status()).toBe(400);
  expect((await request.post(url, { data: 'x'.repeat(66_000) })).status()).toBe(413);
  expect((await request.post(`${WORKER_URL_ENV_OFF}${endpoint}`, { headers, data })).status()).toBe(503);
});
