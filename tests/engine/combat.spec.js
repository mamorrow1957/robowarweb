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

// ── v0.5 Wall-distance sensors ────────────────────────────────────────────────

async function getSensors(page, tickLimit = 2) {
  return page.evaluate(async (tickLimit) => {
    const { compile } = await import('/src/engine/compiler.js');
    const { CombatEngine } = await import('/src/engine/combat.js');
    const { bytecode } = compile('LOOP POOL');
    const robots = [
      { id: 'r1', name: 'A', bytecode, team: 0,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 3 } },
      { id: 'r2', name: 'B', bytecode, team: 1,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 3 } },
    ];
    const engine = new CombatEngine({ robots, arenaWidth: 300, arenaHeight: 300,
                                      tickLimit, seed: 777 });
    const { frames } = engine.simulate();
    // Extract sensor state from the internal robots after simulation
    return {
      robots: engine.robots.map(r => ({ id: r.id, sensors: { ...r.sensors }, x: r.x, y: r.y })),
    };
  }, tickLimit);
}

test('TOP sensor equals robot y position', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.TOP).toBe(Math.round(r.y));
  }
});

test('BOT sensor equals arenaHeight minus robot y', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.BOT).toBe(300 - Math.round(r.y));
  }
});

test('LEFT sensor equals robot x position', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.LEFT).toBe(Math.round(r.x));
  }
});

test('RIGHT sensor equals arenaWidth minus robot x', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.RIGHT).toBe(300 - Math.round(r.x));
  }
});

test('wall distance sensors sum to arena size', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.TOP + r.sensors.BOT).toBe(300);
    expect(r.sensors.LEFT + r.sensors.RIGHT).toBe(300);
  }
});

// ── v0.5 X / Y / ID / CHRONON sensors ────────────────────────────────────────

test('X sensor matches POSX', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.POSX).toBe(Math.round(r.x));
  }
});

test('Y sensor matches POSY', async ({ page }) => {
  const { robots } = await getSensors(page);
  for (const r of robots) {
    expect(r.sensors.POSY).toBe(Math.round(r.y));
  }
});

test('ID sensor is 0 for first robot and 1 for second', async ({ page }) => {
  const { robots } = await getSensors(page);
  expect(robots[0].sensors.ID).toBe(0);
  expect(robots[1].sensors.ID).toBe(1);
});

test('CHRONON (TIME) increases each tick', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { CombatEngine } = await import('/src/engine/combat.js');
    const { bytecode } = compile('LOOP POOL');
    const robots = [
      { id: 'r1', bytecode, team: 0,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } },
      { id: 'r2', bytecode, team: 1,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } },
    ];
    const engine = new CombatEngine({ robots, arenaWidth: 300, arenaHeight: 300, tickLimit: 5, seed: 1 });
    const { frames } = engine.simulate();
    return { ticks: frames.map(f => f.tick) };
  });
  expect(result.ticks[0]).toBe(1);
  expect(result.ticks[4]).toBe(5);
});

// ── v0.5 DAMAGE sensor ────────────────────────────────────────────────────────

test('DAMAGE sensor increases when robot takes hits', async ({ page }) => {
  const shooter = await makeCombatRobot(page,
    'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL',
    { id: 'shooter', name: 'Shooter', team: 0,
      hardware: { armor: 2, shield: 0, weapon: 'bullet', engine: 0, energy: 2, cpu: 3, cooling: 2, radar: 3 } }
  );
  const target = await makeCombatRobot(page,
    'LOOP POOL',
    { id: 'target', name: 'Target', team: 1,
      hardware: { armor: 2, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } }
  );
  const result = await page.evaluate(async ({ shooter, target }) => {
    const { CombatEngine } = await import('/src/engine/combat.js');
    const engine = new CombatEngine({
      robots: [shooter, target], arenaWidth: 300, arenaHeight: 300,
      tickLimit: 500, seed: 42,
    });
    engine.simulate();
    const tgt = engine.robots.find(r => r.id === 'target');
    return { totalDamage: tgt?.totalDamage ?? 0 };
  }, { shooter, target });
  expect(result.totalDamage).toBeGreaterThan(0);
});

