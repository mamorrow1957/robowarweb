import { test, expect, request } from '@playwright/test';
import { loadApp } from './helpers.js';

test.afterAll(async () => {
  const ctx = await request.newContext({ baseURL: 'http://localhost:3001' });
  await ctx.delete('/api/test/cleanup');
  await ctx.dispose();
});

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
    localStorage.removeItem('robowar_has_email');
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

// ── Account modal ────────────────────────────────────────────

test('logged-in nav shows Account button', async ({ page }) => {
  await registerUser(page, 'acct1');
  await expect(page.locator('.nav-auth button', { hasText: 'Account' })).toBeVisible();
});

test('logged-out nav does not show Account button', async ({ page }) => {
  await expect(page.locator('.nav-auth button', { hasText: 'Account' })).not.toBeVisible();
});

test('clicking Account shows Account Settings modal', async ({ page }) => {
  await registerUser(page, 'acct2');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Account Settings');
});

test('Account modal has Email and Password tabs', async ({ page }) => {
  await registerUser(page, 'acct3');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await expect(page.locator('.account-tab', { hasText: 'Email' })).toBeVisible();
  await expect(page.locator('.account-tab', { hasText: 'Password' })).toBeVisible();
});

test('Account modal Email tab has email input', async ({ page }) => {
  await registerUser(page, 'acct4');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await expect(page.locator('.auth-modal input[type="email"]')).toBeVisible();
});

test('Account modal email update shows success message', async ({ page }) => {
  await registerUser(page, 'acct5');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.auth-modal input[type="email"]').fill(`acct5_${Date.now()}@example.com`);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-success')).toBeVisible();
});

test('Account modal close returns to robots page', async ({ page }) => {
  await registerUser(page, 'acct6');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.auth-switch', { hasText: 'Close' }).click();
  await expect(page.locator('.page-title')).toHaveText('My Robots');
});

// ── Password change ──────────────────────────────────────────

test('change password with wrong current password shows error', async ({ page }) => {
  await registerUser(page, 'pw1');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.account-tab', { hasText: 'Password' }).click();
  await page.locator('.auth-modal input[type="password"]').nth(0).fill('wrongpassword');
  await page.locator('.auth-modal input[type="password"]').nth(1).fill('newpassword123');
  await page.locator('.auth-modal input[type="password"]').nth(2).fill('newpassword123');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toBeVisible();
});

test('change password with mismatched new passwords shows error', async ({ page }) => {
  await registerUser(page, 'pw2');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.account-tab', { hasText: 'Password' }).click();
  await page.locator('.auth-modal input[type="password"]').nth(0).fill('password123');
  await page.locator('.auth-modal input[type="password"]').nth(1).fill('newpassword123');
  await page.locator('.auth-modal input[type="password"]').nth(2).fill('differentpassword');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toContainText('match');
});

test('change password success shows confirmation', async ({ page }) => {
  await registerUser(page, 'pw3');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.account-tab', { hasText: 'Password' }).click();
  await page.locator('.auth-modal input[type="password"]').nth(0).fill('password123');
  await page.locator('.auth-modal input[type="password"]').nth(1).fill('newpassword456');
  await page.locator('.auth-modal input[type="password"]').nth(2).fill('newpassword456');
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-success')).toBeVisible();
});

// ── Email nudge ──────────────────────────────────────────────

test('email nudge is visible when logged in with no email', async ({ page }) => {
  await registerUser(page, 'nudge1');
  await expect(page.locator('.email-nudge')).toBeVisible();
});

test('email nudge is not visible when logged out', async ({ page }) => {
  await expect(page.locator('.email-nudge')).not.toBeVisible();
});

test('email nudge disappears after setting email', async ({ page }) => {
  await registerUser(page, 'nudge2');
  await expect(page.locator('.email-nudge')).toBeVisible();
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.auth-modal input[type="email"]').fill(`nudge2_${Date.now()}@example.com`);
  await page.locator('.auth-submit').click();
  await page.locator('.auth-switch', { hasText: 'Close' }).click();
  await expect(page.locator('.email-nudge')).not.toBeVisible();
});

