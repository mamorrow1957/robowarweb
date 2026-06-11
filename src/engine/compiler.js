export const OP = {
  PUSH:0, ADD:1, SUB:2, MUL:3, DIV:4, MOD:5, ABS:6, NEG:7,
  MAX:8, MIN:9, EQ:10, NEQ:11, LT:12, GT:13, LTE:14, GTE:15,
  AND:16, OR:17, NOT:18, XOR:19,
  DUP:20, POP:21, SWAP:22, OVER:23, ROT:24,
  STORE:25, RECALL:26, JUMP:27, JIZ:28, CALL:29, RETURN:30,
  RREAD:31, RWRITE:32,
  // v0.5 — math
  SQRT:33, DIST:34,
  SIN:35, COS:36, TAN:37, ARCTAN:38, ARCSIN:39, ARCCOS:40,
  // v0.5 — interrupts
  SETINT:41, SETPARAM:42, INTON:43, INTOFF:44, RTI:45, FLUSHINT:46,
};

export const REG = {
  // Read-only sensors (original)
  ENERGY:0, ARMOR:1, HEAT:2, RANGE:3, RADAR:4,
  SPEEDX:5, SPEEDY:6, POSX:7, POSY:8,
  COLLISION:9, STUNNED:10, TEAMMATES:11, RANDOM:12, TIME:13,
  // Write-only actuators (original)
  SHIELD:14, GUNX:15, GUNY:16, FIRE:17,
  THRUSTX:18, THRUSTY:19, BRAKE:20, BEEP:21, AIM:22,
  // v0.5 — new read-only sensors
  DAMAGE:23, DOPPLER:24, TOP:25, BOT:26, LEFT:27, RIGHT:28, ID:29,
  // v0.5 — new read/write registers (LOOK and SCAN are write from compiler POV)
  LOOK:30, SCAN:31,
};

export const REG_NAMES = Object.fromEntries(Object.entries(REG).map(([k, v]) => [v, k]));

/** Interrupt type indices — used in SETINT / SETPARAM bytecode. */
export const INT_TYPES = {
  COLLISION:0, WALL:1, DAMAGE:2, SHIELD:3,
  TOP:4, BOTTOM:5, LEFT:6, RIGHT:7,
  RADAR:8, RANGE:9, ROBOTS:10, SIGNAL:11, CHRONON:12,
};

// Register aliases: these source tokens compile to a canonical register's index.
const REG_ALIASES = {
  X: 'POSX', Y: 'POSY',
  ROBOTS: 'TEAMMATES',   // "total alive" — same slot, updated semantics
  CHRONON: 'TIME',       // elapsed ticks alias
};

const READ_REGS = new Set([
  // Original
  'ENERGY','ARMOR','HEAT','RANGE','RADAR',
  'SPEEDX','SPEEDY','POSX','POSY',
  'COLLISION','STUNNED','TEAMMATES','RANDOM','TIME',
  // v0.5 new sensors
  'DAMAGE','DOPPLER','TOP','BOT','LEFT','RIGHT','ID',
  // v0.5 aliases (compile to same index as canonical name)
  'X','Y','ROBOTS','CHRONON',
]);

const WRITE_REGS = new Set([
  'SHIELD','GUNX','GUNY','FIRE',
  'THRUSTX','THRUSTY','BRAKE','BEEP','AIM',
  // v0.5 write-only state registers
  'LOOK','SCAN',
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
  // v0.5 math
  'SQRT':OP.SQRT, 'DIST':OP.DIST,
  'SIN':OP.SIN, 'COS':OP.COS, 'TAN':OP.TAN,
  'ARCTAN':OP.ARCTAN, 'ARCSIN':OP.ARCSIN, 'ARCCOS':OP.ARCCOS,
  // v0.5 interrupt control (single-word opcodes)
  'INTON':OP.INTON, 'INTOFF':OP.INTOFF, 'RTI':OP.RTI, 'FLUSHINT':OP.FLUSHINT,
};

function tokenize(source) {
  const defines = {};
  const allTokens = [];

  for (const line of source.split('\n')) {
    const stripped = line.split(';')[0].trim();
    // #HARDWARE directives are handled by parseHardwareDirectives(), not the compiler
    if (stripped.startsWith('#HARDWARE')) continue;
    const parts = stripped.split(/\s+/).filter(Boolean);
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
    // SETINT / SETPARAM: opcode + int-type-index + label/value = 3 words; consumes 3 tokens
    if (tok === 'SETINT' || tok === 'SETPARAM') { pc += 3; i += 3; continue; }
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

    // SETINT name label  — three tokens, three bytecode words
    if (tok === 'SETINT') {
      const intName  = tokens[i + 1];
      const labelName = tokens[i + 2];
      const intIdx = INT_TYPES[intName];
      if (intIdx === undefined) errors.push(`SETINT: unknown interrupt '${intName}'`);
      let target = -1;
      if (labelName !== '0' && labelName !== undefined) {
        const resolved = labels[labelName];
        if (resolved === undefined) errors.push(`SETINT: unknown label '${labelName}'`);
        else target = resolved;
      }
      push(OP.SETINT, intIdx ?? 0, target);
      i += 3; continue;
    }

    // SETPARAM name value  — three tokens, three bytecode words
    if (tok === 'SETPARAM') {
      const intName = tokens[i + 1];
      const valStr  = tokens[i + 2];   // not macro-expanded per spec
      const intIdx = INT_TYPES[intName];
      const val = parseInt(valStr, 10);
      if (intIdx === undefined) errors.push(`SETPARAM: unknown interrupt '${intName}'`);
      push(OP.SETPARAM, intIdx ?? 0, isNaN(val) ? 0 : val);
      i += 3; continue;
    }

    if (READ_REGS.has(tok)) {
      // Resolve aliases (X→POSX, ROBOTS→TEAMMATES, etc.) before looking up REG index
      const regName = REG_ALIASES[tok] || tok;
      push(OP.RREAD, REG[regName]);
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

/**
 * Parse #HARDWARE directives from program source and return a partial hardware
 * object containing only the keys that are explicitly specified.
 * Returns null if no #HARDWARE directives are present.
 *
 * Example:
 *   #HARDWARE weapon=missile armor=3 engine=2
 */
export function parseHardwareDirectives(source) {
  const hw = {};
  for (const line of source.split('\n')) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('#HARDWARE')) continue;
    const parts = trimmed.slice('#HARDWARE'.length).trim().split(/\s+/);
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq < 1) continue;
      const k = part.slice(0, eq);
      const v = part.slice(eq + 1);
      if (k && v !== '') hw[k] = isNaN(v) ? v : parseInt(v, 10);
    }
  }
  return Object.keys(hw).length > 0 ? hw : null;
}

/**
 * Parse a program source and return a slot→name mapping for any
 * `#DEFINE name N` directives where N is a valid STORE/RECALL slot (1-100).
 * Used by the debug panel to show human-readable variable names.
 */
export function getDefines(source) {
  const { defines } = tokenize(source);
  const varNames = {};
  for (const [name, val] of Object.entries(defines)) {
    const slot = parseInt(val, 10);
    if (!isNaN(slot) && slot >= 1 && slot <= 100) {
      varNames[slot] = name;
    }
  }
  return varNames;
}
