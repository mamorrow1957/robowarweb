import { OP, REG, REG_NAMES } from './compiler.js';

/** Default interrupt parameters (index matches INT_TYPES in compiler.js). */
const DEFAULT_INT_PARAMS = [
  0,    // 0: COLLISION  — no threshold
  30,   // 1: WALL       — within 30 px of any wall
  1,    // 2: DAMAGE     — ≥1 damage per tick
  10,   // 3: SHIELD     — energy < 10 while shielded
  20,   // 4: TOP        — y < 20
  20,   // 5: BOTTOM     — arenaH - y < 20  (set to arena-relative by combat engine)
  20,   // 6: LEFT       — x < 20
  20,   // 7: RIGHT      — arenaW - x < 20  (set to arena-relative by combat engine)
  600,  // 8: RADAR      — nearest enemy ≤ 600 px  (2×300 default arena)
  600,  // 9: RANGE      — nearest in scan dir ≤ 600 px
  6,    // 10: ROBOTS    — fewer than 6 alive
  0,    // 11: SIGNAL    — triggered externally when a teammate writes non-zero to BEEP
  0,    // 12: CHRONON   — disabled (0 = off)
];

export function createVM(bytecode) {
  return {
    bytecode: bytecode || [],
    pc: 0,
    stack: [],
    vars: new Array(101).fill(0),
    callStack: [],
    sensors: {},
    // Actuator outputs — reset each tick
    fire: 0,
    thrustX: 0,
    thrustY: 0,
    brake: false,
    shield: null,
    aim: null,
    gunX: null,
    gunY: null,
    // v0.5 persistent state registers
    look: 0,    // LOOK offset applied to DOPPLER scan direction
    scan: 0,    // SCAN offset applied to RADAR/RANGE scan direction
    beep: 0,    // BEEP output (triggers SIGNAL interrupt on teammates)
    // v0.5 interrupt system
    intHandlers: new Array(13).fill(-1),         // handler PC per interrupt type (-1 = disabled)
    intParams:   [...DEFAULT_INT_PARAMS],         // threshold per interrupt type
    intQueue:    [],                              // pending interrupt type indices
    intEnabled:  true,                           // global interrupt enable flag
    intReturnPC: null,                           // saved PC for RTI
  };
}

function resetActuators(vm) {
  vm.fire = 0;
  vm.thrustX = 0;
  vm.thrustY = 0;
  vm.brake = false;
  vm.shield = null;
  vm.aim = null;
  vm.gunX = null;
  vm.gunY = null;
  vm.beep = 0;
  vm.look = 0;
  vm.scan = 0;
}

export function setSensors(vm, sensors) {
  vm.sensors = sensors;
}

/**
 * Push an interrupt onto this VM's queue if a handler is registered and
 * the type is not already pending.
 */
export function queueInterrupt(vm, intType) {
  if (
    intType >= 0 &&
    intType < vm.intHandlers.length &&
    vm.intHandlers[intType] >= 0 &&
    !vm.intQueue.includes(intType)
  ) {
    vm.intQueue.push(intType);
  }
}

export function runTick(vm, cycles) {
  resetActuators(vm);

  // Process one pending interrupt before normal execution.
  // Interrupts are automatically disabled while a handler runs; RTI re-enables them.
  if (vm.intEnabled && vm.intQueue.length > 0) {
    const intType = vm.intQueue.shift();
    const handlerPC = vm.intHandlers[intType];
    if (handlerPC >= 0) {
      vm.intReturnPC = vm.pc;
      vm.intEnabled = false;
      vm.pc = handlerPC;
    }
  }

  for (let c = 0; c < cycles; c++) {
    step(vm);
  }
}

