import { test, expect, request } from '@playwright/test';
import { loadApp } from './helpers.js';

test.afterAll(async () => {
  const ctx = await request.newContext({ baseURL: 'http://localhost:3001' });
  await ctx.delete('/api/test/cleanup');
  await ctx.dispose();
});

const TEST_USER = `sharer_${Date.now()}`;
const TEST_PASS = 'password123';
const TEST_EMAIL = `${TEST_USER}@test.com`;

async function registerAndGetRobotId(page) {
  // Register
  await page.locator('.nav-auth button', { hasText: 'Log In' }).click();
  await page.locator('.auth-switch').click();
  await page.locator('.auth-modal input[type="text"]').fill(TEST_USER);
  await page.locator('.auth-modal input[type="email"]').fill(TEST_EMAIL);
  await page.locator('.auth-modal input[type="password"]').fill(TEST_PASS);
  await page.locator('.auth-modal .auth-privacy-agree').check();
  await page.locator('.auth-submit').click();
  await page.locator('.nav-user').waitFor();

  // Create a robot
  await page.locator('.btn.primary', { hasText: '+ New Robot' }).click();
  await page.waitForURL(/./);
  const robotId = await page.evaluate(() => {
    const m = window.location.hash.match(/robot=([^&]+)/);
    return m ? m[1] : null;
  });
  // Navigate back to robot list
  await page.locator('.nav-btn', { hasText: 'My Robots' }).click();
  return robotId;
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
  await registerAndGetRobotId(page);
  await expect(page.locator('.robot-actions button', { hasText: 'Share' }).first()).toBeVisible();
});

test('Share button is not visible when logged out', async ({ page }) => {
  await expect(page.locator('.robot-actions button', { hasText: 'Share' })).not.toBeVisible();
});

test('Share button toggles to Unshare after clicking', async ({ page }) => {
  await registerAndGetRobotId(page);
  const shareBtn = page.locator('.robot-actions button', { hasText: 'Share' }).first();
  await shareBtn.click();
  // dismiss the alert
  page.on('dialog', d => d.dismiss());
  await expect(page.locator('.robot-actions button', { hasText: 'Unshare' }).first()).toBeVisible();
});

test('Unshare button toggles back to Share', async ({ page }) => {
  page.on('dialog', d => d.dismiss());
  await registerAndGetRobotId(page);
  await page.locator('.robot-actions button', { hasText: 'Share' }).first().click();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().waitFor();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().click();
  await expect(page.locator('.robot-actions button', { hasText: 'Share' }).first()).toBeVisible();
});

test('shared robot API returns robot for authenticated user', async ({ page }) => {
  page.on('dialog', d => d.dismiss());
  await registerAndGetRobotId(page);
  // Share the first robot
  await page.locator('.robot-actions button', { hasText: 'Share' }).first().click();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().waitFor();

  // Get robot id from the row
  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
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
  expect(res.data.owner).toBe(TEST_USER);
});

test('shared robot API returns 401 without auth', async ({ page }) => {
  page.on('dialog', d => d.dismiss());
  await registerAndGetRobotId(page);
  await page.locator('.robot-actions button', { hasText: 'Share' }).first().click();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().waitFor();

  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
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
  await registerAndGetRobotId(page);
  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
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
  page.on('dialog', d => d.dismiss());
  await registerAndGetRobotId(page);
  await page.locator('.robot-actions button', { hasText: 'Share' }).first().click();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().waitFor();

  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const sharedRobot = robots.find(r => r.is_public === 1);

  // Clear session and navigate to share URL
  await page.evaluate(() => {
    localStorage.removeItem('robowar_token');
    localStorage.removeItem('robowar_user');
  });
  await page.goto(`/#robot=${sharedRobot.id}`);
  await expect(page.locator('.auth-modal')).toBeVisible();
});

test('visiting /#robot=ID while logged in shows SharedRobotView', async ({ page }) => {
  page.on('dialog', d => d.dismiss());
  await registerAndGetRobotId(page);
  await page.locator('.robot-actions button', { hasText: 'Share' }).first().click();
  await page.locator('.robot-actions button', { hasText: 'Unshare' }).first().waitFor();

  const token = await page.evaluate(() => localStorage.getItem('robowar_token'));
  const robots = await page.evaluate(async (t) => {
    const r = await fetch('/api/robots', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  }, token);
  const sharedRobot = robots.find(r => r.is_public === 1);

  await page.goto(`/#robot=${sharedRobot.id}`);
  await expect(page.locator('.page-title', { hasText: sharedRobot.name })).toBeVisible();
  await expect(page.locator('.btn', { hasText: 'Battle This Robot' })).toBeVisible();
});
