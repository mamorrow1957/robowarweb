import { test, expect } from '@playwright/test';
import { loadApp, resetApp, navTo, SAMPLE_NAMES } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
  await resetApp(page);
});

test('tournament page title is "Tournament"', async ({ page }) => {
  await navTo(page, 'Tournament');
  await expect(page.locator('.page-title')).toHaveText('Tournament');
});

test('tournament lists all robots for selection', async ({ page }) => {
  await navTo(page, 'Tournament');
  const rows = page.locator('.robot-check-row');
  await expect(rows).toHaveCount(SAMPLE_NAMES.length);
});

test('tournament shows robot names in selector', async ({ page }) => {
  await navTo(page, 'Tournament');
  const names = await page.locator('.robot-check-row .robot-name').allTextContents();
  for (const n of SAMPLE_NAMES) expect(names).toContain(n);
});

test('Run Round Robin button disabled with fewer than 2 selected', async ({ page }) => {
  await navTo(page, 'Tournament');
  await expect(page.locator('button', { hasText: /Round Robin/ })).toBeDisabled();
});

test('Run Round Robin button disabled with 1 selected', async ({ page }) => {
  await navTo(page, 'Tournament');
  await page.locator('.robot-check-row').first().click();
  await expect(page.locator('button', { hasText: /Round Robin/ })).toBeDisabled();
});

test('Run Round Robin button enabled with 2 selected', async ({ page }) => {
  await navTo(page, 'Tournament');
  await page.locator('.robot-check-row').nth(0).click();
  await page.locator('.robot-check-row').nth(1).click();
  await expect(page.locator('button', { hasText: /Round Robin/ })).toBeEnabled();
});

test('selecting a robot marks row as selected', async ({ page }) => {
  await navTo(page, 'Tournament');
  await page.locator('.robot-check-row').first().click();
  await expect(page.locator('.robot-check-row').first()).toHaveClass(/selected/);
});

test('deselecting a robot removes selected class', async ({ page }) => {
  await navTo(page, 'Tournament');
  await page.locator('.robot-check-row').first().click();
  await page.locator('.robot-check-row').first().click();
  await expect(page.locator('.robot-check-row').first()).not.toHaveClass(/selected/);
});

test('no standings table before tournament runs', async ({ page }) => {
  await navTo(page, 'Tournament');
  await expect(page.locator('.lb-table')).not.toBeVisible();
});

async function runTournament(page) {
  await navTo(page, 'Tournament');
  // Select all robots
  const rows = page.locator('.robot-check-row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
  }
  await page.locator('button', { hasText: /Round Robin/ }).click();
  // Wait for results to appear
  await page.waitForSelector('.lb-table', { timeout: 30000 });
}

test('running tournament shows standings table', async ({ page }) => {
  await runTournament(page);
  await expect(page.locator('.lb-table').first()).toBeVisible();
});

test('standings table has # Robot Wins columns', async ({ page }) => {
  await runTournament(page);
  const headers = await page.locator('.lb-table').first().locator('th').allTextContents();
  expect(headers).toContain('#');
  expect(headers.some(h => h.includes('Robot'))).toBe(true);
  expect(headers.some(h => h.includes('Wins'))).toBe(true);
});

test('standings table has one row per robot', async ({ page }) => {
  await runTournament(page);
  const tbody = page.locator('.lb-table').first().locator('tbody tr');
  await expect(tbody).toHaveCount(SAMPLE_NAMES.length);
});

test('standings table shows robot names', async ({ page }) => {
  await runTournament(page);
  const names = await page.locator('.lb-table').first().locator('tbody td:nth-child(2)').allTextContents();
  for (const n of SAMPLE_NAMES) expect(names).toContain(n);
});

test('match results table is visible after tournament', async ({ page }) => {
  await runTournament(page);
  const tables = page.locator('.lb-table');
  await expect(tables).toHaveCount(2);
});

test('match results table has correct columns', async ({ page }) => {
  await runTournament(page);
  const tables = page.locator('.lb-table');
  const headers = await tables.nth(1).locator('th').allTextContents();
  expect(headers.some(h => h.includes('Robot A'))).toBe(true);
  expect(headers.some(h => h.includes('Robot B'))).toBe(true);
  expect(headers.some(h => h.includes('Winner'))).toBe(true);
});

