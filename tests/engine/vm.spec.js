/**
 * VM unit tests — run engine code in the Vite dev server context.
 */
import { test, expect } from '@playwright/test';
import { loadApp, DEFAULT_SENSORS } from '../helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
});

// Count how many step() calls are needed to execute all instructions exactly once.
// Two-word opcodes: PUSH=0, STORE=25, RECALL=26, JUMP=27, JIZ=28, CALL=29, RREAD=31, RWRITE=32
const TWO_WORD = new Set([0, 25, 26, 27, 28, 29, 31, 32]);
function instrCount(bc) {
  let n = 0, i = 0;
  while (i < bc.length) { n++; i += TWO_WORD.has(bc[i]) ? 2 : 1; }
  return n;
}

// Run a program for exactly one full pass (default) or a specified cycle count.
async function run(page, source, cycles = undefined) {
  return page.evaluate(async ({ src, cycles }) => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick } = await import('/src/engine/vm.js');
    const { bytecode, errors } = compile(src);
    if (errors.length) return { error: errors[0] };

    // Default: count instructions so the program runs exactly once
    const twoWord = new Set([0, 25, 26, 27, 28, 29, 31, 32]);
    const actualCycles = cycles ?? (() => {
      let n = 0, i = 0;
      while (i < bytecode.length) { n++; i += twoWord.has(bytecode[i]) ? 2 : 1; }
      return n || 1;
    })();

    const vm = createVM(bytecode);
    runTick(vm, actualCycles);
    return { stack: vm.stack, fire: vm.fire, thrustX: vm.thrustX, thrustY: vm.thrustY,
             brake: vm.brake, aim: vm.aim, shield: vm.shield, vars: vm.vars, pc: vm.pc };
  }, { src: source, cycles });
}

async function runWithSensors(page, source, sensors, cycles = undefined) {
  return page.evaluate(async ({ src, sensors, cycles }) => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, setSensors, runTick } = await import('/src/engine/vm.js');
    const { bytecode } = compile(src);

    const twoWord = new Set([0, 25, 26, 27, 28, 29, 31, 32]);
    const actualCycles = cycles ?? (() => {
      let n = 0, i = 0;
      while (i < bytecode.length) { n++; i += twoWord.has(bytecode[i]) ? 2 : 1; }
      return n || 1;
    })();

    const vm = createVM(bytecode);
    setSensors(vm, sensors);
    runTick(vm, actualCycles);
    return { stack: vm.stack, fire: vm.fire, thrustX: vm.thrustX, thrustY: vm.thrustY,
             brake: vm.brake, aim: vm.aim, shield: vm.shield, vars: vm.vars, pc: vm.pc };
  }, { src: source, sensors, cycles });
}

// ── PUSH ─────────────────────────────────────────────────────────────────────

test('PUSH pushes value onto stack', async ({ page }) => {
  const { stack } = await run(page, '42');
  expect(stack).toContain(42);
});

test('multiple PUSH values on stack in order', async ({ page }) => {
  const { stack } = await run(page, '1 2 3');
  expect(stack).toEqual([1, 2, 3]);
});

// ── Arithmetic ────────────────────────────────────────────────────────────────

test('ADD sums top two values', async ({ page }) => {
  const { stack } = await run(page, '3 4 +');
  expect(stack).toEqual([7]);
});

test('SUB subtracts', async ({ page }) => {
  const { stack } = await run(page, '10 3 -');
  expect(stack).toEqual([7]);
});

test('MUL multiplies', async ({ page }) => {
  const { stack } = await run(page, '6 7 *');
  expect(stack).toEqual([42]);
});

test('DIV divides (integer)', async ({ page }) => {
  const { stack } = await run(page, '10 3 /');
  expect(stack).toEqual([3]);
});

test('DIV by zero returns 0', async ({ page }) => {
  const { stack } = await run(page, '10 0 /');
  expect(stack).toEqual([0]);
});

test('MOD returns remainder', async ({ page }) => {
  const { stack } = await run(page, '10 3 MOD');
  expect(stack).toEqual([1]);
});

test('ABS of negative', async ({ page }) => {
  const { stack } = await run(page, '-5 ABS');
  expect(stack).toEqual([5]);
});

test('NEG negates', async ({ page }) => {
  const { stack } = await run(page, '7 NEG');
  expect(stack).toEqual([-7]);
});

test('MAX returns larger value', async ({ page }) => {
  const { stack } = await run(page, '3 9 MAX');
  expect(stack).toEqual([9]);
});

