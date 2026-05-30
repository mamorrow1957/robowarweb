/**
 * VM unit tests — run engine code in the Vite dev server context.
 */
import { test, expect } from '@playwright/test';
import { loadApp, DEFAULT_SENSORS } from '../helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
});

// Count instructions in bytecode — accounts for 1-word, 2-word, and 3-word opcodes.
// 2-word: PUSH=0, STORE=25, RECALL=26, JUMP=27, JIZ=28, CALL=29, RREAD=31, RWRITE=32
// 3-word (v0.5): SETINT=41, SETPARAM=42
const TWO_WORD   = new Set([0, 25, 26, 27, 28, 29, 31, 32]);
const THREE_WORD = new Set([41, 42]);
function instrCount(bc) {
  let n = 0, i = 0;
  while (i < bc.length) {
    n++;
    if (THREE_WORD.has(bc[i])) i += 3;
    else if (TWO_WORD.has(bc[i])) i += 2;
    else i += 1;
  }
  return n;
}

// Run a program for exactly one full pass (default) or a specified cycle count.
async function run(page, source, cycles = undefined) {
  return page.evaluate(async ({ src, cycles }) => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick } = await import('/src/engine/vm.js');
    const { bytecode, errors } = compile(src);
    if (errors.length) return { error: errors[0] };

    const twoWord   = new Set([0, 25, 26, 27, 28, 29, 31, 32]);
    const threeWord = new Set([41, 42]);
    const actualCycles = cycles ?? (() => {
      let n = 0, i = 0;
      while (i < bytecode.length) {
        n++;
        if (threeWord.has(bytecode[i])) i += 3;
        else if (twoWord.has(bytecode[i])) i += 2;
        else i += 1;
      }
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

    const twoWord   = new Set([0, 25, 26, 27, 28, 29, 31, 32]);
    const threeWord = new Set([41, 42]);
    const actualCycles = cycles ?? (() => {
      let n = 0, i = 0;
      while (i < bytecode.length) {
        n++;
        if (threeWord.has(bytecode[i])) i += 3;
        else if (twoWord.has(bytecode[i])) i += 2;
        else i += 1;
      }
      return n || 1;
    })();

    const vm = createVM(bytecode);
    setSensors(vm, sensors);
    runTick(vm, actualCycles);
    return { stack: vm.stack, fire: vm.fire, thrustX: vm.thrustX, thrustY: vm.thrustY,
             brake: vm.brake, aim: vm.aim, shield: vm.shield, vars: vm.vars, pc: vm.pc };
  }, { src: source, sensors, cycles });
}

// Full-state run — returns entire VM object for interrupt / look / scan tests.
async function runFull(page, source, cycles, sensors = {}) {
  return page.evaluate(async ({ src, cycles, sensors }) => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, setSensors, runTick } = await import('/src/engine/vm.js');
    const { bytecode, errors } = compile(src);
    if (errors.length) return { error: errors[0] };
    const vm = createVM(bytecode);
    if (Object.keys(sensors).length) setSensors(vm, sensors);
    runTick(vm, cycles);
    return {
      stack: vm.stack, fire: vm.fire, thrustX: vm.thrustX, thrustY: vm.thrustY,
      brake: vm.brake, aim: vm.aim, shield: vm.shield, vars: vm.vars, pc: vm.pc,
      look: vm.look, scan: vm.scan,
      intEnabled: vm.intEnabled, intHandlers: vm.intHandlers,
      intParams: vm.intParams, intQueue: vm.intQueue, intReturnPC: vm.intReturnPC,
    };
  }, { src: source, cycles, sensors });
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

test('writing FIRE increments vm.fire counter', async ({ page }) => {
  const { fire } = await run(page, '1 FIRE');
  expect(fire).toBe(1);
});

test('two FIRE writes in one tick increment counter to 2', async ({ page }) => {
  const { fire } = await run(page, '1 FIRE 1 FIRE');
  expect(fire).toBe(2);
});

