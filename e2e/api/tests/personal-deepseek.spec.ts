import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Jwt } from 'hono/utils/jwt';
import { createTestAddress, hashPassword, WORKER_URL } from '../../fixtures/test-helpers';

const credentials = `${WORKER_URL}/user_api/provider_credentials`;
const accountSettings = `${WORKER_URL}/user_api/settings`;
const translate = `${WORKER_URL}/user_api/translate`;
const receiveOnlyHeaders = { 'x-test-receive-only': 'true' };
const adminHeaders = { 'x-admin-auth': 'e2e-admin-pass' };

async function createAccount(request: APIRequestContext) {
  const email = `${randomUUID()}@test.example.com`;
  const password = hashPassword(randomUUID());
  const created = await request.post(`${WORKER_URL}/admin/users`, { headers: adminHeaders, data: { email, password } });
  expect(created.ok()).toBe(true);
  const login = await request.post(`${WORKER_URL}/user_api/login`, { data: { email, password } });
  expect(login.ok()).toBe(true);
  const { jwt } = await login.json();
  return { id: Jwt.decode(jwt).payload.user_id, headers: { ...receiveOnlyHeaders, 'x-user-token': jwt } };
}

test('personal DeepSeek credentials are private and required for receive-only accounts', async ({ request }) => {
  expect((await request.get(credentials, { headers: receiveOnlyHeaders })).status()).toBe(401);

  // An unsupported language exercises credential selection without contacting DeepSeek.
  const data = { text: 'Hello', provider: 'deepseek', targetLanguage: 'unsupported' };
  const adminCheck = await request.post(`${WORKER_URL}/admin/translate`, {
    headers: { ...receiveOnlyHeaders, ...adminHeaders }, data,
  });
  expect(adminCheck.status()).toBe(400);
  expect((await request.post(`${WORKER_URL}/admin/translate`, { headers: receiveOnlyHeaders, data })).status()).toBe(403);

  const account = await createAccount(request);
  const otherAccount = await createAccount(request);
  const mailbox = await createTestAddress(request, 'deepseek');
  try {
    const invalidSessionHeaders = { ...receiveOnlyHeaders, 'x-user-token': mailbox.jwt };
    expect((await request.get(credentials, { headers: invalidSessionHeaders })).status()).toBe(401);
    expect((await request.post(translate, { headers: invalidSessionHeaders, data })).status()).toBe(401);
    expect((await request.post(`${WORKER_URL}/api/translate`, {
      headers: { ...receiveOnlyHeaders, Authorization: `Bearer ${mailbox.jwt}` }, data,
    })).status()).toBe(403);

    const { headers } = account;
    const before = await request.get(accountSettings, { headers });
    expect(before.ok()).toBe(true);
    expect((await before.json()).translation).toBeNull();
    expect((await request.post(translate, { headers, data })).status()).toBe(503);

    const invalid = await request.put(`${credentials}/deepseek`, { headers, data: { apiKey: 'invalid key' } });
    expect(invalid.status()).toBe(400);
    const saved = await request.put(`${credentials}/deepseek`, { headers, data: { apiKey: 'sk-test-personal-key' } });
    expect(saved.ok()).toBe(true);
    expect(await saved.json()).toEqual({ deepseekConfigured: true });

    const current = await request.get(credentials, { headers });
    expect(current.headers()['cache-control']).toBe('private, no-store');
    expect(await current.json()).toEqual({ deepseekConfigured: true });
    const settings = await request.get(accountSettings, { headers });
    expect((await settings.json()).translation).toMatchObject({ provider: 'deepseek' });
    expect((await request.post(translate, { headers, data })).status()).toBe(400);

    const other = await request.get(credentials, { headers: otherAccount.headers });
    expect(await other.json()).toEqual({ deepseekConfigured: false });
    expect((await request.post(translate, { headers: otherAccount.headers, data })).status()).toBe(503);

    const removed = await request.delete(`${credentials}/deepseek`, { headers });
    expect(removed.ok()).toBe(true);
    expect(await removed.json()).toEqual({ deepseekConfigured: false });
    const after = await request.get(accountSettings, { headers });
    expect((await after.json()).translation).toBeNull();
    expect((await request.post(translate, { headers, data })).status()).toBe(503);
  } finally {
    await Promise.all([
      request.delete(`${WORKER_URL}/admin/users/${account.id}`, { headers: adminHeaders }),
      request.delete(`${WORKER_URL}/admin/users/${otherAccount.id}`, { headers: adminHeaders }),
      request.delete(`${WORKER_URL}/admin/delete_address/${mailbox.address_id}`, { headers: adminHeaders }),
    ]);
  }
});
