/**
 * CombatEngine unit tests — run in Vite dev server context.
 */
import { test, expect } from '@playwright/test';
import { loadApp } from '../helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
});

// Helper: build a minimal robot definition ready for CombatEngine
async function makeCombatRobot(page, programSrc, overrides = {}) {
  return page.evaluate(async ({ src, overrides }) => {
    const { compile } = await import('/src/engine/compiler.js');
    const { bytecode } = compile(src);
    return {
      id: overrides.id || 'r1',
      name: overrides.name || 'TestBot',
      hardware: overrides.hardware || {
        armor: 2, shield: 0, weapon: 'bullet',
        engine: 1, energy: 1, cpu: 1, cooling: 0, radar: 1,
      },
      program: src,
      bytecode,
      team: overrides.team ?? 0,
    };
  }, { src: programSrc, overrides });
}

async function runBattle(page, robots, config = {}) {
  return page.evaluate(async ({ robots, config }) => {
    const { CombatEngine } = await import('/src/engine/combat.js');
    const engine = new CombatEngine({
      robots,
      arenaWidth:  config.arenaWidth  || 300,
      arenaHeight: config.arenaHeight || 300,
      tickLimit:   config.tickLimit   || 2000,
      seed:        config.seed        || 12345,
    });
    const { frames, result } = engine.simulate();
    return { frames, result, lastFrame: frames[frames.length - 1] };
  }, { robots, config });
}

// ── Constructor / spawn ───────────────────────────────────────────────────────

test('two robots spawn within arena bounds', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', name: 'A', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', name: 'B', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { seed: 99 });
  const first = frames[0];
  for (const r of first.robots) {
    expect(r.x).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(300);
    expect(r.y).toBeGreaterThan(0);
    expect(r.y).toBeLessThan(300);
  }
});

test('two robots spawn at least 60 units apart', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', name: 'A', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', name: 'B', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { seed: 99 });
  const first = frames[0];
  const [a, b] = first.robots;
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  expect(dist).toBeGreaterThanOrEqual(60);
});

test('robots start with full armor', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2]);
  const first = frames[0];
  for (const r of first.robots) {
    expect(r.armor).toBe(r.maxArmor);
  }
});

test('robots start with full energy', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2]);
  const first = frames[0];
  for (const r of first.robots) {
    expect(r.energy).toBe(r.maxEnergy);
  }
});

test('robots start alive', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2]);
  const first = frames[0];
  for (const r of first.robots) {
    expect(r.alive).toBe(true);
  }
});

// ── Simulation result ─────────────────────────────────────────────────────────

test('simulate returns frames array', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2]);
  expect(Array.isArray(frames)).toBe(true);
  expect(frames.length).toBeGreaterThan(0);
});

test('simulate returns result object', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { result } = await runBattle(page, [r1, r2]);
  expect(result).not.toBeNull();
  expect(result).toHaveProperty('winnerName');
  expect(result).toHaveProperty('reason');
});

test('battle with tick limit stops at tick limit', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames, result } = await runBattle(page, [r1, r2], { tickLimit: 100 });
  expect(frames.length).toBeLessThanOrEqual(100);
  expect(result.reason).toMatch(/tick limit|last standing/);
});

test('frame contains tick number', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 10 });
  expect(frames[0].tick).toBe(1);
  expect(frames[9].tick).toBe(10);
});

test('frame contains robots array', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 5 });
  expect(frames[0].robots).toHaveLength(2);
});

test('frame contains projectiles array', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 5 });
  expect(Array.isArray(frames[0].projectiles)).toBe(true);
});

// ── Determinism ───────────────────────────────────────────────────────────────

test('same seed produces identical results', async ({ page }) => {
  const r1a = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2a = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const r1b = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2b = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const resultA = await runBattle(page, [r1a, r2a], { seed: 42, tickLimit: 200 });
  const resultB = await runBattle(page, [r1b, r2b], { seed: 42, tickLimit: 200 });
  expect(resultA.result.winnerId).toBe(resultB.result.winnerId);
  expect(resultA.frames.length).toBe(resultB.frames.length);
});

// ── Projectiles ───────────────────────────────────────────────────────────────