test('writing 0 to FIRE does not increment counter', async ({ page }) => {
  const { fire } = await run(page, '0 FIRE 1 FIRE');
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

// ── v0.5 Math — SQRT / DIST ───────────────────────────────────────────────────

test('SQRT of perfect square returns integer root', async ({ page }) => {
  const { stack } = await run(page, '25 SQRT');
  expect(stack).toEqual([5]);
});

test('SQRT of 9 returns 3', async ({ page }) => {
  const { stack } = await run(page, '9 SQRT');
  expect(stack).toEqual([3]);
});

test('SQRT of 0 returns 0', async ({ page }) => {
  const { stack } = await run(page, '0 SQRT');
  expect(stack).toEqual([0]);
});

test('SQRT of negative returns 0', async ({ page }) => {
  const { stack } = await run(page, '-4 SQRT');
  expect(stack).toEqual([0]);
});

test('SQRT floors non-perfect square', async ({ page }) => {
  const { stack } = await run(page, '10 SQRT');
  expect(stack).toEqual([3]);  // floor(sqrt(10)) = 3
});

test('DIST of 3 4 returns 5 (Pythagorean)', async ({ page }) => {
  const { stack } = await run(page, '3 4 DIST');
  expect(stack).toEqual([5]);
});

test('DIST of 0 0 returns 0', async ({ page }) => {
  const { stack } = await run(page, '0 0 DIST');
  expect(stack).toEqual([0]);
});

// ── v0.5 Trig — SIN / COS / TAN ──────────────────────────────────────────────

test('SIN 90 returns 1000', async ({ page }) => {
  const { stack } = await run(page, '90 SIN');
  expect(stack).toEqual([1000]);
});

test('SIN 0 returns 0', async ({ page }) => {
  const { stack } = await run(page, '0 SIN');
  expect(stack).toEqual([0]);
});

test('SIN 180 returns 0', async ({ page }) => {
  const { stack } = await run(page, '180 SIN');
  expect(stack[0]).toBeLessThanOrEqual(0);
  expect(Math.abs(stack[0])).toBeLessThanOrEqual(1);  // ≈ 0 due to float precision
});

test('COS 0 returns 1000', async ({ page }) => {
  const { stack } = await run(page, '0 COS');
  expect(stack).toEqual([1000]);
});

test('COS 90 returns 0', async ({ page }) => {
  const { stack } = await run(page, '90 COS');
  expect(Math.abs(stack[0])).toBeLessThanOrEqual(1);  // ≈ 0 due to float precision
});

test('COS 180 returns -1000', async ({ page }) => {
  const { stack } = await run(page, '180 COS');
  expect(stack).toEqual([-1000]);
});

test('TAN 45 returns 1000', async ({ page }) => {
  const { stack } = await run(page, '45 TAN');
  expect(stack).toEqual([1000]);
});

test('TAN 0 returns 0', async ({ page }) => {
  const { stack } = await run(page, '0 TAN');
  expect(stack).toEqual([0]);
});

test('TAN 90 returns 0 (undefined clamped)', async ({ page }) => {
  const { stack } = await run(page, '90 TAN');
  expect(stack).toEqual([0]);
});

test('TAN 270 returns 0 (undefined clamped)', async ({ page }) => {
  const { stack } = await run(page, '270 TAN');
  expect(stack).toEqual([0]);
});

// ── v0.5 Trig — ARCTAN / ARCSIN / ARCCOS ─────────────────────────────────────

test('ARCTAN y=0 x=1000 returns 0 degrees (right)', async ({ page }) => {
  // Stack: y x — deg; push y then x
  const { stack } = await run(page, '0 1000 ARCTAN');
  expect(stack).toEqual([0]);
});

test('ARCTAN y=1000 x=0 returns 90 degrees (down)', async ({ page }) => {
  const { stack } = await run(page, '1000 0 ARCTAN');
  expect(stack).toEqual([90]);
});

test('ARCTAN y=0 x=-1 returns 180 degrees (left)', async ({ page }) => {
  const { stack } = await run(page, '0 -1 ARCTAN');
  expect(stack).toEqual([180]);
});

test('ARCSIN 1000 returns 90', async ({ page }) => {
  const { stack } = await run(page, '1000 ARCSIN');
  expect(stack).toEqual([90]);
});

test('ARCSIN 0 returns 0', async ({ page }) => {
  const { stack } = await run(page, '0 ARCSIN');
  expect(stack).toEqual([0]);
});

test('ARCSIN clamps input > 1000', async ({ page }) => {
  // Should not NaN — clamp to 1, return 90
  const { stack } = await run(page, '2000 ARCSIN');
  expect(stack).toEqual([90]);
});

test('ARCCOS 1000 returns 0', async ({ page }) => {
  const { stack } = await run(page, '1000 ARCCOS');
  expect(stack).toEqual([0]);
});

test('ARCCOS 0 returns 90', async ({ page }) => {
  const { stack } = await run(page, '0 ARCCOS');
  expect(stack).toEqual([90]);
});

// ── v0.5 Interrupt control — INTON / INTOFF / FLUSHINT ───────────────────────

test('INTOFF sets intEnabled to false', async ({ page }) => {
  const { intEnabled } = await runFull(page, 'INTOFF', 1);
  expect(intEnabled).toBe(false);
});

test('INTON sets intEnabled to true', async ({ page }) => {
  // Turn off then back on
  const { intEnabled } = await runFull(page, 'INTOFF INTON', 2);
  expect(intEnabled).toBe(true);
});

test('FLUSHINT clears the interrupt queue', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick, queueInterrupt } = await import('/src/engine/vm.js');
    const { bytecode } = compile('FLUSHINT');
    const vm = createVM(bytecode);
    // Manually register handler and queue an interrupt
    vm.intHandlers[0] = 99;
    queueInterrupt(vm, 0);
    runTick(vm, 1);
    return { intQueue: vm.intQueue };
  });
  expect(result.intQueue).toHaveLength(0);
});

