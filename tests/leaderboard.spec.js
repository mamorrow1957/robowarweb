import { test, expect } from '@playwright/test';
import { loadApp, resetApp, navTo, SAMPLE_NAMES } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
  await resetApp(page);
  // Clear any saved ELO ratings
  await page.evaluate(() => localStorage.removeItem('robowar_elo'));
  await resetApp(page);
});

test('leaderboard page title is "Leaderboard"', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await expect(page.locator('.page-title')).toHaveText('Leaderboard');
});

test('leaderboard table is visible', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await expect(page.locator('.lb-table')).toBeVisible();
});

test('leaderboard table has correct columns', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const headers = await page.locator('.lb-table th').allTextContents();
  expect(headers.some(h => h.includes('Robot'))).toBe(true);
  expect(headers.some(h => h.includes('ELO'))).toBe(true);
  expect(headers.some(h => h.includes('Weapon'))).toBe(true);
});

test('leaderboard shows all robots', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const rows = page.locator('.lb-table tbody tr');
  await expect(rows).toHaveCount(SAMPLE_NAMES.length);
});

test('leaderboard shows each sample robot by name', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const names = await page.locator('.lb-table tbody').locator('td:nth-child(2)').allTextContents();
  for (const n of SAMPLE_NAMES) {
    expect(names.some(cell => cell.includes(n))).toBe(true);
  }
});

test('initial ELO rating is 1200 for all robots', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const eloValues = await page.locator('.lb-table tbody td:nth-child(5)').allTextContents();
  for (const elo of eloValues) {
    expect(elo.trim()).toBe('1200');
  }
});

test('leaderboard shows weapon type for each robot', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const weapons = await page.locator('.lb-table tbody td:nth-child(3)').allTextContents();
  // Each robot should have a weapon listed
  for (const w of weapons) {
    expect(w.trim().length).toBeGreaterThan(0);
  }
});

test('Run Rated Matches button is visible', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await expect(page.locator('button', { hasText: /Rated Matches/ })).toBeVisible();
});

test('Run Rated Matches button enabled with multiple robots', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await expect(page.locator('button', { hasText: /Rated Matches/ })).toBeEnabled();
});

test('running rated matches updates ELO from 1200', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await page.locator('button', { hasText: /Rated Matches/ }).click();
  // Wait for running state to clear
  await expect(page.locator('button', { hasText: /Rated Matches/ })).toBeEnabled({ timeout: 30000 });
  const eloValues = await page.locator('.lb-table tbody td:nth-child(5)').allTextContents();
  // After battles, at least some ratings should differ from 1200
  const changed = eloValues.some(v => v.trim() !== '1200');
  expect(changed).toBe(true);
});

test('ELO values are integers', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await page.locator('button', { hasText: /Rated Matches/ }).click();
  await expect(page.locator('button', { hasText: /Rated Matches/ })).toBeEnabled({ timeout: 30000 });
  const eloValues = await page.locator('.lb-table tbody td:nth-child(5)').allTextContents();
  for (const v of eloValues) {
    expect(Number.isInteger(Number(v.trim()))).toBe(true);
  }
});

test('leaderboard shows rank numbers', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const ranks = await page.locator('.lb-table tbody td:nth-child(1)').allTextContents();
  expect(ranks[0].trim()).toBe('1');
  expect(ranks[1].trim()).toBe('2');
});

test('each leaderboard row has a Battle button', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const battleBtns = page.locator('.lb-table tbody').locator('button', { hasText: 'Battle' });
  await expect(battleBtns).toHaveCount(SAMPLE_NAMES.length);
});

test('Battle button from leaderboard navigates to battle setup', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await page.locator('.lb-table tbody').locator('button', { hasText: 'Battle' }).first().click();
  await expect(page.locator('.page-title')).toHaveText('Battle Setup');
});

test('Battle button from leaderboard preselects that robot', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  await page.locator('.lb-table tbody').locator('button', { hasText: 'Battle' }).first().click();
  await expect(page.locator('.robot-check-row.selected')).toHaveCount(1);
});

test('leaderboard shows HP cost column', async ({ page }) => {
  await navTo(page, 'Leaderboard');
  const costs = await page.locator('.lb-table tbody td:nth-child(4)').allTextContents();
  for (const c of costs) {
    expect(Number(c.trim())).toBeGreaterThan(0);
  }
});