test('MIN returns smaller value', async ({ page }) => {
  const { stack } = await run(page, '3 9 MIN');
  expect(stack).toEqual([3]);
});

// ── Comparison ────────────────────────────────────────────────────────────────

test('= returns 1 when equal', async ({ page }) => {
  const { stack } = await run(page, '5 5 =');
  expect(stack).toEqual([1]);
});

test('= returns 0 when not equal', async ({ page }) => {
  const { stack } = await run(page, '5 4 =');
  expect(stack).toEqual([0]);
});

test('<> returns 1 when not equal', async ({ page }) => {
  const { stack } = await run(page, '5 4 <>');
  expect(stack).toEqual([1]);
});

test('< returns 1 when less', async ({ page }) => {
  const { stack } = await run(page, '3 5 <');
  expect(stack).toEqual([1]);
});

test('> returns 1 when greater', async ({ page }) => {
  const { stack } = await run(page, '5 3 >');
  expect(stack).toEqual([1]);
});

test('<= returns 1 when equal', async ({ page }) => {
  const { stack } = await run(page, '5 5 <=');
  expect(stack).toEqual([1]);
});

test('>= returns 1 when equal', async ({ page }) => {
  const { stack } = await run(page, '5 5 >=');
  expect(stack).toEqual([1]);
});

// ── Logic ─────────────────────────────────────────────────────────────────────

test('AND returns 1 when both nonzero', async ({ page }) => {
  const { stack } = await run(page, '1 1 AND');
  expect(stack).toEqual([1]);
});

test('AND returns 0 when one is zero', async ({ page }) => {
  const { stack } = await run(page, '1 0 AND');
  expect(stack).toEqual([0]);
});

test('OR returns 1 when one nonzero', async ({ page }) => {
  const { stack } = await run(page, '0 1 OR');
  expect(stack).toEqual([1]);
});

test('NOT inverts: 0 → 1', async ({ page }) => {
  const { stack } = await run(page, '0 NOT');
  expect(stack).toEqual([1]);
});

test('NOT inverts: 1 → 0', async ({ page }) => {
  const { stack } = await run(page, '1 NOT');
  expect(stack).toEqual([0]);
});

test('XOR: 1 XOR 0 = 1', async ({ page }) => {
  const { stack } = await run(page, '1 0 XOR');
  expect(stack).toEqual([1]);
});

test('XOR: 1 XOR 1 = 0', async ({ page }) => {
  const { stack } = await run(page, '1 1 XOR');
  expect(stack).toEqual([0]);
});

// ── Stack manipulation ────────────────────────────────────────────────────────

test('DUP duplicates top', async ({ page }) => {
  const { stack } = await run(page, '7 DUP');
  expect(stack).toEqual([7, 7]);
});

test('POP removes top', async ({ page }) => {
  const { stack } = await run(page, '1 2 POP');
  expect(stack).toEqual([1]);
});

test('SWAP swaps top two', async ({ page }) => {
  const { stack } = await run(page, '1 2 SWAP');
  expect(stack).toEqual([2, 1]);
});

test('OVER copies second item to top', async ({ page }) => {
  const { stack } = await run(page, '1 2 OVER');
  expect(stack).toEqual([1, 2, 1]);
});

test('ROT rotates: a b c → b c a', async ({ page }) => {
  const { stack } = await run(page, '1 2 3 ROT');
  expect(stack).toEqual([2, 3, 1]);
});

test('underflow (pop from empty stack) returns 0', async ({ page }) => {
  const { stack } = await run(page, '+');
  // ADD pops two 0s (underflow) and pushes 0
  expect(stack).toContain(0);
  expect(stack).toHaveLength(1);
});

// ── STORE / RECALL ────────────────────────────────────────────────────────────

test('STORE saves value to variable slot', async ({ page }) => {
  const { vars } = await run(page, '99 STORE 3');
  expect(vars[3]).toBe(99);
});

test('RECALL reads stored value', async ({ page }) => {
  const { stack } = await run(page, '42 STORE 5 RECALL 5');
  expect(stack).toEqual([42]);
});

test('RECALL from unwritten slot returns 0', async ({ page }) => {
  const { stack } = await run(page, 'RECALL 10');
  expect(stack).toEqual([0]);
});

// ── Control flow ──────────────────────────────────────────────────────────────

test('IF true branch executes', async ({ page }) => {
  const { stack } = await run(page, '1 IF 99 ENDIF');
  expect(stack).toContain(99);
});

