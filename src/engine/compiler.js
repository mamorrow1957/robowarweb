export const OP = {
  PUSH:0, ADD:1, SUB:2, MUL:3, DIV:4, MOD:5, ABS:6, NEG:7,
  MAX:8, MIN:9, EQ:10, NEQ:11, LT:12, GT:13, LTE:14, GTE:15,
  AND:16, OR:17, NOT:18, XOR:19,
  DUP:20, POP:21, SWAP:22, OVER:23, ROT:24,
  STORE:25, RECALL:26, JUMP:27, JIZ:28, CALL:29, RETURN:30,
  RREAD:31, RWRITE:32,
};

export const REG = {
  ENERGY:0, ARMOR:1, HEAT:2, RANGE:3, RADAR:4,
  SPEEDX:5, SPEEDY:6, POSX:7, POSY:8,
  COLLISION:9, STUNNED:10, TEAMMATES:11, RANDOM:12, TIME:13,
  SHIELD:14, GUNX:15, GUNY:16, FIRE:17,
  THRUSTX:18, THRUSTY:19, BRAKE:20, BEEP:21, AIM:22,
};

export const REG_NAMES = Object.fromEntries(Object.entries(REG).map(([k, v]) => [v, k]));

const READ_REGS = new Set([
  'ENERGY','ARMOR','HEAT','RANGE','RADAR',
  'SPEEDX','SPEEDY','POSX','POSY',
  'COLLISION','STUNNED','TEAMMATES','RANDOM','TIME',
]);

const WRITE_REGS = new Set([
  'SHIELD','GUNX','GUNY','FIRE',
  'THRUSTX','THRUSTY','BRAKE','BEEP','AIM',
]);

const SIMPLE_OPS = {
  '+':OP.ADD, 'ADD':OP.ADD,
  '-':OP.SUB, 'SUB':OP.SUB,
  '*':OP.MUL, 'MUL':OP.MUL,
  '/':OP.DIV, 'DIV':OP.DIV,
  'MOD':OP.MOD, 'ABS':OP.ABS, 'NEG':OP.NEG,
  'MAX':OP.MAX, 'MIN':OP.MIN,
  '=':OP.EQ,  'EQ':OP.EQ,
  '<>':OP.NEQ, 'NEQ':OP.NEQ,
  '<':OP.LT,  'LT':OP.LT,
  '>':OP.GT,  'GT':OP.GT,
  '<=':OP.LTE,'LTE':OP.LTE,
  '>=':OP.GTE,'GTE':OP.GTE,
  'AND':OP.AND,'OR':OP.OR,'NOT':OP.NOT,'XOR':OP.XOR,
  'DUP':OP.DUP,'POP':OP.POP,'DROP':OP.POP,
  'SWAP':OP.SWAP,'OVER':OP.OVER,'ROT':OP.ROT,
  'RETURN':OP.RETURN,
};

function tokenize(source) {
  const defines = {};
  const allTokens = [];

  for (const line of source.split('\n')) {
    const stripped = line.split(';')[0];
    const parts = stripped.trim().split(/\s+/).filter(Boolean);
    allTokens.push(...parts);
  }

  const tokens = [];
  let i = 0;
  while (i < allTokens.length) {
    if (allTokens[i] === '#DEFINE') {
      const name = allTokens[i + 1];
      const val = allTokens[i + 2];
      if (name && val !== undefined) defines[name] = val;
      i += 3;
    } else {
      tokens.push(allTokens[i++]);
    }
  }

  return { tokens, defines };
}

function resolve(tok, defines) {
  return defines[tok] !== undefined ? String(defines[tok]) : tok;
}

