import { expect, test } from '@playwright/test';
import { FRONTEND_URL } from '../../../fixtures/test-helpers';

test('opens Sent below Inbox and updates submission and delivery results', async ({ page }) => {
  const messages: Record<string, unknown>[] = [
    { subject: 'Provider accepted', send_status: 'accepted' },
    { subject: 'Provider rejected', send_status: 'failed', delivery_reason: 'Sender domain verification failed.' },
    { subject: 'Provider timed out', send_status: 'unknown' },
    { subject: 'Historical submission' },
    { subject: 'Recipient rejected', send_status: 'accepted', delivery_status: 'bounced',
      delivery_reason: '550 5.1.1 Mailbox <recipient> unavailable.' },
    { subject: 'Delivery issue', send_status: 'accepted', delivery_status: 'failed',
      delivery_reason: 'Recipient server did not accept the message.' },
    { subject: 'Delivery retrying', send_status: 'accepted', delivery_status: 'delayed' },
    { subject: 'Delivery suppressed', send_status: 'accepted', delivery_status: 'suppressed' },
    { subject: 'Delivery complaint', send_status: 'accepted', delivery_status: 'complained' },
  ].map(({ subject, ...status }, id) => ({
    id: id + 1,
    address: 'sender@test.example.com',
    created_at: '2026-11-18 10:00:00',
    ...status,
    raw: JSON.stringify({ version: 'v2', to_mail: 'recipient@example.test', subject, content: 'Test submission' }),
  }));

  await page.addInitScript(() => localStorage.setItem('adminAuth', 'e2e-admin-pass'));
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.route(/\/admin\/sendbox(?:\?|$)/, route => route.fulfill({ json: { results: messages, count: messages.length } }));
  await page.goto(`${FRONTEND_URL}/en/manage/mail`);

  const links = page.locator('.workspace-rail .rail-links').first().getByRole('link');
  await expect(links.nth(0)).toHaveText('Inbox');
  const sent = links.nth(1);
  await expect(sent).toHaveText('Sent');
  await expect(page.locator('.admin-view-tabs')).not.toContainText('Sent');
  await sent.click();

  await expect(page).toHaveURL(/\/manage\/mail\/sent$/);
  await expect(sent).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Sent', exact: true })).toBeVisible();
  await expect(page.locator('.admin-view-tabs')).toHaveCount(0);
  await expect(page.locator('.sent-row .sent-status')).toHaveText([
    'Accepted', 'Failed', 'Unknown', 'Accepted', 'Bounced', 'Delivery failed', 'Delayed', 'Suppressed', 'Spam complaint',
  ]);
  await expect(page.locator('.sent-status-detail')).toContainText('The mail service accepted the message for delivery.');
  await expect(page.locator('.sent-delivery-reason')).toHaveCount(0);

  Object.assign(messages[0], { delivery_status: 'delivered', delivery_updated_at: '2026-11-18T11:02:00.000Z' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('.sent-row[aria-current="true"] .sent-status')).toHaveText('Delivered');
  await expect(page.locator('.sent-status-detail')).toContainText('The recipient’s mail server accepted the message.');
  await expect(page.getByText('Status updated', { exact: true })).toBeVisible();

  await page.locator('.sent-row').filter({ hasText: 'Provider rejected' }).click();
  await expect(page.locator('.sent-status-detail')).toContainText('The mail service rejected the message.');
  await expect(page.locator('.sent-delivery-reason')).toHaveText('Sender domain verification failed.');
  await page.locator('.sent-row').filter({ hasText: 'Provider timed out' }).click();
  await expect(page.locator('.sent-status-detail')).toContainText('The mail service did not return a definitive result.');
  await expect(page.locator('.sent-delivery-reason')).toHaveCount(0);

  await page.locator('.sent-row').filter({ hasText: 'Recipient rejected' }).click();
  await expect(page.locator('.sent-status-detail')).toContainText('Bounced');
  await expect(page.locator('.sent-delivery-reason')).toHaveText('550 5.1.1 Mailbox <recipient> unavailable.');
  await page.locator('.sent-row').filter({ hasText: 'Delivery issue' }).click();
  await expect(page.locator('.sent-status-detail')).toContainText('Delivery failed');
  await expect(page.locator('.sent-delivery-reason')).toHaveText('Recipient server did not accept the message.');
});