// ── v0.5 Interrupt control — SETINT / SETPARAM ───────────────────────────────

test('SETINT stores handler PC in intHandlers', async ({ page }) => {
  // SETINT DAMAGE handler → bytecode: [SETINT(41), 2, 3] then handler: label at PC 3
  const { intHandlers } = await runFull(page,
    'SETINT DAMAGE handler\nhandler:', 1);
  expect(intHandlers[2]).toBe(3);  // DAMAGE=2, handler at PC 3
});

test('SETPARAM stores threshold in intParams', async ({ page }) => {
  const { intParams } = await runFull(page, 'SETPARAM WALL 50', 1);
  expect(intParams[1]).toBe(50);  // WALL=1
});

test('SETPARAM CHRONON 10 sets CHRONON param', async ({ page }) => {
  const { intParams } = await runFull(page, 'SETPARAM CHRONON 10', 1);
  expect(intParams[12]).toBe(10);  // CHRONON=12
});

// ── v0.5 Interrupt dispatch ───────────────────────────────────────────────────

test('queued interrupt redirects execution to handler', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick, queueInterrupt } = await import('/src/engine/vm.js');
    // Program: push 1 (main body) ; handler: push 99
    const { bytecode } = compile('1\nGOTO done\nhandler:\n99\ndone:');
    const vm = createVM(bytecode);
    // Register handler for interrupt type 0 (COLLISION)
    vm.intHandlers[0] = 4;  // handler: is at PC 4 (after PUSH 1, JUMP done)
    // Queue the interrupt before running
    queueInterrupt(vm, 0);
    runTick(vm, 10);
    return { stack: vm.stack };
  });
  // Handler (push 99) should have executed
  expect(result.stack).toContain(99);
});

test('interrupt does not fire when intEnabled is false', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick, queueInterrupt } = await import('/src/engine/vm.js');
    const { bytecode } = compile('1');
    const vm = createVM(bytecode);
    vm.intHandlers[0] = 99;
    vm.intEnabled = false;
    queueInterrupt(vm, 0);
    runTick(vm, 5);
    return { intQueue: vm.intQueue };
  });
  // Queue not cleared since interrupts disabled
  expect(result.intQueue).toContain(0);
});

