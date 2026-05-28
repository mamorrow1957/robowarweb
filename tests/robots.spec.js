import { test, expect } from '@playwright/test';
import { loadApp, resetApp, seedRobots, getRobotNames, makeRobot, SAMPLE_NAMES } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
  await resetApp(page);
});

test('shows all sample robots on first load', async ({ page }) => {
  const names = await getRobotNames(page);
  expect(names).toEqual(SAMPLE_NAMES);
});

test('each robot row has Edit, Battle, and Delete buttons', async ({ page }) => {
  const firstRow = page.locator('.robot-row').first();
  await expect(firstRow.locator('button', { hasText: 'Edit' })).toBeVisible();
  await expect(firstRow.locator('button', { hasText: 'Battle' })).toBeVisible();
  await expect(firstRow.locator('button', { hasText: 'Delete' })).toBeVisible();
});

test('each robot row shows weapon type and HP cost', async ({ page }) => {
  const firstRow = page.locator('.robot-row').first();
  await expect(firstRow.locator('.robot-hw')).toContainText('HP');
});

test('+ New Robot button is visible', async ({ page }) => {
  await expect(page.locator('button', { hasText: '+ New Robot' })).toBeVisible();
});

test('clicking New Robot navigates to editor', async ({ page }) => {
  await page.locator('button', { hasText: '+ New Robot' }).click();
  await expect(page.locator('.editor-name')).toBeVisible();
  await expect(page.locator('.editor-name')).toHaveValue('New Robot');
});

test('clicking Edit opens the correct robot in editor', async ({ page }) => {
  await page.locator('.robot-row').first().locator('button', { hasText: 'Edit' }).click();
  await expect(page.locator('.editor-name')).toHaveValue(SAMPLE_NAMES[0]);
});

test('clicking Battle on a robot pre-selects it in battle setup', async ({ page }) => {
  await page.locator('.robot-row').first().locator('button', { hasText: 'Battle' }).click();
  await expect(page.locator('.page-title')).toHaveText('Battle Setup');
  // The clicked robot's row should be selected
  await expect(page.locator('.robot-check-row.selected')).toHaveCount(1);
});

test('deleting a robot removes it from the list', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.locator('.robot-row').first().locator('button', { hasText: 'Delete' }).click();
  const names = await getRobotNames(page);
  expect(names).toHaveLength(SAMPLE_NAMES.length - 1);
  expect(names).not.toContain(SAMPLE_NAMES[0]);
});

test('cancelling delete keeps the robot', async ({ page }) => {
  page.on('dialog', dialog => dialog.dismiss());
  await page.locator('.robot-row').first().locator('button', { hasText: 'Delete' }).click();
  await expect(page.locator('.robot-row')).toHaveCount(SAMPLE_NAMES.length);
});

test('can delete all robots and shows empty state', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  for (let i = 0; i < SAMPLE_NAMES.length; i++) {
    await page.locator('.robot-row').first().locator('button', { hasText: 'Delete' }).click();
  }
  await expect(page.locator('.robot-row')).toHaveCount(0);
});

test('saved robot appears in list', async ({ page }) => {
  await seedRobots(page, [makeRobot({ name: 'MyBot' })]);
  const names = await getRobotNames(page);
  expect(names).toContain('MyBot');
});

test('robot color dot is visible', async ({ page }) => {
  await expect(page.locator('.robot-color').first()).toBeVisible();
});