function collectLabels(tokens, defines) {
  const labels = {};
  let pc = 0;
  let i = 0;

  while (i < tokens.length) {
    const tok = resolve(tokens[i], defines);

    if (tok.endsWith(':')) {
      labels[tok.slice(0, -1)] = pc;
      i++; continue;
    }
    if (/^-?\d+$/.test(tok)) { pc += 2; i++; continue; }
    if (SIMPLE_OPS[tok] !== undefined) { pc += 1; i++; continue; }
    if (tok === 'STORE' || tok === 'RECALL') { pc += 2; i += 2; continue; }
    if (tok === 'GOTO' || tok === 'CALL')    { pc += 2; i += 2; continue; }
    if (tok === 'IF' || tok === 'ELSE')      { pc += 2; i++; continue; }
    if (tok === 'LOOP' || tok === 'ENDIF')   { i++; continue; }
    if (tok === 'POOL')                       { pc += 2; i++; continue; }
    if (READ_REGS.has(tok) || WRITE_REGS.has(tok)) { pc += 2; i++; continue; }
    i++;
  }

  return labels;
}

function emitBytecode(tokens, defines, labels) {
  const errors = [];
  const bc = [];
  const ifStack  = [];
  const loopStack = [];

  const push = (...words) => bc.push(...words);
  let i = 0;

  while (i < tokens.length) {
    const raw = tokens[i];
    const tok = resolve(raw, defines);

    if (tok.endsWith(':')) { i++; continue; }

    if (/^-?\d+$/.test(tok)) {
      push(OP.PUSH, parseInt(tok, 10));
      i++; continue;
    }

    if (SIMPLE_OPS[tok] !== undefined) {
      push(SIMPLE_OPS[tok]);
      i++; continue;
    }

    if (tok === 'STORE' || tok === 'RECALL') {
      const slotRaw = tokens[i + 1];
      const slotStr = resolve(slotRaw, defines);
      const slot = parseInt(slotStr, 10);
      if (isNaN(slot) || slot < 1 || slot > 100) {
        errors.push(`${tok}: invalid slot '${slotRaw}'`);
      }
      push(tok === 'STORE' ? OP.STORE : OP.RECALL, isNaN(slot) ? 1 : slot);
      i += 2; continue;
    }

    if (tok === 'GOTO') {
      const label = tokens[i + 1];
      const target = labels[label];
      if (target === undefined) errors.push(`GOTO: unknown label '${label}'`);
      push(OP.JUMP, target ?? 0);
      i += 2; continue;
    }

    if (tok === 'CALL') {
      const label = tokens[i + 1];
      const target = labels[label];
      if (target === undefined) errors.push(`CALL: unknown label '${label}'`);
      push(OP.CALL, target ?? 0);
      i += 2; continue;
    }

    if (tok === 'IF') {
      push(OP.JIZ, 0);
      ifStack.push({ patchIdx: bc.length - 1 });
      i++; continue;
    }

    if (tok === 'ELSE') {
      if (ifStack.length === 0) { errors.push('ELSE without IF'); i++; continue; }
      push(OP.JUMP, 0);
      const jumpPatch = bc.length - 1;
      const { patchIdx } = ifStack.pop();
      bc[patchIdx] = bc.length;       // IF false → start of else body
      ifStack.push({ patchIdx: jumpPatch });
      i++; continue;
    }

    if (tok === 'ENDIF') {
      if (ifStack.length === 0) { errors.push('ENDIF without IF'); i++; continue; }
      const { patchIdx } = ifStack.pop();
      bc[patchIdx] = bc.length;
      i++; continue;
    }

    if (tok === 'LOOP') {
      loopStack.push(bc.length);
      i++; continue;
    }

    if (tok === 'POOL') {
      if (loopStack.length === 0) { errors.push('POOL without LOOP'); i++; continue; }
      push(OP.JUMP, loopStack.pop());
      i++; continue;
    }

    if (READ_REGS.has(tok)) {
      push(OP.RREAD, REG[tok]);
      i++; continue;
    }

    if (WRITE_REGS.has(tok)) {
      push(OP.RWRITE, REG[tok]);
      i++; continue;
    }

    errors.push(`Unknown token: '${raw}'`);
    i++;
  }

  if (ifStack.length > 0)   errors.push(`${ifStack.length} unclosed IF block(s)`);
  if (loopStack.length > 0) errors.push(`${loopStack.length} unclosed LOOP block(s)`);

  return { bytecode: bc, errors };
}

export function compile(source) {
  const { tokens, defines } = tokenize(source);
  const labels = collectLabels(tokens, defines);
  const { bytecode, errors } = emitBytecode(tokens, defines, labels);
  return { bytecode, errors };
}