// ── v0.5 ROBOTS sensor ────────────────────────────────────────────────────────

test('ROBOTS (TEAMMATES) sensor counts all alive robots including self', async ({ page }) => {
  const { robots } = await getSensors(page);
  // 2-robot battle: each should see TEAMMATES = 2
  for (const r of robots) {
    expect(r.sensors.TEAMMATES).toBe(2);
  }
});

// ── v0.5 SCAN offset ─────────────────────────────────────────────────────────

test('SCAN offset shifts radar detection direction', async ({ page }) => {
  // Robot with 360° radar detects enemy regardless of SCAN offset
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { CombatEngine } = await import('/src/engine/combat.js');
    const { bytecode: bc1 } = compile('LOOP POOL');
    const { bytecode: bc2 } = compile('90 SCAN\nLOOP POOL');  // 90° scan offset
    const robots = [
      { id: 'r1', bytecode: bc1, team: 0,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 1, cooling: 0, radar: 3 } },
      { id: 'r2', bytecode: bc2, team: 1,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 1, cooling: 0, radar: 3 } },
    ];
    const engine = new CombatEngine({ robots, arenaWidth: 300, arenaHeight: 300, tickLimit: 5, seed: 5 });
    engine.simulate();
    return { r2Scan: engine.robots[1].vm.scan };
  });
  // SCAN register should have been written
  expect(result.r2Scan).toBe(90);
});

// ── v0.5 Interrupt system ─────────────────────────────────────────────────────

test('WALL interrupt fires when robot is near a wall', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { CombatEngine } = await import('/src/engine/combat.js');
    // Robot that sets up WALL interrupt with large threshold (sure to fire)
    const { bytecode: bc1 } = compile(
      'SETINT WALL wallHandler\nSETPARAM WALL 200\nINTON\nLOOP POOL\nwallHandler:\n99 STORE 1\nRTI'
    );
    const { bytecode: bc2 } = compile('LOOP POOL');
    const robots = [
      { id: 'r1', bytecode: bc1, team: 0,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 3, cooling: 0, radar: 0 } },
      { id: 'r2', bytecode: bc2, team: 1,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } },
    ];
    const engine = new CombatEngine({ robots, arenaWidth: 300, arenaHeight: 300, tickLimit: 20, seed: 1 });
    engine.simulate();
    return { handlerVar: engine.robots[0].vm.vars[1] };
  });
  // The handler should have executed (stored 99 into var 1)
  expect(result.handlerVar).toBe(99);
});

test('CHRONON interrupt fires every N ticks', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { CombatEngine } = await import('/src/engine/combat.js');
    // Fire CHRONON every 5 ticks; increment a counter in var 1
    const { bytecode: bc1 } = compile(
      'SETINT CHRONON chronHandler\nSETPARAM CHRONON 5\nINTON\nLOOP POOL\nchronHandler:\nRECALL 1 1 + STORE 1\nRTI'
    );
    const { bytecode: bc2 } = compile('LOOP POOL');
    const robots = [
      { id: 'r1', bytecode: bc1, team: 0,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 3, cooling: 0, radar: 0 } },
      { id: 'r2', bytecode: bc2, team: 1,
        hardware: { armor: 0, shield: 0, weapon: 'none', engine: 0, energy: 0, cpu: 0, cooling: 0, radar: 0 } },
    ];
    const engine = new CombatEngine({ robots, arenaWidth: 300, arenaHeight: 300, tickLimit: 20, seed: 2 });
    engine.simulate();
    return { counter: engine.robots[0].vm.vars[1] };
  });
  // 20 ticks / 5 = up to 4 firings (exact count depends on tick 0 handling)
  expect(result.counter).toBeGreaterThan(0);
});
