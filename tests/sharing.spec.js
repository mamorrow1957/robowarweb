import { test, expect, request } from '@playwright/test';
import { loadApp } from './helpers.js';

test.afterAll(async () => {
  const ctx = await request.newContext({ baseURL: 'http://localhost:3001' });
  await ctx.delete('/api/test/cleanup');
  await ctx.dispose();
});

async function registerAndGetRobotId(page, suffix) {
  const username = `sharer_${suffix}_${Date.now()}`;
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(username);
  await page.locator('.auth-modal input[type="email"]').fill(`${username}@test.com`);
  await page.locator('.auth-modal input[type="password"]').fill('password123');
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await page.locator('.nav-user').waitFor();

  await page.locator('.btn.primary', { hasText: '+ New Robot' }).click();
  await page.locator('.btn.primary', { hasText: 'Save' }).click();
  await page.locator('.nav-btn', { hasText: 'My Robots' }).click();
  await page.locator('.robot-row').first().waitFor();

  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  return { username, token, robotId: robots[0]?.id };
}

async function shareFirstRobot(page) {
  page.on('dialog', d => d.accept());
  await page.locator('.robot-actions button', { hasText: 'Share' }).first().click();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().waitFor();
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

test('Share button is visible for logged-in robots', async ({ page }) => {
  await registerAndGetRobotId(page, 'vis');
  await expect(page.locator('.robot-actions button', { hasText: 'Share' }).first()).toBeVisible();
});

test('Share button is not visible when logged out', async ({ page }) => {
  await expect(page.locator('.robot-actions button', { hasText: 'Share' })).not.toBeVisible();
});

test('Share button toggles to Unshare after clicking', async ({ page }) => {
  await registerAndGetRobotId(page, 'tog1');
  await shareFirstRobot(page);
  await expect(page.locator('.robot-actions button', { hasText: 'Unshare' }).first()).toBeVisible();
});

test('Unshare button toggles back to Share', async ({ page }) => {
  await registerAndGetRobotId(page, 'tog2');
  await shareFirstRobot(page);
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().click();
  await expect(page.locator('.robot-actions button', { hasText: 'Share' }).first()).toBeVisible();
});

test('shared robot API returns robot for authenticated user', async ({ page }) => {
  const { token } = await registerAndGetRobotId(page, 'api1');
  await shareFirstRobot(page);

  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const sharedRobot = robots.find(r => r.is_public === 1);
  expect(sharedRobot).toBeTruthy();

  const res = await page.evaluate(async ({ t, id }) => {
    const r = await fetch(`/api/robots/shared/${id}`, { headers: { Authorization: `Bearer ${t}` } });
    return { status: r.status, data: await r.json() };
  }, { t: token, id: sharedRobot.id });
  expect(res.status).toBe(200);
  expect(res.data.name).toBe(sharedRobot.name);
});

test('shared robot API returns 401 without auth', async ({ page }) => {
  const { token } = await registerAndGetRobotId(page, 'api2');
  await shareFirstRobot(page);

  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const sharedRobot = robots.find(r => r.is_public === 1);

  const status = await page.evaluate(async (id) => {
    const r = await fetch(`/api/robots/shared/${id}`);
    return r.status;
  }, sharedRobot.id);
  expect(status).toBe(401);
});

test('unshared robot returns 404 from shared API', async ({ page }) => {
  const { token } = await registerAndGetRobotId(page, 'api3');

  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const unsharedRobot = robots.find(r => !r.is_public);
  expect(unsharedRobot).toBeTruthy();

  const status = await page.evaluate(async ({ t, id }) => {
    const r = await fetch(`/api/robots/shared/${id}`, { headers: { Authorization: `Bearer ${t}` } });
    return r.status;
  }, { t: token, id: unsharedRobot.id });
  expect(status).toBe(404);
});

test('visiting /#robot=ID while logged out shows login form', async ({ page }) => {
  const { token } = await registerAndGetRobotId(page, 'hash1');
  await shareFirstRobot(page);

  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const sharedRobot = robots.find(r => r.is_public === 1);

  // Clear auth but keep splash-dismissed state so nav shows after reload
  await page.evaluate(() => {
    localStorage.removeItem('robowar_token');
    localStorage.removeItem('robowar_user');
    localStorage.removeItem('robowar_is_admin');
    localStorage.removeItem('robowar_has_email');
  });

  // Navigate via about:blank to force a full page reload (not a hash-only navigation)
  await page.goto('about:blank');
  await page.goto(`http://localhost:5173/#robot=${sharedRobot.id}`);
  await expect(page.locator('.auth-modal')).toBeVisible({ timeout: 8000 });
});

test('visiting /#robot=ID while logged in shows SharedRobotView', async ({ page }) => {
  const { token } = await registerAndGetRobotId(page, 'hash2');
  await shareFirstRobot(page);

  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const sharedRobot = robots.find(r => r.is_public === 1);

  // Navigate via about:blank to force a full page reload (not a hash-only navigation)
  await page.goto('about:blank');
  await page.goto(`http://localhost:5173/#robot=${sharedRobot.id}`);
  await expect(page.locator('.btn', { hasText: 'Battle This Robot' })).toBeVisible({ timeout: 8000 });
});
