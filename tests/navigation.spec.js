import { test, expect } from '@playwright/test';
import { loadApp, navTo } from './helpers.js';

// ── Splash page ──────────────────────────────────────────────────────────────

test('splash page appears on first load', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash')).toBeVisible();
});

test('splash page shows RoboWar logo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-logo')).toContainText('RoboWar');
});

test('splash page has Enter the Arena button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-btn-primary')).toContainText('Enter the Arena');
});

test("splash page has Programmer's Guide link", async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.splash-btn-secondary');
  await expect(link).toContainText("Programmer's Guide");
  await expect(link).toHaveAttribute('href', /programmer-guide/);
});

test('Enter the Arena dismisses splash and shows nav', async ({ page }) => {
  await page.goto('/');
  await page.locator('.splash-btn-primary').click();
  await expect(page.locator('.splash')).not.toBeVisible();
  await expect(page.locator('.nav')).toBeVisible();
});

test('splash is not shown after entering the arena', async ({ page }) => {
  await page.goto('/');
  await page.locator('.splash-btn-primary').click();
  await expect(page.locator('.nav')).toBeVisible();
  await expect(page.locator('.splash')).not.toBeVisible();
});

// ── Splash credits ───────────────────────────────────────────────────────────

test('splash credits section is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-credits')).toBeVisible();
});

test('splash credits name original creator Rod McFarland', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-credits')).toContainText('Rod McFarland');
});

test('splash credits name Peter Spear', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-credits')).toContainText('Peter Spear');
});

test('splash credits name Michael Morrow', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-credits')).toContainText('Michael Morrow');
});

test('splash credits mention May 2026', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.splash-credits')).toContainText('May 2026');
});

test('splash credits include Claude Code link', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.splash-credit-link');
  await expect(link).toContainText('Claude Code');
  await expect(link).toHaveAttribute('href', 'https://claude.ai/code');
});

// ── Navigation ───────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await loadApp(page);
});

test('nav bar has Docs link', async ({ page }) => {
  const link = page.locator('.nav-docs-link');
  await expect(link).toBeVisible();
  await expect(link).toContainText('Docs');
  await expect(link).toHaveAttribute('href', /programmer-guide/);
});

test('page title is RoboWar Web', async ({ page }) => {
  await expect(page).toHaveTitle(/RoboWar/);
});

test('nav bar is visible', async ({ page }) => {
  await expect(page.locator('.nav')).toBeVisible();
});

test('nav shows brand name', async ({ page }) => {
  await expect(page.locator('.nav-brand')).toHaveText('RoboWar');
});

test('nav shows all four links', async ({ page }) => {
  const links = page.locator('.nav-btn');
  await expect(links).toHaveCount(4);
  await expect(links.nth(0)).toHaveText('My Robots');
  await expect(links.nth(1)).toHaveText('Battle');
  await expect(links.nth(2)).toHaveText('Tournament');
  await expect(links.nth(3)).toHaveText('Leaderboard');
});

test('default page is My Robots', async ({ page }) => {
  await expect(page.locator('.page-title')).toHaveText('My Robots');
});

test('My Robots link is active by default', async ({ page }) => {
  await expect(page.locator('.nav-btn').first()).toHaveClass(/active/);
});

test('navigate to Battle', async ({ page }) => {
  await navTo(page, 'Battle');
  await expect(page.locator('.page-title')).toHaveText('Battle Setup');
});

test('navigate to Tournament', async ({ page }) => {
  await navTo(page, 'Tournament');
  await expect(page.locator('.page-title')).toHaveText('Tournament');
});

test('navigate to Leaderboard', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await expect(page.locator('.page-title')).toHaveText('Leaderboard');
});

test('active link updates on navigation', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const btns = page.locator('.nav-btn');
  await expect(btns.nth(3)).toHaveClass(/active/);
  // others are not active
  await expect(btns.nth(0)).not.toHaveClass(/active/);
});

test('navigating back to My Robots works', async ({ page }) => {
  await navTo(page, 'Battle');
  await navTo(page, 'My Robots');
  await expect(page.locator('.page-title')).toHaveText('My Robots');
});