function step(vm) {
  const bc = vm.bytecode;
  if (!bc || bc.length === 0) return;
  if (vm.pc >= bc.length || vm.pc < 0) vm.pc = 0;

  const op = bc[vm.pc++];

  const pop  = () => vm.stack.length > 0 ? vm.stack.pop() : 0;
  const push = (v) => { vm.stack.push(v | 0); if (vm.stack.length > 256) vm.stack.shift(); };

  switch (op) {
    case OP.PUSH:  push(bc[vm.pc++]); break;

    case OP.ADD:  { const b=pop(),a=pop(); push(a+b); } break;
    case OP.SUB:  { const b=pop(),a=pop(); push(a-b); } break;
    case OP.MUL:  { const b=pop(),a=pop(); push(Math.imul(a,b)); } break;
    case OP.DIV:  { const b=pop(),a=pop(); push(b===0?0:(a/b)|0); } break;
    case OP.MOD:  { const b=pop(),a=pop(); push(b===0?0:((a%b)+b)%b|0); } break;
    case OP.ABS:  push(Math.abs(pop())); break;
    case OP.NEG:  push(-pop()); break;
    case OP.MAX:  { const b=pop(),a=pop(); push(Math.max(a,b)); } break;
    case OP.MIN:  { const b=pop(),a=pop(); push(Math.min(a,b)); } break;

    // ── v0.5 Math ─────────────────────────────────────────────────────────────
    case OP.SQRT: {
      const a = pop();
      push(a <= 0 ? 0 : Math.floor(Math.sqrt(a)));
      break;
    }
    case OP.DIST: {
      const dy = pop(), dx = pop();
      push(Math.floor(Math.hypot(dx, dy)));
      break;
    }
    case OP.SIN: {
      const d = pop();
      push(Math.round(Math.sin(d * Math.PI / 180) * 1000));
      break;
    }
    case OP.COS: {
      const d = pop();
      push(Math.round(Math.cos(d * Math.PI / 180) * 1000));
      break;
    }
    case OP.TAN: {
      const d = pop();
      // Clamp at exactly ±90° (undefined), return 0
      const m = ((d % 180) + 180) % 180;
      if (m === 90) { push(0); break; }
      push(Math.round(Math.tan(d * Math.PI / 180) * 1000));
      break;
    }
    case OP.ARCTAN: {
      // Stack: y x — deg    (x is on top, y below)
      const x = pop(), y = pop();
      let deg = Math.atan2(y, x) * 180 / Math.PI;
      deg = ((deg % 360) + 360) % 360;
      push(Math.round(deg));
      break;
    }
    case OP.ARCSIN: {
      const v = pop();
      const clamped = Math.max(-1000, Math.min(1000, v));
      push(Math.round(Math.asin(clamped / 1000) * 180 / Math.PI));
      break;
    }
    case OP.ARCCOS: {
      const v = pop();
      const clamped = Math.max(-1000, Math.min(1000, v));
      push(Math.round(Math.acos(clamped / 1000) * 180 / Math.PI));
      break;
    }

    // ── v0.5 Interrupt control ────────────────────────────────────────────────
    case OP.SETINT: {
      const intType  = bc[vm.pc++];
      const handlerPC = bc[vm.pc++];
      if (intType >= 0 && intType < vm.intHandlers.length) {
        vm.intHandlers[intType] = handlerPC;
      }
      break;
    }
    case OP.SETPARAM: {
      const intType = bc[vm.pc++];
      const val     = bc[vm.pc++];
      if (intType >= 0 && intType < vm.intParams.length) {
        vm.intParams[intType] = val;
      }
      break;
    }
    case OP.INTON:    vm.intEnabled = true; break;
    case OP.INTOFF:   vm.intEnabled = false; break;
    case OP.RTI: {
      vm.intEnabled = true;
      if (vm.intReturnPC !== null) {
        vm.pc = vm.intReturnPC;
        vm.intReturnPC = null;
      }
      break;
    }
    case OP.FLUSHINT: vm.intQueue = []; break;

    // ── Comparison ────────────────────────────────────────────────────────────
    case OP.EQ:   { const b=pop(),a=pop(); push(a===b?1:0); } break;
    case OP.NEQ:  { const b=pop(),a=pop(); push(a!==b?1:0); } break;
    case OP.LT:   { const b=pop(),a=pop(); push(a<b?1:0); } break;
    case OP.GT:   { const b=pop(),a=pop(); push(a>b?1:0); } break;
    case OP.LTE:  { const b=pop(),a=pop(); push(a<=b?1:0); } break;
    case OP.GTE:  { const b=pop(),a=pop(); push(a>=b?1:0); } break;

    case OP.AND:  { const b=pop(),a=pop(); push((a!==0&&b!==0)?1:0); } break;
    case OP.OR:   { const b=pop(),a=pop(); push((a!==0||b!==0)?1:0); } break;
    case OP.NOT:  push(pop()===0?1:0); break;
    case OP.XOR:  { const b=pop(),a=pop(); push(a^b); } break;

    case OP.DUP:  { const a=pop(); push(a); push(a); } break;
    case OP.POP:  pop(); break;
    case OP.SWAP: { const b=pop(),a=pop(); push(b); push(a); } break;
    case OP.OVER: { const b=pop(),a=pop(); push(a); push(b); push(a); } break;
    case OP.ROT:  { const c=pop(),b=pop(),a=pop(); push(b); push(c); push(a); } break;

    case OP.STORE: {
      const slot = Math.min(100, Math.max(1, bc[vm.pc++]));
      vm.vars[slot] = pop();
      break;
    }
    case OP.RECALL: {
      const slot = Math.min(100, Math.max(1, bc[vm.pc++]));
      push(vm.vars[slot]);
      break;
    }

    case OP.JUMP: {
      vm.pc = bc[vm.pc];
      break;
    }
    case OP.JIZ: {
      const target = bc[vm.pc++];
      if (pop() === 0) vm.pc = target;
      break;
    }
    case OP.CALL: {
      const target = bc[vm.pc++];
      if (vm.callStack.length < 64) vm.callStack.push(vm.pc);
      vm.pc = target;
      break;
    }
    case OP.RETURN: {
      if (vm.callStack.length > 0) vm.pc = vm.callStack.pop();
      break;
    }

    case OP.RREAD: {
      const regIdx = bc[vm.pc++];
      const name = REG_NAMES[regIdx];
      push(vm.sensors[name] ?? 0);
      break;
    }
    case OP.RWRITE: {
      const regIdx = bc[vm.pc++];
      const val = pop();
      handleWrite(vm, regIdx, val);
      break;
    }
  }
}

function handleWrite(vm, regIdx, val) {
  switch (regIdx) {
    case REG.SHIELD:  vm.shield = val; break;
    case REG.GUNX:    vm.gunX = val; break;
    case REG.GUNY:    vm.gunY = val; break;
    case REG.FIRE:    vm.fire = val; break;
    case REG.THRUSTX: vm.thrustX = Math.max(-5, Math.min(5, val)); break;
    case REG.THRUSTY: vm.thrustY = Math.max(-5, Math.min(5, val)); break;
    case REG.BRAKE:   vm.brake = val !== 0; break;
    case REG.AIM:     vm.aim = val; break;
    case REG.LOOK:    vm.look = ((val % 360) + 360) % 360; break;
    case REG.SCAN:    vm.scan = ((val % 360) + 360) % 360; break;
    case REG.BEEP:    vm.beep = val; break;  // SIGNAL interrupt to teammates
  }
}
