import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Jwt } from 'hono/utils/jwt';
import { createTestAddress, deleteAddress, hashPassword, seedTestMail, WORKER_URL } from '../../fixtures/test-helpers';

const mockHeaders = { 'x-test-deepseek-translation': 'true' };
const adminHeaders = { ...mockHeaders, 'x-admin-auth': 'e2e-admin-pass' };
const plain = { provider: 'deepseek', targetLanguage: 'zh', text: 'Please touch base next Tuesday.' };

const mailboxHeaders = (jwt: string) => ({ ...mockHeaders, Authorization: `Bearer ${jwt}` });

async function seedMail(request: APIRequestContext, mailbox: Awaited<ReturnType<typeof createTestAddress>>) {
  await seedTestMail(request, mailbox.address, { text: plain.text });
  const response = await request.get(`${WORKER_URL}/api/mails?limit=1&offset=0`, { headers: mailboxHeaders(mailbox.jwt) });
  expect(response.ok()).toBe(true);
  return (await response.json()).results[0].id as number;
}

async function cacheCount(request: APIRequestContext, id: number) {
  const response = await request.get(`${WORKER_URL}/__test/mail_translation_count/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).count as number;
}

async function createAccount(request: APIRequestContext) {
  const email = `${randomUUID()}@test.example.com`;
  const password = hashPassword(randomUUID());
  const created = await request.post(`${WORKER_URL}/admin/users`, { headers: adminHeaders, data: { email, password } });
  expect(created.ok()).toBe(true);
  const login = await request.post(`${WORKER_URL}/user_api/login`, { data: { email, password } });
  expect(login.ok()).toBe(true);
  const { jwt } = await login.json();
  return { id: Jwt.decode(jwt).payload.user_id, headers: { ...mockHeaders, 'x-user-token': jwt } };
}

test('persists incoming translations by language, part, and exact input, then deletes them with the message', async ({ request }) => {
  const mailbox = await createTestAddress(request, 'translate');
  try {
    const mailId = await seedMail(request, mailbox);
    const headers = mailboxHeaders(mailbox.jwt);
    const post = (data: Record<string, unknown>) => request.post(`${WORKER_URL}/api/translate`, { headers, data });
    const translate = async (data: Record<string, unknown>) => {
      const response = await post(data);
      expect(response.ok(), await response.text()).toBe(true);
      expect(response.headers()['cache-control']).toBe('no-store');
      return response.json();
    };

    const incoming = { ...plain, mailId };
    const original = await translate(incoming);
    expect(await translate(incoming)).toEqual(original);
    const draft = await translate(plain);
    expect(draft).not.toEqual(original);
    expect(await translate(plain)).not.toEqual(draft);
    expect(await cacheCount(request, mailId)).toBe(1);

    const anotherLanguage = { ...incoming, targetLanguage: 'ru' };
    const russian = await translate(anotherLanguage);
    expect(russian).not.toEqual(original);
    expect(await translate(anotherLanguage)).toEqual(russian);

    const rich = {
      mailId,
      provider: plain.provider,
      targetLanguage: plain.targetLanguage,
      part: 1,
      segments: ['Please', 'touch base', 'next Tuesday.'],
      layout: [{ block: 0, anchored: false }, { block: 0, anchored: true }, { block: 0, anchored: false }],
    };
    const translated = await translate(rich);
    expect(translated.segments).toHaveLength(3);
    expect(await translate(rich)).toEqual(translated);
    const newLayout = { ...rich, layout: rich.layout.map(item => ({ ...item, anchored: false })) };
    const retranslated = await translate(newLayout);
    expect(retranslated).not.toEqual(translated);
    expect(await translate(newLayout)).toEqual(retranslated);

    const newSource = { ...incoming, text: 'Please follow up next Wednesday.' };
    const updated = await translate(newSource);
    expect(updated).not.toEqual(original);
    expect(await translate(newSource)).toEqual(updated);
    expect(await translate(anotherLanguage)).toEqual(russian);
    expect(await cacheCount(request, mailId)).toBe(3);
    expect((await post({ ...rich, part: 30 })).status()).toBe(400);

    const deleted = await request.delete(`${WORKER_URL}/api/mails/${mailId}`, { headers });
    expect(deleted.ok()).toBe(true);
    expect(await cacheCount(request, mailId)).toBe(0);
    expect((await post(incoming)).status()).toBe(404);
  } finally {
    await deleteAddress(request, mailbox.jwt);
  }
});

test('opening a message only reads existing scoped translations and works with a different browser language', async ({ request }) => {
  const mailbox = await createTestAddress(request, 'auto-cache');
  const otherMailbox = await createTestAddress(request, 'auto-other');
  try {
    const mailId = await seedMail(request, mailbox);
    const headers = mailboxHeaders(mailbox.jwt);
    const withoutProvider = { Authorization: `Bearer ${mailbox.jwt}` };
    const post = (data: Record<string, unknown>, requestHeaders: Record<string, string> = headers) =>
      request.post(`${WORKER_URL}/api/translate`, { headers: requestHeaders, data });
    const incoming = { ...plain, mailId };
    const lookup = { ...incoming, cacheOnly: true };
    const fallback = { ...lookup, fallbackToCachedLanguage: true };

    expect((await post(lookup)).status()).toBe(204);
    expect((await post(fallback, withoutProvider)).status()).toBe(204);
    expect((await post({ ...plain, cacheOnly: true })).status()).toBe(400);
    expect(await cacheCount(request, mailId)).toBe(0);

    const fr = await post({ ...incoming, targetLanguage: 'fr' });
    const ru = await post({ ...incoming, targetLanguage: 'ru' });
    expect(fr.ok(), await fr.text()).toBe(true);
    expect(ru.ok(), await ru.text()).toBe(true);
    const french = await fr.json();
    const russian = await ru.json();
    expect(french).not.toEqual(russian);

    expect((await post(lookup)).status()).toBe(204);
    const alternate = await post(fallback, withoutProvider);
    expect(alternate.ok(), await alternate.text()).toBe(true);
    expect(alternate.headers()['x-mail-translation-cache']).toBe('HIT');
    expect(await alternate.json()).toEqual({ ...russian, targetLanguage: 'ru' });
    expect(await (await post({ ...fallback, targetLanguage: 'fr' })).json()).toEqual({
      ...french, targetLanguage: 'fr',
    });

    expect((await post({ ...fallback, text: 'Different text.' })).status()).toBe(204);
    expect((await post(fallback, mailboxHeaders(otherMailbox.jwt))).status()).toBe(404);
    expect(await cacheCount(request, mailId)).toBe(2);
  } finally {
    await Promise.all([deleteAddress(request, mailbox.jwt), deleteAddress(request, otherMailbox.jwt)]);
  }
});

test('allows only authorized mailbox and account readers and keeps all translation scopes separate', async ({ request }) => {
  const mailbox = await createTestAddress(request, 'cache-owned');
  const otherMailbox = await createTestAddress(request, 'cache-other');
  const account = await createAccount(request);
  const otherAccount = await createAccount(request);
  try {
    const mailId = await seedMail(request, mailbox);
    const ownMailbox = mailboxHeaders(mailbox.jwt);
    const bound = await request.post(`${WORKER_URL}/user_api/bind_address`, {
      headers: { ...ownMailbox, ...account.headers },
    });
    expect(bound.ok()).toBe(true);
    const translate = (scope: string, headers: Record<string, string>) => request.post(`${WORKER_URL}/${scope}/translate`, {
      headers, data: { ...plain, mailId },
    });

    const mailboxResult = await translate('api', ownMailbox);
    const accountResult = await translate('user_api', account.headers);
    const adminResult = await translate('admin', adminHeaders);
    expect(mailboxResult.ok(), await mailboxResult.text()).toBe(true);
    expect(accountResult.ok(), await accountResult.text()).toBe(true);
    expect(adminResult.ok(), await adminResult.text()).toBe(true);
    const mailboxBody = await mailboxResult.json();
    const accountBody = await accountResult.json();
    const adminBody = await adminResult.json();
    expect(new Set([mailboxBody.text, accountBody.text, adminBody.text]).size).toBe(3);
    expect(await (await translate('api', ownMailbox)).json()).toEqual(mailboxBody);
    expect(await (await translate('user_api', account.headers)).json()).toEqual(accountBody);
    expect(await (await translate('admin', adminHeaders)).json()).toEqual(adminBody);
    expect((await translate('api', { Authorization: `Bearer ${mailbox.jwt}` })).status()).toBe(503);
    expect((await translate('api', mailboxHeaders(otherMailbox.jwt))).status()).toBe(404);
    expect((await translate('user_api', otherAccount.headers)).status()).toBe(404);
    expect(await cacheCount(request, mailId)).toBe(3);

    const deleted = await request.delete(`${WORKER_URL}/api/mails/${mailId}`, { headers: ownMailbox });
    expect(deleted.ok()).toBe(true);
    expect(await cacheCount(request, mailId)).toBe(0);
  } finally {
    await Promise.all([
      request.delete(`${WORKER_URL}/admin/users/${account.id}`, { headers: adminHeaders }),
      request.delete(`${WORKER_URL}/admin/users/${otherAccount.id}`, { headers: adminHeaders }),
      deleteAddress(request, mailbox.jwt),
      deleteAddress(request, otherMailbox.jwt),
    ]);
  }
});