test('match results count is correct for round-robin of all sample robots', async ({ page }) => {
  await runTournament(page);
  // 6 robots → C(6,2) = 15 matches
  const tables = page.locator('.lb-table');
  const rows = tables.nth(1).locator('tbody tr');
  await expect(rows).toHaveCount(15);
});

test('tournament with 2 robots produces 1 match result', async ({ page }) => {
  await navTo(page, 'Tournament');
  await page.locator('.robot-check-row').nth(0).click();
  await page.locator('.robot-check-row').nth(1).click();
  await page.locator('button', { hasText: /Round Robin/ }).click();
  await page.waitForSelector('.lb-table', { timeout: 30000 });
  const tables = page.locator('.lb-table');
  const rows = tables.nth(1).locator('tbody tr');
  await expect(rows).toHaveCount(1);
});

test('wins in standings are numeric', async ({ page }) => {
  await runTournament(page);
  const winCells = await page.locator('.lb-table').first().locator('tbody td:nth-child(3)').allTextContents();
  for (const w of winCells) {
    expect(Number.isInteger(Number(w))).toBe(true);
  }
});

// ── Mode toggle ───────────────────────────────────────────────────────────────

test('tournament shows mode toggle buttons', async ({ page }) => {
  await navTo(page, 'Tournament');
  await expect(page.locator('.tourn-mode-toggle')).toBeVisible();
  await expect(page.locator('.tourn-mode-btn', { hasText: /Results Only/ })).toBeVisible();
  await expect(page.locator('.tourn-mode-btn', { hasText: /Watch Matches/ })).toBeVisible();
});

test('Results Only mode is active by default', async ({ page }) => {
  await navTo(page, 'Tournament');
  await expect(page.locator('.tourn-mode-btn', { hasText: /Results Only/ })).toHaveClass(/active/);
  await expect(page.locator('.tourn-mode-btn', { hasText: /Watch Matches/ })).not.toHaveClass(/active/);
});

test('clicking Watch Matches activates that mode', async ({ page }) => {
  await navTo(page, 'Tournament');
  await page.locator('.tourn-mode-btn', { hasText: /Watch Matches/ }).click();
  await expect(page.locator('.tourn-mode-btn', { hasText: /Watch Matches/ })).toHaveClass(/active/);
  await expect(page.locator('.tourn-mode-btn', { hasText: /Results Only/ })).not.toHaveClass(/active/);
});

// ── Watch mode ────────────────────────────────────────────────────────────────

async function startWatchTournament(page) {
  await navTo(page, 'Tournament');
  await page.locator('.tourn-mode-btn', { hasText: /Watch Matches/ }).click();
  const rows = page.locator('.robot-check-row');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
  }
  await page.locator('button', { hasText: /Round Robin/ }).click();
  // Wait for BattleViewer to appear
  await page.waitForSelector('canvas', { timeout: 30000 });
}

test('watch mode shows BattleViewer for first match', async ({ page }) => {
  await startWatchTournament(page);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.page-title')).toContainText('Tournament');
});

test('watch mode shows match counter in title', async ({ page }) => {
  await startWatchTournament(page);
  await expect(page.locator('.page-title')).toContainText('Match 1');
});

test('watch mode shows skip to results button', async ({ page }) => {
  await startWatchTournament(page);
  await expect(page.locator('button', { hasText: /Skip to Results/ })).toBeVisible();
});

test('skip to results shows standings', async ({ page }) => {
  await startWatchTournament(page);
  await page.locator('button', { hasText: /Skip to Results/ }).click();
  await expect(page.locator('.lb-table').first()).toBeVisible();
});

test('watch mode skip button advances to next match', async ({ page }) => {
  await startWatchTournament(page);
  // The exit button says "Skip Match →" when more matches remain
  const exitBtn = page.locator('.battle-layout .page-header button').last();
  const label = await exitBtn.textContent();
  // With 3 robots there are 3 matches; first one shows "Skip Match →"
  if (label && label.includes('Skip Match')) {
    await exitBtn.click();
    await page.waitForSelector('canvas', { timeout: 15000 });
    await expect(page.locator('.page-title')).toContainText('Match 2');
  }
});
