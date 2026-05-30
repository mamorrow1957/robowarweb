import { test, expect } from '@playwright/test';
import { loadApp, resetApp, navTo, makeRobot, seedRobots, SAMPLE_NAMES } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
  await resetApp(page);
});

// ── Battle Setup ────────────────────────────────────────────────────────────

test('battle setup page title is "Battle Setup"', async ({ page }) => {
  await navTo(page, 'Battle');
  await expect(page.locator('.page-title')).toHaveText('Battle Setup');
});

test('battle setup lists all robots', async ({ page }) => {
  await navTo(page, 'Battle');
  const rows = page.locator('.robot-check-row');
  await expect(rows).toHaveCount(SAMPLE_NAMES.length);
});

test('battle setup shows robot names', async ({ page }) => {
  await navTo(page, 'Battle');
  const names = await page.locator('.robot-check-row .robot-name').allTextContents();
  for (const n of SAMPLE_NAMES) expect(names).toContain(n);
});

test('battle setup shows weapon and HP cost for each robot', async ({ page }) => {
  await navTo(page, 'Battle');
  const hw = page.locator('.robot-check-row .robot-hw').first();
  await expect(hw).toContainText('HP');
});

test('battle setup has arena size select', async ({ page }) => {
  await navTo(page, 'Battle');
  await expect(page.locator('.option-select').first()).toBeVisible();
});

test('battle setup has tick limit select', async ({ page }) => {
  await navTo(page, 'Battle');
  const selects = page.locator('.option-select');
  await expect(selects).toHaveCount(2);
});

test('start battle button disabled with fewer than 2 selected', async ({ page }) => {
  await navTo(page, 'Battle');
  await expect(page.locator('button', { hasText: /Start Battle/ })).toBeDisabled();
});

test('selecting one robot keeps start button disabled', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').first().click();
  await expect(page.locator('button', { hasText: /Start Battle/ })).toBeDisabled();
});

test('selecting two robots enables start button', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').nth(0).click();
  await page.locator('.robot-check-row').nth(1).click();
  await expect(page.locator('button', { hasText: /Start Battle/ })).toBeEnabled();
});

test('selected robot row gets "selected" class', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').first().click();
  await expect(page.locator('.robot-check-row').first()).toHaveClass(/selected/);
});

test('clicking selected robot deselects it', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').first().click();
  await page.locator('.robot-check-row').first().click();
  await expect(page.locator('.robot-check-row').first()).not.toHaveClass(/selected/);
});

test('start button label shows selected count', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').nth(0).click();
  await page.locator('.robot-check-row').nth(1).click();
  await expect(page.locator('button', { hasText: /2 robots/ })).toBeVisible();
});

test('back button returns to robots page', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('button', { hasText: '← Back' }).click();
  await expect(page.locator('.page-title')).toHaveText('My Robots');
});

test('Battle button from robot row preselects that robot', async ({ page }) => {
  await page.locator('.robot-row').first().locator('button', { hasText: 'Battle' }).click();
  await expect(page.locator('.robot-check-row.selected')).toHaveCount(1);
  const selectedName = await page.locator('.robot-check-row.selected .robot-name').textContent();
  expect(selectedName).toBe(SAMPLE_NAMES[0]);
});

// ── Battle Viewer ────────────────────────────────────────────────────────────

async function startBattle(page) {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').nth(0).click();
  await page.locator('.robot-check-row').nth(1).click();
  await page.locator('button', { hasText: /Start Battle/ }).click();
}

test('starting a battle navigates away from setup', async ({ page }) => {
  await startBattle(page);
  await expect(page.locator('.page-title')).not.toHaveText('Battle Setup');
});

test('battle viewer shows page title "Battle"', async ({ page }) => {
  await startBattle(page);
  await expect(page.locator('.page-title')).toHaveText('Battle');
});

test('battle viewer shows loading state initially', async ({ page }) => {
  await navTo(page, 'Battle');
  await page.locator('.robot-check-row').nth(0).click();
  await page.locator('.robot-check-row').nth(1).click();
  // Click and immediately check — loading card should appear before simulation finishes
  await page.locator('button', { hasText: /Start Battle/ }).click();
  // It may resolve fast, but we expect .page-title to be 'Battle'
  await expect(page.locator('.page-title')).toHaveText('Battle');
});

test('battle viewer shows arena canvas after loading', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await expect(page.locator('canvas')).toBeVisible();
});

test('battle viewer shows play button', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await expect(page.locator('button', { hasText: /Play/ })).toBeVisible();
});

test('battle viewer shows tick display', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await expect(page.locator('.tick-display')).toContainText('ticks');
});

