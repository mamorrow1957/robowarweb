import { test, expect } from '@playwright/test';
import { loadApp, navTo } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
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
