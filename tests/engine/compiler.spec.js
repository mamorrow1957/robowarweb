/**
 * Compiler unit tests — run engine code in the Vite dev server context
 * via page.evaluate + dynamic import.
 */
import { test, expect } from '@playwright/test';
import { loadApp } from '../helpers.js';

test.beforeEach(async ({ page }) => {
  await loadApp(page);
});

// Helper: run compile() in the browser and return the result
async function compile(page, source) {
  return page.evaluate(async (src) => {
    const { compile } = await import('/src/engine/compiler.js');
    return compile(src);
  }, source);
}

// ── Basic emission ────────────────────────────────────────────────────────────

test('empty source compiles without errors', async ({ page }) => {
  const { errors } = await compile(page, '');
  expect(errors).toHaveLength(0);
});

test('integer literal emits PUSH opcode + value', async ({ page }) => {
  const { bytecode, errors } = await compile(page, '42');
  expect(errors).toHaveLength(0);
  // PUSH=0, value=42
  expect(bytecode).toEqual([0, 42]);
});

test('negative integer literal emits PUSH + negative value', async ({ page }) => {
  const { bytecode } = await compile(page, '-5');
  expect(bytecode).toEqual([0, -5]);
});

test('multiple integers emit multiple PUSH pairs', async ({ page }) => {
  const { bytecode } = await compile(page, '1 2 3');
  expect(bytecode).toEqual([0,1, 0,2, 0,3]);
});

// ── Arithmetic operators ──────────────────────────────────────────────────────

test('+ emits ADD', async ({ page }) => {
  const { bytecode } = await compile(page, '+');
  expect(bytecode).toEqual([1]); // OP.ADD=1
});

test('ADD alias works', async ({ page }) => {
  const { bytecode } = await compile(page, 'ADD');
  expect(bytecode).toEqual([1]);
});

test('- emits SUB', async ({ page }) => {
  const { bytecode } = await compile(page, '-');
  expect(bytecode).toEqual([2]);
});

test('* emits MUL', async ({ page }) => {
  const { bytecode } = await compile(page, '*');
  expect(bytecode).toEqual([3]);
});

test('/ emits DIV', async ({ page }) => {
  const { bytecode } = await compile(page, '/');
  expect(bytecode).toEqual([4]);
});

test('MOD emits MOD opcode', async ({ page }) => {
  const { bytecode } = await compile(page, 'MOD');
  expect(bytecode).toEqual([5]);
});

test('ABS emits ABS', async ({ page }) => {
  const { bytecode } = await compile(page, 'ABS');
  expect(bytecode).toEqual([6]);
});

test('NEG emits NEG', async ({ page }) => {
  const { bytecode } = await compile(page, 'NEG');
  expect(bytecode).toEqual([7]);
});

test('MAX emits MAX', async ({ page }) => {
  const { bytecode } = await compile(page, 'MAX');
  expect(bytecode).toEqual([8]);
});

test('MIN emits MIN', async ({ page }) => {
  const { bytecode } = await compile(page, 'MIN');
  expect(bytecode).toEqual([9]);
});

// ── Comparison operators ──────────────────────────────────────────────────────

test('= emits EQ', async ({ page }) => {
  const { bytecode } = await compile(page, '=');
  expect(bytecode).toEqual([10]);
});

test('<> emits NEQ', async ({ page }) => {
  const { bytecode } = await compile(page, '<>');
  expect(bytecode).toEqual([11]);
});

test('< emits LT', async ({ page }) => {
  const { bytecode } = await compile(page, '<');
  expect(bytecode).toEqual([12]);
});

test('> emits GT', async ({ page }) => {
  const { bytecode } = await compile(page, '>');
  expect(bytecode).toEqual([13]);
});

test('<= emits LTE', async ({ page }) => {
  const { bytecode } = await compile(page, '<=');
  expect(bytecode).toEqual([14]);
});

test('>= emits GTE', async ({ page }) => {
  const { bytecode } = await compile(page, '>=');
  expect(bytecode).toEqual([15]);
});

// ── Logic operators ───────────────────────────────────────────────────────────

test('AND emits AND', async ({ page }) => {
  const { bytecode } = await compile(page, 'AND');
  expect(bytecode).toEqual([16]);
});

test('OR emits OR', async ({ page }) => {
  const { bytecode } = await compile(page, 'OR');
  expect(bytecode).toEqual([17]);
});

test('NOT emits NOT', async ({ page }) => {
  const { bytecode } = await compile(page, 'NOT');
  expect(bytecode).toEqual([18]);
});

