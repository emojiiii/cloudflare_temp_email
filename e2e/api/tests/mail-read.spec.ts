import { expect, test } from '@playwright/test';

import {
  WORKER_URL,
  WORKER_URL_ENV_OFF,
  createTestAddress,
  deleteAddress,
  seedTestMail,
} from '../../fixtures/test-helpers';

const headers = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

test.describe('Mail read status', () => {
  test('searches the mailbox before pagination and intersects with unread', async ({ request }) => {
    const mailbox = await createTestAddress(request, 'mail-search');
    const other = await createTestAddress(request, 'mail-search-other');
    const mailboxHeaders = headers(mailbox.jwt);
    const adminHeaders = { 'x-admin-auth': 'e2e-admin-pass' };
    const list = async (query: Record<string, string> = {}) => {
      const response = await request.get(`${WORKER_URL}/api/mails`, {
        headers: mailboxHeaders,
        params: { limit: '1', offset: '0', ...query },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    };

    try {
      await seedTestMail(request, mailbox.address, {
        from: 'history-sender@example.net',
        subject: '=?UTF-8?Q?Archive_=E9=82=AE=E4=BB=B6_=25=5F?=',
      });
      await seedTestMail(request, mailbox.address, { subject: 'More recent', text: 'Body marker only' });
      await seedTestMail(request, other.address, { subject: 'Archive 邮件' });

      const firstPage = await list();
      expect(firstPage.count).toBe(2);
      expect(firstPage.results[0].raw).toContain('More recent');
      const subject = await list({ q: 'ARCHIVE 邮件', unread: '1' });
      expect(subject.count).toBe(1);
      const [message] = subject.results;
      expect(message.source).toBe('history-sender@example.net');
      expect(message).not.toHaveProperty('search_subject');

      expect((await list({ q: '%_' })).results[0].id).toBe(message.id);
      expect((await list({ q: 'HISTORY-SENDER' })).results[0].id).toBe(message.id);
      expect((await list({ q: 'Body marker only' })).count).toBe(0);

      const adminSearch = await request.get(`${WORKER_URL}/admin/mails`, {
        headers: adminHeaders,
        params: { limit: '10', offset: '0', address: mailbox.address, q: 'ARCHIVE 邮件' },
      });
      expect((await adminSearch.json()).results.map((mail: { id: number }) => mail.id)).toEqual([message.id]);
      const markRead = await request.patch(`${WORKER_URL}/admin/mails/${message.id}/read`, {
        headers: adminHeaders, data: { isUnread: false },
      });
      expect((await markRead.json()).success).toBe(true);
      expect((await list({ q: 'ARCHIVE 邮件', unread: '1' })).count).toBe(0);
    } finally {
      await deleteAddress(request, mailbox.jwt);
      await deleteAddress(request, other.jwt);
    }
  });

  test('keeps historical mail read and switches one new mail state', async ({ request }) => {
    const mailbox = await createTestAddress(request, 'mail-read');
    try {
      const historical = await request.post(`${WORKER_URL}/__test/seed_mail`, {
        data: {
          address: mailbox.address,
          source: 'sender@test.example.com',
          raw: 'From: sender@test.example.com\r\nSubject: Historical\r\n\r\nHistorical',
        },
      });
      expect(historical.ok()).toBe(true);
      await seedTestMail(request, mailbox.address, { subject: 'New unread mail' });

      const list = await request.get(`${WORKER_URL}/api/mails?limit=10&offset=0`, {
        headers: headers(mailbox.jwt),
      });
      const mails = (await list.json()).results;
      expect(mails.find((mail: any) => mail.raw.includes('Historical')).is_unread).toBeNull();
      const unreadMail = mails.find((mail: any) => mail.raw.includes('New unread mail'));
      expect(unreadMail.is_unread).toBe(1);

      const markRead = await request.patch(`${WORKER_URL}/api/mails/${unreadMail.id}/read`, {
        headers: headers(mailbox.jwt),
        data: { isUnread: false },
      });
      expect((await markRead.json()).success).toBe(true);

      const updated = await request.get(`${WORKER_URL}/api/mails?limit=10&offset=0`, {
        headers: headers(mailbox.jwt),
      });
      const updatedMail = (await updated.json()).results.find((mail: any) => mail.id === unreadMail.id);
      expect(updatedMail.is_unread).toBe(0);

      const markUnread = await request.patch(`${WORKER_URL}/api/mails/${unreadMail.id}/read`, {
        headers: headers(mailbox.jwt),
        data: { isUnread: true },
      });
      expect((await markUnread.json()).success).toBe(true);

      const restored = await request.get(`${WORKER_URL}/api/mails?limit=10&offset=0`, {
        headers: headers(mailbox.jwt),
      });
      const restoredMail = (await restored.json()).results.find((mail: any) => mail.id === unreadMail.id);
      expect(restoredMail.is_unread).toBe(1);

      const invalid = await request.patch(`${WORKER_URL}/api/mails/${unreadMail.id}/read`, {
        headers: headers(mailbox.jwt),
        data: { isUnread: 'yes' },
      });
      expect(invalid.status()).toBe(400);
    } finally {
      await deleteAddress(request, mailbox.jwt);
    }
  });

  test('scopes the update and keeps disabled instances unchanged', async ({ request }) => {
    const first = await createTestAddress(request, 'mail-read-first');
    const second = await createTestAddress(request, 'mail-read-second');
    try {
      await seedTestMail(request, second.address, { subject: 'Second mail' });
      const secondList = await request.get(`${WORKER_URL}/api/mails?limit=10&offset=0`, {
        headers: headers(second.jwt),
      });
      const secondMail = (await secondList.json()).results[0];

      await request.patch(`${WORKER_URL}/api/mails/${secondMail.id}/read`, {
        headers: headers(first.jwt),
        data: { isUnread: false },
      });
      const unchanged = await request.get(`${WORKER_URL}/api/mails?limit=10&offset=0`, {
        headers: headers(second.jwt),
      });
      expect((await unchanged.json()).results[0].is_unread).toBe(1);

      const disabledMailbox = await createTestAddress(
        request,
        'mail-read-disabled',
        'test.example.com',
        WORKER_URL_ENV_OFF,
      );
      const oldList = await request.get(`${WORKER_URL_ENV_OFF}/api/mails?limit=10&offset=0`, {
        headers: headers(disabledMailbox.jwt),
      });
      expect(oldList.ok()).toBe(true);
      const disabledUpdate = await request.patch(`${WORKER_URL_ENV_OFF}/api/mails/1/read`, {
        headers: headers(disabledMailbox.jwt),
        data: { isUnread: false },
      });
      expect(disabledUpdate.status()).toBe(403);
    } finally {
      await deleteAddress(request, first.jwt);
      await deleteAddress(request, second.jwt);
    }
  });
});
