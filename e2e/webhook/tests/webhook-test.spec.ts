import { expect, test } from '@playwright/test';
import { FRONTEND_URL } from '../../fixtures/test-helpers';

for (const [locale, testLabel, specified, mailId, invalid] of [
  ['zh', '测试', '指定 ID', '邮件 ID', '请输入有效的正整数邮件 ID'],
  ['en', 'Test', 'Specify ID', 'Email ID', 'Enter a valid positive integer email ID'],
  ['es', 'Prueba', 'Especificar ID', 'ID del correo', 'Introduce un ID de correo válido que sea un entero positivo'],
  ['pt-BR', 'Teste', 'Especificar ID', 'ID do e-mail', 'Digite um ID de e-mail válido que seja um número inteiro positivo'],
  ['ja', 'テスト', 'ID を指定', 'メール ID', '有効な正の整数のメール ID を入力してください'],
  ['de', 'Test', 'ID angeben', 'E-Mail-ID', 'Gib eine gültige positive ganze Zahl als E-Mail-ID ein'],
]) {
  test(`Webhook test dialog translations: ${locale}`, async ({ page }) => {
    await page.route('**/admin/mail_webhook/settings', route => route.fulfill({
      json: { enabled: true, url: 'https://example.com/webhook', method: 'POST', headers: '{}', body: '{}' },
    }));
    await page.goto(`${FRONTEND_URL}/${locale}/manage/settings/webhook`);
    await page.getByRole('button', { name: testLabel, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(specified, { exact: true }).click();
    await expect(dialog.getByPlaceholder(mailId, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: testLabel, exact: true }).click();
    await expect(page.getByText(invalid, { exact: true })).toBeVisible();
  });
}

test('Webhook test dialog selects random or specified email', async ({ page }) => {
  const requests: any[] = [];
  let fail = false;
  await page.route('**/admin/mail_webhook/settings', route => route.fulfill({
    json: { enabled: true, url: 'https://example.com/webhook', method: 'POST', headers: '{}', body: '{}' },
  }));
  await page.route('**/admin/mail_webhook/test', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: fail ? 404 : 200, body: fail ? 'Mail not found' : '{"success":true}' });
  });
  await page.goto(`${FRONTEND_URL}/zh/manage/settings/webhook`);
  const open = page.locator('#app').getByRole('button', { name: '测试', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('随机邮件', { exact: true })).toBeVisible();
  await expect(dialog.getByPlaceholder('邮件 ID', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(requests).toHaveLength(0);
  await open.click();
  await dialog.getByRole('button', { name: '测试', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toHaveProperty('mail_id');
  await open.click();
  await dialog.getByText('指定 ID', { exact: true }).click();
  await dialog.getByRole('button', { name: '测试', exact: true }).click();
  await expect(page.getByText('请输入有效的正整数邮件 ID', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  await dialog.getByPlaceholder('邮件 ID', { exact: true }).fill('123');
  fail = true;
  await dialog.getByRole('button', { name: '测试', exact: true }).click();
  await expect(page.getByText(/Mail not found/).first()).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(requests[1].mail_id).toBe(123);
  fail = false;
  await dialog.getByRole('button', { name: '测试', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(requests[2].mail_id).toBe(123);
  await open.click();
  await dialog.getByText('随机邮件', { exact: true }).click();
  await dialog.getByRole('button', { name: '测试', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(requests[3]).not.toHaveProperty('mail_id');
});

test('A missing destination can be configured before enabling delivery', async ({ page }) => {
  const saved: unknown[] = [];
  await page.route('**/admin/mail_webhook/settings', route => {
    if (route.request().method() === 'POST') {
      saved.push(route.request().postDataJSON());
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { enabled: false, url: '', method: 'POST', headers: '{}', body: '{}' } });
  });

  await page.goto(`${FRONTEND_URL}/zh/manage/settings/webhook`);
  const status = page.getByRole('status').filter({ hasText: '未配置接收地址' });
  await expect(status).toBeVisible();
  const save = page.getByRole('button', { name: '保存', exact: true });
  const url = page.getByRole('textbox', { name: 'URL', exact: true });
  await expect(url).toBeEditable();
  await expect(page.getByRole('button', { name: '测试', exact: true })).toBeDisabled();
  await url.fill('https://example.invalid/webhook');
  await save.click();
  await expect(page.getByText('投递已暂停', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: '启用', exact: true }).click();
  await save.click();
  await expect(page.getByText('投递已启用', { exact: true })).toBeVisible();
  expect(saved).toMatchObject([
    { enabled: false, url: 'https://example.invalid/webhook' },
    { enabled: true, url: 'https://example.invalid/webhook' },
  ]);
});
