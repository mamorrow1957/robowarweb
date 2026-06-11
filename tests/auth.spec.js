import { test, expect, request } from '@playwright/test';
import { loadApp } from './helpers.js';

test.afterAll(async () => {
  const ctx = await request.newContext({ baseURL: 'http://localhost:3001' });
  await ctx.delete('/api/test/cleanup');
  await ctx.dispose();
});

test.beforeEach(async ({ page }) => {
  // Clear auth state before each test
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('robowar_token');
    localStorage.removeItem('robowar_user');
  });
  await loadApp(page);
});

// ── Logged-out state ─────────────────────────────────────────

test('nav shows Log In button when logged out', async ({ page }) => {
  await expect(page.locator('.nav-auth button', { hasText: 'Log In' })).toBeVisible();
});

test('nav does not show username when logged out', async ({ page }) => {
  await expect(page.locator('.nav-user')).not.toBeVisible();
});

test('nav does not show Log Out button when logged out', async ({ page }) => {
  await expect(page.locator('.nav-auth button', { hasText: 'Log Out' })).not.toBeVisible();
});

test('auth nudge is visible on My Robots when logged out', async ({ page }) => {
  await expect(page.locator('.auth-nudge')).toBeVisible();
});

// ── Auth modal ───────────────────────────────────────────────

test('clicking Log In opens the auth modal', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-overlay')).toBeVisible();
  await expect(page.locator('.auth-modal')).toBeVisible();
});

test('auth modal has username field', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-modal input[type="text"]')).toBeVisible();
});

test('auth modal has password field', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-modal input[type="password"]')).toBeVisible();
});

test('auth modal has submit button', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-submit')).toBeVisible();
});

test('auth modal has toggle button to switch modes', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-switch')).toBeVisible();
});

test('auth modal starts in Log In mode', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Log In');
});

test('toggle switches modal to Register mode', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Create Account');
});

test('toggle switches back to Log In mode', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-switch').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Log In');
});

test('login with wrong credentials shows error', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-modal input[type="text"]').fill('nosuchuser');
  await page.locator('.auth-modal input[type="password"]').fill('wrongpassword');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toBeVisible();
});

test('password too short shows error on register', async ({ page }) => {
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill('newuser');
  await page.locator('.auth-modal input[type="password"]').fill('abc');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toBeVisible();
});

// ── Registration & login flow ────────────────────────────────

test('registering with new username logs in and shows username in nav', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await expect(page.locator('.nav-user')).toBeVisible();
  await expect(page.locator('.nav-user')).toContainText(username);
});

test('after login auth modal is dismissed', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-overlay')).not.toBeVisible();
});

test('after login Log Out button is shown', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await expect(page.locator('.nav-auth button', { hasText: 'Log Out' })).toBeVisible();
});

test('after login Log In button is gone', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await expect(page.locator('.nav-auth button', { hasText: 'Log In' })).not.toBeVisible();
});

test('after login auth nudge is hidden', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-nudge')).not.toBeVisible();
});

test('logging out shows Log In button again', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  await expect(page.locator('.nav-auth button', { hasText: 'Log In' })).toBeVisible();
});

test('logging out removes username from nav', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  await expect(page.locator('.nav-user')).not.toBeVisible();
});

test('duplicate username shows error on register', async ({ page }) => {
  const username = `testuser_${Date.now()}`;
  // Register once
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  // Log out
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  // Try to register same username again
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toBeVisible();
});
