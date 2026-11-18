import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Jwt } from 'hono/utils/jwt';
import { WORKER_URL } from '../../fixtures/test-helpers';

const url = `${WORKER_URL}/admin/send_mail/preferences`;

test('requires an identified administrator even when admin password checks are disabled', async ({ request }) => {
  expect((await request.get(url)).status()).toBe(403);
  expect((await request.patch(url, {
    data: { action: 'add', address: 'open-admin@test.example.com' },
  })).status()).toBe(403);
});

test('isolates sender preferences and leaves a single default after concurrent updates', async ({ request }) => {
  const id = Date.now();
  const headersFor = async (email: string) => ({
    'x-user-access-token': await Jwt.sign({
      user_id: id,
      user_email: email,
      user_role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }, 'e2e-test-secret-key', 'HS256'),
  });
  const headers = await headersFor(`${randomUUID()}@example.com`);
  const otherHeaders = await headersFor(`${randomUUID()}@example.com`);
  const primary = 'primary@test.example.com';
  const secondary = 'secondary@test.example.com';
  try {
    const updates = await Promise.all([primary, secondary].map(address => request.patch(url, {
      headers, data: { action: 'set-default', address },
    })));
    expect(updates.map(response => response.status())).toEqual([200, 200]);

    const response = await request.get(url, { headers });
    expect(response.ok()).toBe(true);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const prefs = await response.json();
    expect([...prefs.addresses].sort()).toEqual([primary, secondary]);
    expect([primary, secondary]).toContain(prefs.defaultAddress);

    const other = await request.get(url, { headers: otherHeaders });
    expect(other.ok()).toBe(true);
    expect(await other.json()).toEqual({ addresses: [], defaultAddress: null });

    const removed = await request.patch(url, {
      headers, data: { action: 'remove', address: prefs.defaultAddress },
    });
    expect(removed.ok()).toBe(true);
    expect(await removed.json()).toEqual({
      addresses: [prefs.defaultAddress === primary ? secondary : primary],
      defaultAddress: null,
    });
  } finally {
    await Promise.all([primary, secondary].map(address => request.patch(url, {
      headers, data: { action: 'remove', address },
    })));
  }
});
