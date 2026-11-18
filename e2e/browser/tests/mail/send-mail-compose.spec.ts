import { test, expect, request as apiRequest, type Page } from '@playwright/test';
import {
  FRONTEND_URL,
  WORKER_URL,
  createTestAddress,
  deleteAddress,
  requestSendAccess,
} from '../../../fixtures/test-helpers';

const expectEditorOriginsToAlign = async (page: Page) => {
  const editorOriginDelta = await page.locator('.compose-textarea').evaluate((editor) => {
    const textareaElement = editor.querySelector('textarea');
    const placeholder = editor.querySelector('.n-input__placeholder');
    if (!textareaElement) throw new Error('compose textarea element not found');
    if (!placeholder) throw new Error('compose placeholder element not found');
    const textareaBox = textareaElement.getBoundingClientRect();
    const placeholderBox = placeholder.getBoundingClientRect();
    const textareaStyle = getComputedStyle(textareaElement);
    const placeholderStyle = getComputedStyle(placeholder);
    return {
      x: textareaBox.x + parseFloat(textareaStyle.paddingLeft)
        - placeholderBox.x - parseFloat(placeholderStyle.paddingLeft),
      y: textareaBox.y + parseFloat(textareaStyle.paddingTop)
        - placeholderBox.y - parseFloat(placeholderStyle.paddingTop),
    };
  });
  expect(Math.abs(editorOriginDelta.x)).toBeLessThan(1);
  expect(Math.abs(editorOriginDelta.y)).toBeLessThan(1);
};