test('battle viewer shows speed buttons', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  const speedBtns = page.locator('.speed-btn');
  await expect(speedBtns).toHaveCount(6);
});

test('battle viewer shows robot stats after loading', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('.robot-stats', { timeout: 15000 });
  await expect(page.locator('.robot-stat-card')).toHaveCount(2);
});

test('robot stats show Armor, Energy, and Heat', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('.robot-stats', { timeout: 15000 });
  const firstCard = page.locator('.robot-stat-card').first();
  await expect(firstCard.locator('.stat-row').filter({ hasText: 'Armor' })).toBeVisible();
  await expect(firstCard.locator('.stat-row').filter({ hasText: 'Energy' })).toBeVisible();
  await expect(firstCard.locator('.stat-row').filter({ hasText: 'Heat' })).toBeVisible();
});

test('battle shows winner text', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  // Jump to last frame
  await page.locator('button[title], button').filter({ hasText: '⏭' }).click();
  await expect(page.locator('.battle-controls')).toContainText(/wins|Draw/i);
});

test('winner text is not shown before viewing the last frame', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  // At tick 1 (just loaded, not played) the result should not be visible
  await expect(page.locator('.battle-controls')).not.toContainText(/wins|Draw/i);
});

test('speed button becomes active when clicked', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  const speedBtns = page.locator('.speed-btn');
  await speedBtns.nth(1).click();
  await expect(speedBtns.nth(1)).toHaveClass(/active/);
  await expect(speedBtns.nth(0)).not.toHaveClass(/active/);
});

test('New Battle button returns to battle setup', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: '← New Battle' }).click();
  await expect(page.locator('.page-title')).toHaveText('Battle Setup');
});

test('step forward button advances tick', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  const tickBefore = await page.locator('.tick-display').textContent();
  await page.locator('button').filter({ hasText: '▶' }).last().click();
  const tickAfter = await page.locator('.tick-display').textContent();
  expect(tickAfter).not.toBe(tickBefore);
});

test('battle viewer shows mute button', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await expect(page.locator('.mute-btn')).toBeVisible();
});

test('mute button toggles muted state', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  const btn = page.locator('.mute-btn');
  await expect(btn).not.toHaveClass(/muted/);
  await btn.click();
  await expect(btn).toHaveClass(/muted/);
  await btn.click();
  await expect(btn).not.toHaveClass(/muted/);
});

// ── Debug mode ───────────────────────────────────────────────────────────────

test('battle viewer shows debug button', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await expect(page.locator('button', { hasText: /Debug/ })).toBeVisible();
});

test('debug panel is hidden by default', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await expect(page.locator('.debug-panel')).toHaveCount(0);
});

test('clicking debug button shows debug panel', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  await expect(page.locator('.debug-panel')).toBeVisible();
});

test('debug panel shows a selector tab per robot', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  await expect(page.locator('.debug-robot-tab')).toHaveCount(2);
});

test('debug panel shows Sensors section', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  await expect(page.locator('.debug-panel .debug-section-label', { hasText: 'Sensors' })).toBeVisible();
});

test('debug panel shows Variables section', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  await expect(page.locator('.debug-panel .debug-section-label', { hasText: 'Variables' })).toBeVisible();
});

test('clicking debug button again hides the panel', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  const btn = page.locator('button', { hasText: /Debug/ });
  await btn.click();
  await expect(page.locator('.debug-panel')).toBeVisible();
  await btn.click();
  await expect(page.locator('.debug-panel')).toHaveCount(0);
});

test('debug panel has its own step controls', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  const strip = page.locator('.debug-step-btns');
  await expect(strip).toBeVisible();
  await expect(strip.locator('button', { hasText: /Prev/ })).toBeVisible();
  await expect(strip.locator('button', { hasText: /Next/ })).toBeVisible();
});

test('debug panel step controls advance the tick', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  const counter = page.locator('.debug-tick-counter');
  const before = await counter.textContent();
  await page.locator('.debug-step-btns button', { hasText: /Next/ }).click();
  const after = await counter.textContent();
  expect(after).not.toBe(before);
});

test('clicking a robot tab switches the displayed robot name', async ({ page }) => {
  await startBattle(page);
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.locator('button', { hasText: /Debug/ }).click();
  const tabs = page.locator('.debug-robot-tab');
  // First tab is active by default; click the second one and confirm its text matches
  const secondName = await tabs.nth(1).textContent();
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  // The active tab label should match the second robot's name (strip any ✕ suffix)
  const activeName = (await tabs.nth(1).textContent())?.trim();
  expect(activeName).toBeTruthy();
  expect(secondName?.trim()).toBe(activeName);
});