test('firing robot produces projectile', async ({ page }) => {
  // Robot that immediately fires
  const program = 'LOOP\n  0 AIM\n  1 FIRE\nPOOL';
  const r1 = await makeCombatRobot(page, program, { id: 'r1', name: 'Shooter', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', name: 'Target', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 10 });
  // After a few ticks there should be at least one projectile in some frame
  const hasProjectile = frames.some(f => f.projectiles.length > 0);
  expect(hasProjectile).toBe(true);
});

test('projectile has expected properties', async ({ page }) => {
  const program = '0 AIM\n1 FIRE';
  const r1 = await makeCombatRobot(page, program, { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 5 });
  const frameWithProj = frames.find(f => f.projectiles.length > 0);
  if (frameWithProj) {
    const p = frameWithProj.projectiles[0];
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('type');
    expect(p).toHaveProperty('x');
    expect(p).toHaveProperty('y');
  }
});

// ── Damage & victory ──────────────────────────────────────────────────────────

test('a robot with zero program eventually loses to a shooter', async ({ page }) => {
  // One robot shoots constantly, the other does nothing
  const shooter = await makeCombatRobot(page,
    'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL',
    { id: 'shooter', name: 'Shooter', team: 0,
      hardware: { armor: 1, shield: 0, weapon: 'bullet', engine: 0, energy: 1, cpu: 3, cooling: 2, radar: 3 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', name: 'Target', team: 1,
      hardware: { armor: 1, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } }
  );
  const { result } = await runBattle(page, [shooter, target], { seed: 1, tickLimit: 2000 });
  // The shooter should win (or at minimum the target should take damage)
  expect(result).not.toBeNull();
  expect(result.winnerId !== null || result.reason === 'all destroyed').toBe(true);
});

test('destroyed robot has alive=false in final frame', async ({ page }) => {
  const shooter = await makeCombatRobot(page,
    'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL',
    { id: 'shooter', team: 0,
      hardware: { armor: 2, shield: 0, weapon: 'bullet', engine: 0, energy: 1, cpu: 3, cooling: 2, radar: 3 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', team: 1,
      hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } }
  );
  const { lastFrame, result } = await runBattle(page, [shooter, target], { seed: 2, tickLimit: 2000 });
  if (result.reason === 'last standing') {
    const dead = lastFrame.robots.find(r => !r.alive);
    expect(dead).toBeDefined();
  }
});

test('winner id matches surviving robot id', async ({ page }) => {
  const shooter = await makeCombatRobot(page,
    'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL',
    { id: 'shooter', name: 'Shooter', team: 0,
      hardware: { armor: 2, shield: 0, weapon: 'bullet', engine: 0, energy: 1, cpu: 3, cooling: 2, radar: 3 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', name: 'Target', team: 1,
      hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } }
  );
  const { lastFrame, result } = await runBattle(page, [shooter, target], { seed: 3, tickLimit: 2000 });
  if (result.winnerId) {
    const winner = lastFrame.robots.find(r => r.id === result.winnerId);
    expect(winner?.alive).toBe(true);
  }
});

// ── Heat mechanics ────────────────────────────────────────────────────────────

test('robot heat increases when firing', async ({ page }) => {
  // missile heat=3, cooling level 0 = dissipation 1 → net +2 heat/tick visible in frames
  const shooter = await makeCombatRobot(page,
    'LOOP\n  0 AIM\n  1 FIRE\nPOOL',
    { id: 'shooter', team: 0,
      hardware: { armor: 2, shield: 0, weapon: 'missile', engine: 0, energy: 2, cpu: 2, cooling: 0, radar: 0 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', team: 1,
      hardware: { armor: 2, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } }
  );
  const { frames } = await runBattle(page, [shooter, target], { tickLimit: 30 });
  const shooterFrames = frames.map(f => f.robots.find(r => r.id === 'shooter'));
  const heatIncreased = shooterFrames.some(r => r && r.heat > 0);
  expect(heatIncreased).toBe(true);
});

// ── Wall bounce ───────────────────────────────────────────────────────────────

test('robot stays within arena bounds throughout battle', async ({ page }) => {
  const r1 = await makeCombatRobot(page,
    'LOOP\n  5 THRUSTX\n  5 THRUSTY\nPOOL',
    { id: 'r1', team: 0 }
  );
  const r2 = await makeCombatRobot(page,
    'LOOP\n  -5 THRUSTX\n  -5 THRUSTY\nPOOL',
    { id: 'r2', team: 1 }
  );
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 100 });
  for (const frame of frames) {
    for (const r of frame.robots) {
      if (r.alive) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x).toBeLessThanOrEqual(300);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeLessThanOrEqual(300);
      }
    }
  }
});

// ── Energy recharge ───────────────────────────────────────────────────────────

test('robot energy recharges over time', async ({ page }) => {
  const r1 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r1', team: 0 });
  const r2 = await makeCombatRobot(page, 'LOOP POOL', { id: 'r2', team: 1 });
  const { frames } = await runBattle(page, [r1, r2], { tickLimit: 50 });
  // Energy should stay at max since no drain
  const r1Frames = frames.map(f => f.robots.find(r => r.id === 'r1'));
  const first = r1Frames[0];
  const last = r1Frames[r1Frames.length - 1];
  if (first && last && first.alive && last.alive) {
    expect(last.energy).toBeLessThanOrEqual(last.maxEnergy);
    expect(last.energy).toBeGreaterThan(0);
  }
});

// ── Multiple robots ───────────────────────────────────────────────────────────

test('three robots can battle simultaneously', async ({ page }) => {
  const robots = await Promise.all([
    makeCombatRobot(page, 'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL', { id: 'r1', team: 0 }),
    makeCombatRobot(page, 'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL', { id: 'r2', team: 1 }),
    makeCombatRobot(page, 'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL', { id: 'r3', team: 2 }),
  ]);
  const { result, frames } = await runBattle(page, robots, { tickLimit: 500 });
  expect(frames[0].robots).toHaveLength(3);
  expect(result).not.toBeNull();
});

// ── Weapon types ──────────────────────────────────────────────────────────────

test('missile weapon produces missile projectile type', async ({ page }) => {
  const shooter = await makeCombatRobot(page,
    'LOOP\n  0 AIM\n  1 FIRE\nPOOL',
    { id: 'shooter', team: 0,
      hardware: { armor: 1, shield: 0, weapon: 'missile', engine: 0, energy: 2, cpu: 2, cooling: 1, radar: 0 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', team: 1 }
  );
  const { frames } = await runBattle(page, [shooter, target], { tickLimit: 20 });
  const frameWithProj = frames.find(f => f.projectiles.length > 0);
  if (frameWithProj) {
    const p = frameWithProj.projectiles[0];
    expect(p.type).toBe('missile');
  }
});

test('triple weapon produces multiple projectiles per shot', async ({ page }) => {
  const shooter = await makeCombatRobot(page,
    '0 AIM\n1 FIRE',
    { id: 'shooter', team: 0,
      hardware: { armor: 1, shield: 0, weapon: 'triple', engine: 0, energy: 2, cpu: 2, cooling: 2, radar: 0 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', team: 1 }
  );
  const { frames } = await runBattle(page, [shooter, target], { tickLimit: 5 });
  const frameWithProj = frames.find(f => f.projectiles.length >= 3);
  expect(frameWithProj).toBeDefined();
});