test.describe('Send mail composer', () => {
  test('edits a draft, changes format, and previews HTML', async ({ page }) => {
    const api = await apiRequest.newContext();
    let jwt: string | undefined;

    try {
      const created = await createTestAddress(api, 'compose-ui');
      jwt = created.jwt;
      await requestSendAccess(api, jwt);

      await page.goto(`${FRONTEND_URL}/en/?jwt=${jwt}`);
      await page.getByRole('link', { name: 'Compose', exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Compose email', exact: true })).toBeVisible();
      await expect(page.locator('.composer-title')).toContainText(created.address);

      const options = page.locator('.composer-options');
      await expect(options.locator('#send-mail-sender-name')).toBeHidden();
      await expect(options.locator('#send-mail-recipient-name')).toBeHidden();
      await options.locator('summary').click();
      await expect(options.locator('#send-mail-sender-name')).toBeVisible();
      await expect(options.locator('#send-mail-recipient-name')).toBeVisible();
      await options.locator('summary').click();

      const textarea = page.locator('.compose-textarea textarea');
      await expectEditorOriginsToAlign(page);

      const recipient = page.getByRole('textbox', { name: /^Recipient address/ });
      const subject = page.getByRole('textbox', { name: /^Subject/ });
      await recipient.fill('recipient@test.example.com');
      await subject.fill('Composer preview');

      await page.getByText('HTML', { exact: true }).click();
      const htmlContent = [
        '<h1>Preview heading</h1><p>Preview body</p>',
        '<script>alert("xss")</script><img src="x" onerror="alert(1)">',
      ].join('');
      let previewDialogAppeared = false;
      page.on('dialog', async (dialog) => {
        previewDialogAppeared = true;
        await dialog.dismiss();
      });
      await textarea.fill(htmlContent);
      await page.getByRole('button', { name: 'Preview' }).click();

      const preview = page.locator('.compose-preview');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('Preview heading');
      await expect(preview.locator('script, [onerror]')).toHaveCount(0);
      expect(previewDialogAppeared).toBe(false);

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(preview).toBeHidden();
      await expect(recipient).toHaveValue('recipient@test.example.com');
      await expect(subject).toHaveValue('Composer preview');
      await expect(textarea).toHaveValue(htmlContent);

      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(`${FRONTEND_URL}/es/?jwt=${jwt}`);
      await page.getByRole('button', { name: 'Redactar', exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Redactar correo', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: /^Dirección del destinatario/ })).toBeVisible();
      await expect(page.getByText('Borrador guardado en este navegador', { exact: true })).toBeVisible();

      await page.getByText('HTML', { exact: true }).click();
      const previewButton = page.getByRole('button', { name: 'Vista previa', exact: true });
      await expect(previewButton).toBeVisible();
      const previewBox = await previewButton.boundingBox();
      expect(previewBox).not.toBeNull();
      expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(320);
    } finally {
      try {
        if (jwt) await deleteAddress(api, jwt);
      } finally {
        await api.dispose();
      }
    }
  });

  test('syncs favorites and the default sender across browser contexts', async ({ page, browser }) => {
    const api = await apiRequest.newContext();
    const preferencesUrl = `${WORKER_URL}/admin/send_mail/preferences`;
    const headers = { 'x-admin-auth': 'e2e-admin-pass' };
    let jwt: string | undefined;
    let alias: string | undefined;
    let previousDefault: string | null = null;

    try {
      const created = await createTestAddress(api, 'compose-admin');
      jwt = created.jwt;
      const saved = await api.get(preferencesUrl, { headers });
      expect(saved.ok()).toBe(true);
      previousDefault = (await saved.json()).defaultAddress;
      await page.addInitScript(() => localStorage.setItem('adminAuth', 'e2e-admin-pass'));
      await page.goto(`${FRONTEND_URL}/en/manage/compose`);

      await expect(page.getByRole('heading', { name: 'Compose email', exact: true })).toBeVisible();
      await expect(page.locator('.admin-view-tabs')).toHaveCount(0);
      await expectEditorOriginsToAlign(page);

      const sender = page.getByLabel('Sender address', { exact: false });
      await sender.fill(created.address);
      await page.getByText(created.address, { exact: true }).click();
      await expect(page.locator('.sender-picker')).toContainText(created.address);

      await page.getByRole('button', { name: 'Enter address manually' }).click();
      const domain = page.getByRole('combobox', { name: 'Sending domain' });
      const suffix = created.address.split('@')[1];
      await expect(domain.locator('option')).toHaveText([`@${suffix}`]);
      await domain.selectOption(suffix);
      alias = `favorite-${Date.now()}@${suffix}`;
      await page.getByLabel('Address prefix').fill(alias.split('@')[0]);
      await page.getByRole('button', { name: 'Add to favorite senders' }).click();
      await expect(page.getByRole('button', { name: 'Remove from favorite senders' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Set as default', exact: true }).click();
      await expect(page.getByText('Default sender', { exact: true })).toBeVisible();

      const otherBrowser = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        await otherBrowser.addInitScript(() => localStorage.setItem('adminAuth', 'e2e-admin-pass'));
        const otherPage = await otherBrowser.newPage();
        await otherPage.goto(`${FRONTEND_URL}/en/manage/compose`);
        await expect(otherPage.locator('.sender-picker')).toContainText(alias);
        await expect(otherPage.getByText('Default sender', { exact: true })).toBeVisible();
        await otherPage.getByLabel('Sender address', { exact: false }).fill(alias);
        await expect(otherPage.getByText('Favorite senders', { exact: true })).toBeVisible();
        await otherPage.locator('.n-base-select-menu').getByText(alias, { exact: true }).click();
      } finally {
        await otherBrowser.close();
      }

      await page.route('**/admin/send_mail', route => route.fulfill({ json: { status: 'ok' } }));
      await page.getByRole('textbox', { name: /^Recipient address/ }).fill('recipient@example.test');
      await page.getByRole('textbox', { name: /^Subject/ }).fill('Compose check');
      await page.locator('.compose-textarea textarea').fill('Testing the sender selection');
      const sendRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/admin/send_mail');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      expect((await sendRequest).postDataJSON().from_mail).toBe(alias);
      await expect(page.getByRole('textbox', { name: /^Subject/ })).toHaveValue('');
      await expect(page.getByText('Default sender', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Remove from favorite senders' }).click();
      await expect(page.getByRole('button', { name: 'Add to favorite senders' })).toHaveAttribute('aria-pressed', 'false');
    } finally {
      try {
        if (alias) {
          if (previousDefault) await api.patch(preferencesUrl, { headers, data: { action: 'set-default', address: previousDefault } });
          await api.patch(preferencesUrl, { headers, data: { action: 'remove', address: alias } });
        }
        if (jwt) await deleteAddress(api, jwt);
      } finally {
        await api.dispose();
      }
    }
  });
});
