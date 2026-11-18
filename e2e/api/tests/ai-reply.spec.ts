import { expect, test } from '@playwright/test';
import { WORKER_URL } from '../../fixtures/test-helpers';

const draft = {
  subject: 'Order details',
  body: 'Could you send an update on the order?',
  intent: '确认收到，告知会核查。',
  targetLanguage: 'auto',
};

test('requires an authenticated mailbox, user, or administrator before drafting', async ({ request }) => {
  for (const [scope, status] of [['api', 401], ['user_api', 401], ['admin', 403]] as const) {
    const response = await request.post(`${WORKER_URL}/${scope}/ai_reply`, { data: draft });
    expect(response.status()).toBe(status);
  }
});

test('reports that drafting is unavailable without a configured DeepSeek key', async ({ request }) => {
  const settings = await request.get(`${WORKER_URL}/open_api/settings`);
  expect(settings.ok()).toBe(true);
  expect((await settings.json()).aiReply).toBeNull();

  const response = await request.post(`${WORKER_URL}/admin/ai_reply`, {
    headers: { 'x-admin-auth': 'e2e-admin-pass' },
    data: draft,
  });
  expect(response.status()).toBe(503);
  expect(response.headers()['cache-control']).toBe('no-store');
});

test('drafts from the incoming message when notes are blank or omitted', async ({ request }) => {
  const data: Omit<typeof draft, 'intent'> = {
    subject: draft.subject,
    body: draft.body,
    targetLanguage: draft.targetLanguage,
  };
  const headers = {
    'x-admin-auth': 'e2e-admin-pass',
    'x-test-deepseek-translation': 'true',
    'x-test-receive-only': 'true',
  };
  const generate = (input: Record<string, unknown>) => request.post(`${WORKER_URL}/admin/ai_reply`, {
    headers, data: input,
  });

  for (const input of [data, { ...data, intent: '' }, { ...data, intent: '  \n ' }]) {
    const response = await generate(input);
    expect(response.ok(), await response.text()).toBe(true);
    expect(await response.json()).toEqual({
      text: `Received: ${data.subject}`,
      chineseText: `预览：Received: ${data.subject}`,
    });
  }

  const guided = await generate(draft);
  expect(guided.ok(), await guided.text()).toBe(true);
  expect((await guided.json()).text).toBe(`Notes: ${draft.intent}`);
  expect((await generate({ ...data, intent: 7 })).status()).toBe(400);
  expect((await generate({ ...data, subject: '', body: '' })).status()).toBe(400);
  expect((await request.post(`${WORKER_URL}/user_api/ai_reply`, { headers, data })).status()).toBe(403);
});