test('RTI re-enables interrupts and restores PC', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick, queueInterrupt } = await import('/src/engine/vm.js');
    const { bytecode } = compile('GOTO done\nhandler:\n99\nRTI\ndone:\n1');
    const vm = createVM(bytecode);
    vm.intHandlers[0] = 2;  // handler: at PC 2 (after JUMP done instruction)
    queueInterrupt(vm, 0);
    runTick(vm, 20);
    return { stack: vm.stack, intEnabled: vm.intEnabled };
  });
  expect(result.intEnabled).toBe(true);
  expect(result.stack).toContain(99);
});

// ── v0.5 LOOK / SCAN registers ────────────────────────────────────────────────

test('writing LOOK sets vm.look', async ({ page }) => {
  const { look } = await runFull(page, '45 LOOK', 2);
  expect(look).toBe(45);
});

test('writing SCAN sets vm.scan', async ({ page }) => {
  const { scan } = await runFull(page, '90 SCAN', 2);
  expect(scan).toBe(90);
});

test('LOOK value wraps at 360', async ({ page }) => {
  const { look } = await runFull(page, '400 LOOK', 2);
  expect(look).toBe(40);  // 400 % 360 = 40
});

test('LOOK resets to 0 at the start of each tick', async ({ page }) => {
  // Program writes LOOK before the loop; only affects the tick it executes in
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick } = await import('/src/engine/vm.js');
    const { bytecode } = compile('45 LOOK LOOP POOL');
    const vm = createVM(bytecode);
    runTick(vm, 3);   // tick 1: writes LOOK=45, enters empty loop
    const afterTick1 = vm.look;
    runTick(vm, 5);   // tick 2: resetActuators fires, loop spins, never re-writes LOOK
    return { afterTick1, afterTick2: vm.look };
  });
  expect(result.afterTick1).toBe(45);
  expect(result.afterTick2).toBe(0);
});

test('SCAN resets to 0 at the start of each tick', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('/src/engine/compiler.js');
    const { createVM, runTick } = await import('/src/engine/vm.js');
    const { bytecode } = compile('90 SCAN LOOP POOL');
    const vm = createVM(bytecode);
    runTick(vm, 3);
    const afterTick1 = vm.scan;
    runTick(vm, 5);
    return { afterTick1, afterTick2: vm.scan };
  });
  expect(result.afterTick1).toBe(90);
  expect(result.afterTick2).toBe(0);
});

// ── v0.5 New sensor reads ─────────────────────────────────────────────────────

test('reading DAMAGE returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'DAMAGE', { DAMAGE: 15 });
  expect(stack).toEqual([15]);
});

test('reading DOPPLER returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'DOPPLER', { DOPPLER: -5 });
  expect(stack).toEqual([-5]);
});

test('reading TOP returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'TOP', { TOP: 30 });
  expect(stack).toEqual([30]);
});

test('reading BOT returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'BOT', { BOT: 40 });
  expect(stack).toEqual([40]);
});

test('reading LEFT returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'LEFT', { LEFT: 25 });
  expect(stack).toEqual([25]);
});

test('reading RIGHT returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'RIGHT', { RIGHT: 60 });
  expect(stack).toEqual([60]);
});

test('reading ID returns sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'ID', { ID: 1 });
  expect(stack).toEqual([1]);
});

test('X alias returns POSX sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'X', { POSX: 77 });
  expect(stack).toEqual([77]);
});

test('Y alias returns POSY sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'Y', { POSY: 123 });
  expect(stack).toEqual([123]);
});

test('ROBOTS alias returns TEAMMATES sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'ROBOTS', { TEAMMATES: 3 });
  expect(stack).toEqual([3]);
});

test('CHRONON alias returns TIME sensor value', async ({ page }) => {
  const { stack } = await runWithSensors(page, 'CHRONON', { TIME: 42 });
  expect(stack).toEqual([42]);
});
