import { expect, test } from '@playwright/test';

import { FRONTEND_URL } from '../../../fixtures/test-helpers';

test('waits for access settings before showing the Admin password dialog', async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __adminPasswordRendered?: boolean };
    testWindow.__adminPasswordRendered = false;

    const detectAdminPassword = () => {
      const textNodes = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
      while (textNodes.nextNode()) {
        if (textNodes.currentNode.textContent?.trim() === '管理员密码') {
          testWindow.__adminPasswordRendered = true;
          return;
        }
      }
    };

    new MutationObserver(detectAdminPassword).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  let releaseSettings!: () => void;
  const settingsPending = new Promise<void>((resolve) => {
    releaseSettings = resolve;
  });
  let markSettingsRequested!: () => void;
  const settingsRequested = new Promise<void>((resolve) => {
    markSettingsRequested = resolve;
  });

  await page.route('**/open_api/settings', async (route) => {
    markSettingsRequested();
    await settingsPending;
    await route.continue();
  });

  await page.goto(`${FRONTEND_URL}/zh/admin`);
  await settingsRequested;

  try {
    await expect(page.getByText('管理员密码', { exact: true })).toHaveCount(0);
  } finally {
    releaseSettings();
  }

  await expect(page.getByRole('navigation', { name: '管理后台' })).toBeVisible();
  await expect(page.getByText('管理员密码', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as Window & { __adminPasswordRendered?: boolean }
  ).__adminPasswordRendered)).toBe(false);
});

test('uses the standalone login page for user and administrator access', async ({ page }) => {
  await page.route('**/open_api/settings', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), disableAdminPasswordCheck: false } });
  });
  await page.goto(`${FRONTEND_URL}/zh/user`);
  await expect(page).toHaveURL(/(?:\/zh)?\/login$/);
  await expect(page.getByRole('main').getByRole('textbox', { name: '邮箱或管理员用户名' })).toBeVisible();
  await expect(page.locator('.workspace-rail')).toHaveCount(0);

  await page.goto(`${FRONTEND_URL}/zh/admin`);
  await expect(page).toHaveURL(/(?:\/zh)?\/login\?role=admin$/);
  await expect(page.getByRole('main').getByRole('textbox', { name: '邮箱或管理员用户名' })).toHaveValue('admin');
  await expect(page.locator('.workspace-rail')).toHaveCount(0);
});

test('reuses the administrator session in the inbox and user center', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('adminAuth', 'e2e-admin-workspace'));
  await page.goto(`${FRONTEND_URL}/zh/admin`);
  const workspace = page.getByRole('navigation', { name: '菜单', exact: true });

  const mail = page.waitForResponse(response => new URL(response.url()).pathname === '/admin/mails');
  await workspace.getByRole('link', { name: '收件箱', exact: true }).click();
  expect((await mail).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: '收件箱', exact: true })).toBeVisible();

  const addresses = page.waitForResponse(response => new URL(response.url()).pathname === '/admin/address');
  await workspace.getByRole('link', { name: '用户中心', exact: true }).click();
  expect((await addresses).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: '用户中心', exact: true })).toBeVisible();
  await expect(page.locator('.admin-workspace-heading').getByText('admin', { exact: true })).toBeVisible();
  await expect(page.locator('.login-screen')).toHaveCount(0);
});