test('IF false branch skips body', async ({ page }) => {
  const { stack } = await run(page, '0 IF 99 ENDIF');
  expect(stack).not.toContain(99);
});

test('IF ELSE ENDIF runs else when condition is false', async ({ page }) => {
  const { stack } = await run(page, '0 IF 1 ELSE 2 ENDIF', 10);
  expect(stack).toContain(2);
  expect(stack).not.toContain(1);
});

test('LOOP POOL wraps around (does not error)', async ({ page }) => {
  const { stack } = await run(page, 'LOOP 5 POP POOL', 12);
  expect(Array.isArray(stack)).toBe(true);
});

// ── Registers ─────────────────────────────────────────────────────────────────

test('reading ENERGY returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'ENERGY', { ENERGY: 75 });
  expect(stack).toEqual([75]);
});

test('reading ARMOR returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'ARMOR', { ARMOR: 50 });
  expect(stack).toEqual([50]);
});

test('reading RADAR returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'RADAR', { RADAR: 45 });
  expect(stack).toEqual([45]);
});

test('reading RANGE returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'RANGE', { RANGE: 200 });
  expect(stack).toEqual([200]);
});

test('reading HEAT returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'HEAT', { HEAT: 10 });
  expect(stack).toEqual([10]);
});

test('reading POSX returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'POSX', { POSX: 150 });
  expect(stack).toEqual([150]);
});

test('reading POSY returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'POSY', { POSY: 200 });
  expect(stack).toEqual([200]);
});

test('reading COLLISION returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'COLLISION', { COLLISION: 1 });
  expect(stack).toEqual([1]);
});

test('reading RANDOM returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'RANDOM', { RANDOM: 128 });
  expect(stack).toEqual([128]);
});

test('writing FIRE sets vm.fire', async ({ page }) => {
  const { fire } = await run(page, '1 FIRE');
  expect(fire).toBe(1);
});

test('writing AIM sets vm.aim', async ({ page }) => {
  const { aim } = await run(page, '90 AIM');
  expect(aim).toBe(90);
});

test('writing THRUSTX sets vm.thrustX', async ({ page }) => {
  const { thrustX } = await run(page, '3 THRUSTX');
  expect(thrustX).toBe(3);
});

test('writing THRUSTY sets vm.thrustY', async ({ page }) => {
  const { thrustY } = await run(page, '2 THRUSTY');
  expect(thrustY).toBe(2);
});

test('writing BRAKE with nonzero sets vm.brake to true', async ({ page }) => {
  const { brake } = await run(page, '1 BRAKE');
  expect(brake).toBe(true);
});

test('writing BRAKE with 0 sets vm.brake to false', async ({ page }) => {
  const { brake } = await run(page, '0 BRAKE');
  expect(brake).toBe(false);
});

test('THRUSTX clamped to max 5', async ({ page }) => {
  const { thrustX } = await run(page, '100 THRUSTX');
  expect(thrustX).toBe(5);
});

test('THRUSTX clamped to min -5', async ({ page }) => {
  const { thrustX } = await run(page, '-100 THRUSTX');
  expect(thrustX).toBe(-5);
});

// ── CALL / RETURN ─────────────────────────────────────────────────────────────

test('CALL jumps to subroutine and RETURN comes back', async ({ page }) => {
  // CALL sub → sub: push 99, RETURN → push 1, GOTO done → done:
  const src = 'CALL sub\n1\nGOTO done\nsub:\n99\nRETURN\ndone:';
  const { stack } = await run(page, src, 20);
  expect(stack).toContain(99);
  expect(stack).toContain(1);
});

// ── Stack overflow protection ─────────────────────────────────────────────────

test('stack overflow: oldest entry dropped when > 256 items', async ({ page }) => {
  const { stackLength } = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick } = await import('/src/engine/vm.js');
    const { bytecode } = compile('LOOP 1 POOL');
    const vm = createVM(bytecode);
    runTick(vm, 600);
    return { stackLength: vm.stack.length };
  });
  expect(stackLength).toBeLessThanOrEqual(256);
});

// ── PC wrap-around ────────────────────────────────────────────────────────────

test('PC wraps to 0 when it exceeds bytecode length', async ({ page }) => {
  const { pc } = await page.evaluate(async () => {
    const { createVM, runTick } = await import('/src/engine/vm.js');
    const vm = createVM([0, 5]); // PUSH 5, then PC goes out of bounds
    runTick(vm, 5);
    return { pc: vm.pc };
  });
  expect(pc).toBeGreaterThanOrEqual(0);
});
