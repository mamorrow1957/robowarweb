import { OP, REG, REG_NAMES } from './compiler.js';

export function createVM(bytecode) {
  return {
    bytecode: bytecode || [],
    pc: 0,
    stack: [],
    vars: new Array(101).fill(0),
    callStack: [],
    sensors: {},
    // Actuator outputs reset each tick
    fire: 0,
    thrustX: 0,
    thrustY: 0,
    brake: false,
    shield: null,
    aim: null,
    gunX: null,
    gunY: null,
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
}

export function setSensors(vm, sensors) {
  vm.sensors = sensors;
}

export function runTick(vm, cycles) {
  resetActuators(vm);
  for (let c = 0; c < cycles; c++) {
    step(vm);
  }
}

function step(vm) {
  const bc = vm.bytecode;
  if (!bc || bc.length === 0) return;
  if (vm.pc >= bc.length || vm.pc < 0) vm.pc = 0;

  const op = bc[vm.pc++];

  const pop = () => vm.stack.length > 0 ? vm.stack.pop() : 0;
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
    case REG.BEEP:    break;
  }
}
