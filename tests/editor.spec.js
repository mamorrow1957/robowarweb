import { test, expect } from '@playwright/test';
import { loadApp, resetApp, navTo, makeRobot, seedRobots } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
  await resetApp(page);
});

// --- Navigation into editor ---

test('clicking New Robot shows editor with default name', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('.editor-name')).toHaveValue('New Robot');
});

test('editor shows hardware panel', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('.hardware-panel')).toBeVisible();
});

test('editor shows program editor', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('.cm-editor')).toBeVisible();
});

test('editor shows Save button', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('button', { hasText: 'Save' })).toBeVisible();
});

test('editor shows Export .rw button', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('button', { hasText: 'Export .rw' })).toBeVisible();
});

test('editor shows Test Battle button', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('button', { hasText: 'Test Battle' })).toBeVisible();
});

test('editor shows Back button', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('button', { hasText: '← Back' })).toBeVisible();
});

// --- Name editing ---

test('robot name is editable', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  const nameInput = page.locator('.editor-name');
  await nameInput.fill('MyAwesomeBot');
  await expect(nameInput).toHaveValue('MyAwesomeBot');
});

// --- Hardware panel ---

test('hardware panel shows HP cost display', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('.hp-label')).toContainText('HP used');
});

test('hardware panel shows all component selects', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  const selects = page.locator('.hw-select');
  await expect(selects).toHaveCount(8);
});

test('hardware panel has weapon dropdown with all types', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await page.waitForSelector('.hw-select');
  // Weapon select is index 2 in FIELDS (armor, shield, weapon, ...)
  const values = await page.evaluate(() => {
    const sel = document.querySelectorAll('.hw-select')[2];
    if (!sel) return [];
    return Array.from(sel.options).map(o => o.value);
  });
  expect(values).toContain('bullet');
  expect(values).toContain('missile');
  expect(values).toContain('drone');
  expect(values).toContain('triple');
  expect(values).toContain('none');
});

test('cost updates when hardware changes', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  const hpLabel = page.locator('.hp-label');
  const before = await hpLabel.textContent();
  // Change weapon to none (value="none", costs 0 instead of 2)
  await page.locator('.hw-select').nth(2).selectOption('none');
  const after = await hpLabel.textContent();
  expect(after).not.toBe(before);
});

test('over-budget disables Save button', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  // Default is 24/30pt. Set armor to max (8pt, +4) and shield to max (6pt, +4) → 32pt > 30.
  // Armor is .hw-select[0], shield is .hw-select[1].
  await page.locator('.hw-select').nth(0).selectOption('4'); // armor level 4
  await page.locator('.hw-select').nth(1).selectOption('3'); // shield level 3
  await expect(page.locator('button', { hasText: /Save/ })).toBeDisabled();
});

test('over-budget shows warning text', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  // Default is 24/30pt. Set armor to max (+4) and shield to max (+4) → 32pt > 30.
  await page.locator('.hw-select').nth(0).selectOption('4'); // armor level 4
  await page.locator('.hw-select').nth(1).selectOption('3'); // shield level 3
  await expect(page.locator('.hp-label')).toContainText('over budget');
});

// --- Save ---

test('saving a new robot adds it to the robot list', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await page.locator('.editor-name').fill('SavedBot');
  await page.locator('button', { hasText: 'Save' }).click();
  await page.locator('button', { hasText: '← Back' }).click();
  await page.waitForSelector('.robot-name');
  const names = await page.locator('.robot-name').allTextContents();
  expect(names).toContain('SavedBot');
});

test('Save button briefly shows "Saved!" feedback', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await page.locator('button', { hasText: 'Save' }).click();
  await expect(page.locator('button', { hasText: 'Saved!' })).toBeVisible();
});

test('editing an existing robot preserves its name in editor', async ({ page }) => {
  await page.locator('.robot-row').first().locator('button', { hasText: 'Edit' }).click();
  await expect(page.locator('.editor-name')).not.toHaveValue('New Robot');
});

test('saving edits to existing robot updates it in list', async ({ page }) => {
  await page.locator('.robot-row').first().locator('button', { hasText: 'Edit' }).click();
  await page.locator('.editor-name').fill('RenamedBot');
  await page.locator('button', { hasText: 'Save' }).click();
  await page.locator('button', { hasText: '← Back' }).click();
  await page.waitForSelector('.robot-name');
  const names = await page.locator('.robot-name').allTextContents();
  expect(names).toContain('RenamedBot');
});

// --- Back navigation ---

test('clicking Back from editor returns to robots page', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await page.locator('button', { hasText: '← Back' }).click();
  await expect(page.locator('.page-title')).toHaveText('My Robots');
});

// --- Compile errors ---

test('compile error shown for unknown token', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  // Clear the editor and type bad code via CodeMirror
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('BADTOKEN');
  // The error panel or test-battle button should react
  // Test Battle is disabled when there are compile errors
  await expect(page.locator('button', { hasText: 'Test Battle' })).toBeDisabled();
});

test('valid program enables Test Battle button', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  // Default program is valid — Test Battle should be enabled
  await expect(page.locator('button', { hasText: 'Test Battle' })).toBeEnabled();
});

// --- Test Battle button navigates to battle setup ---

test('Test Battle button navigates to Battle Setup', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await page.locator('button', { hasText: 'Save' }).click();
  await page.locator('button', { hasText: 'Test Battle' }).click();
  await expect(page.locator('.page-title')).toHaveText('Battle Setup');
});