test('XOR emits XOR', async ({ page }) => {
  const { bytecode } = await compile(page, 'XOR');
  expect(bytecode).toEqual([19]);
});

// ── Stack operators ───────────────────────────────────────────────────────────

test('DUP emits DUP', async ({ page }) => {
  const { bytecode } = await compile(page, 'DUP');
  expect(bytecode).toEqual([20]);
});

test('POP emits POP', async ({ page }) => {
  const { bytecode } = await compile(page, 'POP');
  expect(bytecode).toEqual([21]);
});

test('DROP is alias for POP', async ({ page }) => {
  const { bytecode } = await compile(page, 'DROP');
  expect(bytecode).toEqual([21]);
});

test('SWAP emits SWAP', async ({ page }) => {
  const { bytecode } = await compile(page, 'SWAP');
  expect(bytecode).toEqual([22]);
});

test('OVER emits OVER', async ({ page }) => {
  const { bytecode } = await compile(page, 'OVER');
  expect(bytecode).toEqual([23]);
});

test('ROT emits ROT', async ({ page }) => {
  const { bytecode } = await compile(page, 'ROT');
  expect(bytecode).toEqual([24]);
});

// ── STORE / RECALL ────────────────────────────────────────────────────────────

test('STORE 1 emits [STORE, 1]', async ({ page }) => {
  const { bytecode, errors } = await compile(page, 'STORE 1');
  expect(errors).toHaveLength(0);
  expect(bytecode).toEqual([25, 1]);
});

test('RECALL 5 emits [RECALL, 5]', async ({ page }) => {
  const { bytecode, errors } = await compile(page, 'RECALL 5');
  expect(errors).toHaveLength(0);
  expect(bytecode).toEqual([26, 5]);
});

test('STORE with invalid slot produces error', async ({ page }) => {
  const { errors } = await compile(page, 'STORE 0');
  expect(errors.length).toBeGreaterThan(0);
});

test('STORE with slot 101 produces error', async ({ page }) => {
  const { errors } = await compile(page, 'STORE 101');
  expect(errors.length).toBeGreaterThan(0);
});

// ── GOTO / CALL / RETURN ──────────────────────────────────────────────────────

test('GOTO to known label emits [JUMP, target]', async ({ page }) => {
  const { bytecode, errors } = await compile(page, 'GOTO end\nend:');
  expect(errors).toHaveLength(0);
  // [JUMP=27, 2] — the label "end" is at PC=2 (past the GOTO instruction)
  expect(bytecode[0]).toBe(27); // OP.JUMP
  expect(bytecode[1]).toBe(2);  // target PC after GOTO
});

test('GOTO to unknown label produces error', async ({ page }) => {
  const { errors } = await compile(page, 'GOTO nowhere');
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toContain('nowhere');
});

test('CALL emits CALL opcode', async ({ page }) => {
  const { bytecode, errors } = await compile(page, 'CALL sub\nsub:');
  expect(errors).toHaveLength(0);
  expect(bytecode[0]).toBe(29); // OP.CALL
});

test('RETURN emits RETURN opcode', async ({ page }) => {
  const { bytecode } = await compile(page, 'RETURN');
  expect(bytecode).toEqual([30]);
});

// ── IF / ELSE / ENDIF ────────────────────────────────────────────────────────

test('IF ENDIF compiles without errors', async ({ page }) => {
  const { errors } = await compile(page, '1 IF POP ENDIF');
  expect(errors).toHaveLength(0);
});

test('IF ELSE ENDIF compiles without errors', async ({ page }) => {
  const { errors } = await compile(page, '1 IF 2 ELSE 3 ENDIF');
  expect(errors).toHaveLength(0);
});

test('IF without ENDIF produces error', async ({ page }) => {
  const { errors } = await compile(page, '1 IF POP');
  expect(errors.length).toBeGreaterThan(0);
});

test('ELSE without IF produces error', async ({ page }) => {
  const { errors } = await compile(page, 'ELSE');
  expect(errors.length).toBeGreaterThan(0);
});

test('ENDIF without IF produces error', async ({ page }) => {
  const { errors } = await compile(page, 'ENDIF');
  expect(errors.length).toBeGreaterThan(0);
});

test('IF emits JIZ opcode', async ({ page }) => {
  const { bytecode } = await compile(page, '1 IF ENDIF');
  // bytecode: [PUSH,1, JIZ,target]
  expect(bytecode[2]).toBe(28); // OP.JIZ
});

// ── LOOP / POOL ───────────────────────────────────────────────────────────────

test('LOOP POOL compiles without errors', async ({ page }) => {
  const { errors } = await compile(page, 'LOOP 1 POOL');
  expect(errors).toHaveLength(0);
});

