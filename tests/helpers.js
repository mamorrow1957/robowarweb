/**
 * Shared test helpers for RoboWar Web.
 */

/** Clear localStorage and reload; waits for robot list to appear. */
export async function resetApp(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await dismissSplash(page);
}

/** Dismiss the splash page if it is showing, then wait for the nav bar. */
async function dismissSplash(page) {
  const splash = page.locator('.splash');
  const isSplash = await splash.isVisible().catch(() => false);
  if (isSplash) {
    await page.locator('.splash-btn-primary').click();
  }
  await page.waitForSelector('.nav', { timeout: 5000 });
}

/** Navigate to the app with a clean slate. */
export async function loadApp(page) {
  await page.goto('/');
  await dismissSplash(page);
}

/** Click a nav link by label text. */
export async function navTo(page, label) {
  await page.locator('.nav-btn', { hasText: label }).click();
}

/** Return the text content of every .robot-name element. */
export async function getRobotNames(page) {
  return page.locator('.robot-name').allTextContents();
}

/** Seed localStorage with a custom robots array, then reload. */
export async function seedRobots(page, robots) {
  await page.evaluate((r) => {
    localStorage.clear();
    localStorage.setItem('robowar_robots', JSON.stringify(r));
  }, robots);
  await page.reload();
  await dismissSplash(page);
}

/** Minimal valid robot definition. */
export function makeRobot(overrides = {}) {
  return {
    id: overrides.id ?? 'rbt_test',
    name: overrides.name ?? 'TestBot',
    hardware: {
      armor: 1, shield: 0, weapon: 'bullet',
      engine: 1, energy: 1, cpu: 1, cooling: 0, radar: 1,
      ...overrides.hardware,
    },
    program: overrides.program ?? 'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL\n',
  };
}

/** The three built-in sample robot names (loaded on first visit). */
export const SAMPLE_NAMES = ['Tracker', 'Evader', 'Sniper'];

/** Default sensor object for VM tests. */
export const DEFAULT_SENSORS = {
  ENERGY: 100, ARMOR: 50, HEAT: 0, RANGE: 150, RADAR: 45,
  SPEEDX: 0, SPEEDY: 0, POSX: 100, POSY: 100,
  COLLISION: 0, STUNNED: 0, TEAMMATES: 0, RANDOM: 128, TIME: 0,
};
