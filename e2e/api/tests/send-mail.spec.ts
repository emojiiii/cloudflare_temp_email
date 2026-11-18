import { test, expect } from '@playwright/test';
import {
  createTestAddress,
  deleteAddress,
  deleteAllMailpitMessages,
  onMailpitMessage,
  seedTestMail,
  WORKER_URL,
} from '../../fixtures/test-helpers';

test.describe('Send Mail via SMTP', () => {
  test.beforeEach(async ({ request }) => {
    await deleteAllMailpitMessages(request);
  });

  test('send HTML email and verify in Mailpit', async ({ request }) => {
    const { jwt, address } = await createTestAddress(request, 'sender-test');
    const subject = `E2E Test ${Date.now()}`;
    const htmlContent = '<h1>Hello</h1><p>This is an <b>E2E test</b> email.</p>';

    // Start listening for the message BEFORE sending
    const listener = onMailpitMessage((m) => m.Subject === subject);
    await listener.ready;

    // Send mail via worker API
    const sendRes = await request.post(`${WORKER_URL}/api/send_mail`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: {
        from_name: 'E2E Sender',
        to_name: 'E2E Recipient',
        to_mail: 'recipient@test.example.com',
        subject,
        content: htmlContent,
        is_html: true,
      },
    });
    expect(sendRes.ok()).toBe(true);

    // Wait for Mailpit WebSocket "new" event — no polling
    const mail = await listener.message;
    expect(mail.From.Address).toBe(address);
    expect(mail.To[0].Address).toBe('recipient@test.example.com');

    // Balance should auto-initialize to 10 and then decrement to 9 after sending.
    const settingsRes = await request.get(`${WORKER_URL}/api/settings`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(settingsRes.ok()).toBe(true);
    const settings = await settingsRes.json();
    expect(settings.send_balance).toBe(9);

    // Cleanup
    await deleteAddress(request, jwt);
  });

  test('external sending stores mail fields without bearer credentials', async ({ request }) => {
    const { jwt, address } = await createTestAddress(request, 'external-sender');
    const mail = {
      from_name: 'External sender', to_name: 'Recipient', to_mail: 'recipient@test.example.com',
      subject: `External ${Date.now()}`, content: 'External message', is_html: false,
    };
    try {
      const listener = onMailpitMessage(message => message.Subject === mail.subject);
      await listener.ready;
      const response = await request.post(`${WORKER_URL}/external/api/send_mail`, {
        data: { ...mail, token: jwt, extra_credential: 'must-not-be-stored' },
      });
      expect(response.ok(), await response.text()).toBe(true);
      expect((await listener.message).From.Address).toBe(address);
      const sendbox = await request.get(`${WORKER_URL}/api/sendbox?limit=20&offset=0`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(sendbox.ok()).toBe(true);
      const { results } = await sendbox.json();
      expect(results).toHaveLength(1);
      expect(results[0].send_status).toBe('accepted');
      const stored = JSON.parse(results[0].raw);
      expect(stored).toMatchObject(mail);
      expect(stored).not.toHaveProperty('token');
      expect(stored).not.toHaveProperty('extra_credential');
    } finally {
      await deleteAddress(request, jwt);
    }
  });

  test('marks the original mailbox message only after an accepted reply', async ({ request }) => {
    const mailbox = await createTestAddress(request, 'reply-status');
    const other = await createTestAddress(request, 'other-reply-status');
    const auth = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });
    const inbox = async (jwt: string) => {
      const response = await request.get(`${WORKER_URL}/api/mails?limit=20&offset=0`, { headers: auth(jwt) });
      expect(response.ok()).toBe(true);
      return (await response.json()).results[0];
    };
    const reply = (mail: { id: number; message_id: string }) => request.post(`${WORKER_URL}/api/send_mail`, {
      headers: auth(mailbox.jwt),
      data: {
        from_name: '', to_name: '', to_mail: 'sender@test.example.com',
        subject: 'Re: Reply status', content: 'A reply', is_html: false,
        reply_mail_id: mail.id, in_reply_to: mail.message_id,
      },
    });
    try {
      await seedTestMail(request, mailbox.address, { subject: 'Reply status' });
      await seedTestMail(request, other.address, { subject: 'Other reply status' });
      const original = await inbox(mailbox.jwt);
      const foreign = await inbox(other.jwt);
      expect(original.is_replied).toBe(0);
      expect(foreign.is_replied).toBe(0);

      expect((await reply({ ...original, id: -1 })).status()).toBe(400);
      expect((await inbox(mailbox.jwt)).is_replied).toBe(0);
      expect((await reply(foreign)).ok()).toBe(true);
      expect((await inbox(other.jwt)).is_replied).toBe(0);

      expect((await reply(original)).ok()).toBe(true);
      expect((await inbox(mailbox.jwt)).is_replied).toBe(1);
      const sendbox = await request.get(`${WORKER_URL}/api/sendbox?limit=20&offset=0`, { headers: auth(mailbox.jwt) });
      expect(sendbox.ok()).toBe(true);
      expect((await sendbox.json()).results.map(row => row.send_status)).toEqual(['accepted', 'accepted']);
    } finally {
      await deleteAddress(request, mailbox.jwt);
      await deleteAddress(request, other.jwt);
    }
  });
});