test('LOOP emits no bytecode itself', async ({ page }) => {
  // LOOP just marks the jump target; POOL emits [JUMP, start]
  const { bytecode } = await compile(page, 'LOOP POOL');
  expect(bytecode).toEqual([27, 0]); // JUMP back to PC 0
});

test('POOL without LOOP produces error', async ({ page }) => {
  const { errors } = await compile(page, 'POOL');
  expect(errors.length).toBeGreaterThan(0);
});

test('LOOP without POOL produces error', async ({ page }) => {
  const { errors } = await compile(page, 'LOOP');
  expect(errors.length).toBeGreaterThan(0);
});

test('nested LOOP POOL compiles correctly', async ({ page }) => {
  const { errors } = await compile(page, 'LOOP LOOP 1 POOL POOL');
  expect(errors).toHaveLength(0);
});

// ── Register reads ────────────────────────────────────────────────────────────

test('ENERGY emits RREAD with index 0', async ({ page }) => {
  const { bytecode } = await compile(page, 'ENERGY');
  expect(bytecode).toEqual([31, 0]); // RREAD=31, REG.ENERGY=0
});

test('ARMOR emits RREAD with index 1', async ({ page }) => {
  const { bytecode } = await compile(page, 'ARMOR');
  expect(bytecode).toEqual([31, 1]);
});

test('RADAR emits RREAD with index 4', async ({ page }) => {
  const { bytecode } = await compile(page, 'RADAR');
  expect(bytecode).toEqual([31, 4]);
});

test('RANDOM emits RREAD with index 12', async ({ page }) => {
  const { bytecode } = await compile(page, 'RANDOM');
  expect(bytecode).toEqual([31, 12]);
});

// ── Register writes ───────────────────────────────────────────────────────────

test('FIRE emits RWRITE with index 17', async ({ page }) => {
  const { bytecode } = await compile(page, 'FIRE');
  expect(bytecode).toEqual([32, 17]); // RWRITE=32, REG.FIRE=17
});

test('AIM emits RWRITE with index 22', async ({ page }) => {
  const { bytecode } = await compile(page, 'AIM');
  expect(bytecode).toEqual([32, 22]);
});

test('THRUSTX emits RWRITE with index 18', async ({ page }) => {
  const { bytecode } = await compile(page, 'THRUSTX');
  expect(bytecode).toEqual([32, 18]);
});

test('BRAKE emits RWRITE with index 20', async ({ page }) => {
  const { bytecode } = await compile(page, 'BRAKE');
  expect(bytecode).toEqual([32, 20]);
});

// ── #DEFINE ───────────────────────────────────────────────────────────────────

test('#DEFINE substitutes token', async ({ page }) => {
  const { bytecode, errors } = await compile(page, '#DEFINE MYVAL 99\nMYVAL');
  expect(errors).toHaveLength(0);
  expect(bytecode).toEqual([0, 99]);
});

test('#DEFINE can substitute STORE/RECALL slot numbers', async ({ page }) => {
  const { bytecode, errors } = await compile(page, '#DEFINE SLOT 7\n42 STORE SLOT\nRECALL SLOT');
  expect(errors).toHaveLength(0);
  // PUSH 42, STORE 7, RECALL 7
  expect(bytecode).toEqual([0, 42, 25, 7, 26, 7]);
});

// ── Comments ──────────────────────────────────────────────────────────────────

test('semicolon comment is stripped', async ({ page }) => {
  const { bytecode, errors } = await compile(page, '; this is a comment\n42');
  expect(errors).toHaveLength(0);
  expect(bytecode).toEqual([0, 42]);
});

test('inline comment after code is stripped', async ({ page }) => {
  const { bytecode, errors } = await compile(page, '42 ; push forty-two');
  expect(errors).toHaveLength(0);
  expect(bytecode).toEqual([0, 42]);
});

// ── Unknown tokens ────────────────────────────────────────────────────────────

test('unknown token produces error', async ({ page }) => {
  const { errors } = await compile(page, 'NOTAWORD');
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toContain('NOTAWORD');
});

test('multiple unknown tokens produce multiple errors', async ({ page }) => {
  const { errors } = await compile(page, 'AAA BBB');
  expect(errors.length).toBeGreaterThan(1);
});

// ── Sample program ────────────────────────────────────────────────────────────

test('classic tracker program compiles cleanly', async ({ page }) => {
  const src = 'LOOP\n  RADAR AIM\n  1 FIRE\nPOOL\n';
  const { errors } = await compile(page, src);
  expect(errors).toHaveLength(0);
});
