import { test, expect } from '@playwright/test';
import { loadApp } from './helpers.js';

// Helper: register a fresh user and return their credentials
async function registerUser(page, suffix) {
  const username = `testuser_${suffix}_${Date.now()}`;
  const password = 'password123';
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="password"]').fill(password);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.nav-user')).toBeVisible();
  return { username, password };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('robowar_token');
    localStorage.removeItem('robowar_user');
    localStorage.removeItem('robowar_is_admin');
  });
  await loadApp(page);
});

// ── Forgot password link ─────────────────────────────────────

test('auth modal shows Forgot password link in login mode', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-forgot')).toBeVisible();
});

test('auth modal hides Forgot password link in register mode', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await expect(page.locator('.auth-forgot')).not.toBeVisible();
});

test('clicking Forgot password shows forgot-password form', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-forgot').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Forgot Password');
});

test('forgot-password form has email field', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-forgot').click();
  await expect(page.locator('.auth-modal input[type="email"]')).toBeVisible();
});

test('forgot-password form has Send Reset Link button', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-forgot').click();
  await expect(page.locator('.auth-submit')).toContainText('Send Reset Link');
});

test('forgot-password form has Back to Login link', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-forgot').click();
  await expect(page.locator('.auth-switch')).toContainText('Back to Login');
});

test('forgot-password Back to Login returns to login modal', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-forgot').click();
  await page.locator('.auth-switch').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Log In');
});

test('forgot-password submitting shows confirmation', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-forgot').click();
  await page.locator('.auth-modal input[type="email"]').fill('nobody@example.com');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Email Sent');
});

// ── Change password ──────────────────────────────────────────

test('logged-in nav shows Change PW button', async ({ page }) => {
  await registerUser(page, 'changepw');
  await expect(page.locator('.nav-auth button', { hasText: 'Change PW' })).toBeVisible();
});

test('logged-out nav does not show Change PW button', async ({ page }) => {
  await expect(page.locator('.nav-auth button', { hasText: 'Change PW' })).not.toBeVisible();
});

test('clicking Change PW shows change password form', async ({ page }) => {
  await registerUser(page, 'changepw2');
  await page.locator('.nav-auth button', { hasText: 'Change PW' }).click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Change Password');
});

test('change password form has current password field', async ({ page }) => {
  await registerUser(page, 'changepw3');
  await page.locator('.nav-auth button', { hasText: 'Change PW' }).click();
  const inputs = page.locator('.auth-modal input[type="password"]');
  await expect(inputs).toHaveCount(3);
});

test('change password with wrong current password shows error', async ({ page }) => {
  await registerUser(page, 'changepw4');
  await page.locator('.nav-auth button', { hasText: 'Change PW' }).click();
  await page.locator('.auth-modal input[type="password"]').nth(0).fill('wrongpassword');
  await page.locator('.auth-modal input[type="password"]').nth(1).fill('newpassword123');
  await page.locator('.auth-modal input[type="password"]').nth(2).fill('newpassword123');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toBeVisible();
});

test('change password with mismatched new passwords shows error', async ({ page }) => {
  await registerUser(page, 'changepw5');
  await page.locator('.nav-auth button', { hasText: 'Change PW' }).click();
  await page.locator('.auth-modal input[type="password"]').nth(0).fill('password123');
  await page.locator('.auth-modal input[type="password"]').nth(1).fill('newpassword123');
  await page.locator('.auth-modal input[type="password"]').nth(2).fill('differentpassword');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toContainText('match');
});

test('change password success shows confirmation', async ({ page }) => {
  await registerUser(page, 'changepw6');
  await page.locator('.nav-auth button', { hasText: 'Change PW' }).click();
  await page.locator('.auth-modal input[type="password"]').nth(0).fill('password123');
  await page.locator('.auth-modal input[type="password"]').nth(1).fill('newpassword456');
  await page.locator('.auth-modal input[type="password"]').nth(2).fill('newpassword456');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Password Changed');
});

test('change password cancel returns to robots page', async ({ page }) => {
  await registerUser(page, 'changepw7');
  await page.locator('.nav-auth button', { hasText: 'Change PW' }).click();
  await page.locator('.auth-switch', { hasText: 'Cancel' }).click();
  await expect(page.locator('.page-title')).toHaveText('My Robots');
});

// ── Admin nav ────────────────────────────────────────────────

test('regular user does not see Admin button in nav', async ({ page }) => {
  await registerUser(page, 'notadmin');
  await expect(page.locator('.nav-admin')).not.toBeVisible();
});

test('logged-out user does not see Admin button in nav', async ({ page }) => {
  await expect(page.locator('.nav-admin')).not.toBeVisible();
});

// ── Banned user ──────────────────────────────────────────────

test('banned user sees ban message on login', async ({ page }) => {
  // We can't ban via UI without admin, so test the error message format
  // by intercepting the API response
  await page.route('/api/auth/login', route => {
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Your account has been banned.' }),
    });
  });
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-modal input[type="text"]').fill('banneduser');
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toContainText('banned');
});