test('email nudge links to Account modal', async ({ page }) => {
  await registerUser(page, 'nudge3');
  await page.locator('.nudge-link').click();
  await expect(page.locator('.auth-modal h2')).toHaveText('Account Settings');
});

// ── Email uniqueness ─────────────────────────────────────────

test('registering duplicate email shows error', async ({ page }) => {
  const email = `dupe_${Date.now()}@example.com`;
  // Register first user with email via Account modal
  await registerUser(page, 'dupe1');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.auth-modal input[type="email"]').fill(email);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-success')).toBeVisible();
  await page.locator('.auth-switch', { hasText: 'Close' }).click();
  // Log out
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  // Register second user and try to use same email
  await registerUser(page, 'dupe2');
  await page.locator('.nav-auth button', { hasText: 'Account' }).click();
  await page.locator('.auth-modal input[type="email"]').fill(email);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toBeVisible();
});

// ── Server-side logout ───────────────────────────────────────

test('after logout token is revoked and cannot be reused', async ({ page }) => {
  await registerUser(page, 'revoke1');
  // Capture the token before logout
  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
  // Log out (calls server-side revocation)
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  // Try using the old token directly against the API
  const res = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.status;
  }, token);
  expect(res).toBe(401);
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

// ── Account lockout ──────────────────────────────────────────

test('account is locked after 5 failed login attempts', async ({ page }) => {
  const { username, password } = await registerUser(page, 'locktest');
  // Log out and wait for Log In button to confirm logout completed
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  await page.locator('.nav-auth button', { hasText: 'Log In' }).waitFor();
  // Attempt login with wrong password 5 times via API
  for (let i = 0; i < 5; i++) {
    const status = await page.evaluate(async ({ username }) => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'wrongpassword' }),
      });
      return r.status;
    }, { username });
    expect(status).toBeLessThanOrEqual(403); // 401 for wrong pw, 403 when locked
  }
  // Now try the correct password — should be locked
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="password"]').fill(password);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.auth-error')).toContainText('locked');
});

test('unlock endpoint resets lock so user can log in again', async ({ page }) => {
  const { username, password } = await registerUser(page, 'lockunlock');
  // Log out and wait for Log In button to confirm logout completed
  await page.locator('.nav-auth button', { hasText: 'Log Out' }).click();
  await page.locator('.nav-auth button', { hasText: 'Log In' }).waitFor();
  // Trigger lockout via API
  for (let i = 0; i < 5; i++) {
    await page.evaluate(async ({ username }) => {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'wrongpassword' }),
      });
    }, { username });
  }
  // Get admin token (admin first-login flow — CI fresh DB has password_set=0)
  const adminToken = await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: '' }),
    });
    if (!r.ok) throw new Error(`Admin login failed: ${r.status}`);
    const data = await r.json();
    if (!data.token) throw new Error('No token in admin login response');
    return data.token;
  });
  // Fetch user list to find user id
  const userId = await page.evaluate(async ({ token, username }) => {
    const r = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Admin users fetch failed: ${r.status}`);
    const users = await r.json();
    const user = users.find(u => u.username === username);
    if (!user) throw new Error(`User ${username} not found in admin list`);
    return user.id;
  }, { token: adminToken, username });
  // Verify locked
  const lockedStatus = await page.evaluate(async ({ token, id }) => {
    const r = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    const users = await r.json();
    return users.find(u => u.id === id)?.is_locked;
  }, { token: adminToken, id: userId });
  expect(lockedStatus).toBe(1);
  // Unlock via admin API
  const unlockStatus = await page.evaluate(async ({ token, id }) => {
    const r = await fetch(`/api/admin/users/${id}/unlock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.status;
  }, { token: adminToken, id: userId });
  expect(unlockStatus).toBe(200);
  // User can now log in
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="password"]').fill(password);
  await page.locator('.auth-submit').click();
  await expect(page.locator('.nav-user')).toContainText(username);
});
