import { getHardwareStats, HARDWARE_DEFS, ROBOT_COLORS, ROBOT_RADIUS } from './hardware.js';
import { createVM, setSensors, runTick } from './vm.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function angleDeg(dy, dx) {
  let a = Math.atan2(dy, dx) * 180 / Math.PI;
  return ((a % 360) + 360) % 360;
}

function angleDiff(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

function spawnPositions(n, w, h, rng) {
  const margin = 40;
  const positions = [];
  for (let i = 0; i < n; i++) {
    let x, y, attempts = 0;
    do {
      x = margin + rng() * (w - 2 * margin);
      y = margin + rng() * (h - 2 * margin);
      attempts++;
    } while (
      attempts < 300 &&
      positions.some(p => Math.hypot(p.x - x, p.y - y) < 60)
    );
    positions.push({ x: Math.round(x), y: Math.round(y) });
  }
  return positions;
}

export class CombatEngine {
  constructor(config) {
    this.width     = config.arenaWidth  || 300;
    this.height    = config.arenaHeight || 300;
    this.tickLimit = config.tickLimit   || 2000;
    this.tick      = 0;
    this.rng       = mulberry32(config.seed ?? 12345);
    this.nextId    = 0;
    this.projectiles = [];
    this.result    = null;

    const positions = spawnPositions(
      config.robots.length, this.width, this.height, this.rng
    );

    this.robots = config.robots.map((rDef, idx) => {
      const hw = getHardwareStats(rDef.hardware || {});
      return {
        id:     rDef.id   || `robot_${idx}`,
        name:   rDef.name || `Robot ${idx + 1}`,
        vm:     createVM(rDef.bytecode || []),
        hw,
        x:  positions[idx].x,
        y:  positions[idx].y,
        vx: 0, vy: 0,
        armor:       hw.maxArmor,
        energy:      hw.maxEnergy,
        heat:        0,
        shieldActive: false,
        aimAngle:    this.rng() * 360,
        alive:       true,
        team:        rDef.team ?? idx,
        color:       ROBOT_COLORS[idx % ROBOT_COLORS.length],
        stunnedTicks: 0,
        rng:         mulberry32((config.seed ?? 12345) + (idx + 1) * 997),
        sensors: {
          ENERGY:0, ARMOR:0, HEAT:0, RANGE:0, RADAR:180,
          SPEEDX:0, SPEEDY:0, POSX:0, POSY:0,
          COLLISION:0, STUNNED:0, TEAMMATES:0, RANDOM:0, TIME:0,
        },
      };
    });
  }

  simulate() {
    const frames = [];
    while (this.tick < this.tickLimit && !this.result) {
      frames.push(this.step());
    }
    if (!this.result) {
      const alive = this.robots.filter(r => r.alive);
      if (alive.length > 0) {
        alive.sort((a, b) => b.armor - a.armor);
        this.result = { winnerId: alive[0].id, winnerName: alive[0].name, reason: 'tick limit' };
      } else {
        this.result = { winnerId: null, winnerName: 'Draw', reason: 'all destroyed' };
      }
    }
    return { frames, result: this.result };
  }

  step() {
    // 1. Update sensors
    for (const r of this.robots) {
      if (!r.alive) continue;
      this.updateSensors(r);
    }

    // 2. Run VMs & collect actuator commands
    for (const r of this.robots) {
      if (!r.alive) continue;
      if (r.stunnedTicks > 0) { r.stunnedTicks--; continue; }
      setSensors(r.vm, r.sensors);
      runTick(r.vm, r.hw.cycles);

      if (r.vm.aim !== null) {
        r.aimAngle = ((r.vm.aim % 360) + 360) % 360;
      } else if (r.vm.gunX !== null && r.vm.gunY !== null) {
        r.aimAngle = angleDeg(r.vm.gunY, r.vm.gunX);
      }
      if (r.vm.shield !== null && r.hw.hasShield) {
        r.shieldActive = r.vm.shield !== 0;
      }
    }

    // 3. Apply thrust / braking
    for (const r of this.robots) {
      if (!r.alive) continue;
      if (r.vm.brake) {
        r.vx *= 0.80;
        r.vy *= 0.80;
      } else {
        r.vx = clamp(r.vx + r.vm.thrustX * r.hw.accel * 0.5, -r.hw.maxSpeed, r.hw.maxSpeed);
        r.vy = clamp(r.vy + r.vm.thrustY * r.hw.accel * 0.5, -r.hw.maxSpeed, r.hw.maxSpeed);
      }
    }

    // 4. Move robots + wall bounce
    for (const r of this.robots) {
      if (!r.alive) continue;
      r.sensors.COLLISION = 0;
      r.x += r.vx;
      r.y += r.vy;

      if (r.x - ROBOT_RADIUS < 0)            { r.x = ROBOT_RADIUS;             r.vx = Math.abs(r.vx);  r.sensors.COLLISION = 1; }
      if (r.x + ROBOT_RADIUS > this.width)   { r.x = this.width - ROBOT_RADIUS; r.vx = -Math.abs(r.vx); r.sensors.COLLISION = 1; }
      if (r.y - ROBOT_RADIUS < 0)            { r.y = ROBOT_RADIUS;             r.vy = Math.abs(r.vy);  r.sensors.COLLISION = 1; }
      if (r.y + ROBOT_RADIUS > this.height)  { r.y = this.height - ROBOT_RADIUS;r.vy = -Math.abs(r.vy); r.sensors.COLLISION = 1; }
    }

    // 5. Robot–robot collisions
    for (let i = 0; i < this.robots.length; i++) {
      for (let j = i + 1; j < this.robots.length; j++) {
        const a = this.robots[i], b = this.robots[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist < ROBOT_RADIUS * 2 && dist > 0.01) {
          const overlap = ROBOT_RADIUS * 2 - dist;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * overlap / 2;  a.y -= ny * overlap / 2;
          b.x += nx * overlap / 2;  b.y += ny * overlap / 2;
          const relV = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (relV > 0) {
            a.vx -= relV * nx; a.vy -= relV * ny;
            b.vx += relV * nx; b.vy += relV * ny;
          }
          a.sensors.COLLISION = 1;
          b.sensors.COLLISION = 1;
        }
      }
    }

    // 6. Move projectiles + homing
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.ticksAlive++;
      if (p.ticksAlive > p.maxTicks) { p.alive = false; continue; }

      if (p.type === 'missile' && p.homingLeft > 0) {
        const target = this.robots.find(r => r.alive && r.id !== p.ownerId);
        if (target) {
          const dx = target.x - p.x, dy = target.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0) {
            const spd = Math.hypot(p.vx, p.vy) || 8;
            p.vx = p.vx * 0.7 + (dx / dist) * spd * 0.3;
            p.vy = p.vy * 0.7 + (dy / dist) * spd * 0.3;
            const s = Math.hypot(p.vx, p.vy);
            if (s > 8) { p.vx = p.vx / s * 8; p.vy = p.vy / s * 8; }
          }
        }
        p.homingLeft--;
      }

      if (p.type !== 'drone') {
        p.x += p.vx;
        p.y += p.vy;

        const oob = p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height;
        if (oob) {
          if (p.type === 'missile' && p.bounces === 0) {
            if (p.x < 0 || p.x > this.width) p.vx = -p.vx;
            if (p.y < 0 || p.y > this.height) p.vy = -p.vy;
            p.x = clamp(p.x, 0, this.width);
            p.y = clamp(p.y, 0, this.height);
            p.bounces++;
          } else {
            p.alive = false;
          }
        }
      }
    }

    // 7. Projectile–robot hits
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      for (const r of this.robots) {
        if (!r.alive || r.id === p.ownerId) continue;
        const dx = r.x - p.x, dy = r.y - p.y;
        if (Math.hypot(dx, dy) < ROBOT_RADIUS + p.radius) {
          this.applyDamage(r, p.damage);
          if (p.type !== 'drone') p.alive = false;
          break;
        }
      }
    }

    // 8. Spawn projectiles from fire commands
    for (const r of this.robots) {
      if (!r.alive || r.stunnedTicks > 0) continue;
      if (r.vm.fire > 0 && r.heat < r.hw.maxHeat && r.hw.weapon !== 'none') {
        this.spawnProjectile(r);
      }
    }

    // 9. Update heat / energy
    for (const r of this.robots) {
      if (!r.alive) continue;
      r.heat   = Math.max(0, r.heat - r.hw.dissipation);
      r.energy = Math.min(r.hw.maxEnergy, r.energy + r.hw.recharge);
      if (r.shieldActive && r.hw.shieldDrain > 0) {
        r.energy -= r.hw.shieldDrain;
        if (r.energy <= 0) { r.energy = 0; r.shieldActive = false; }
      }
    }

    this.projectiles = this.projectiles.filter(p => p.alive);
    this.tick++;

    const alive = this.robots.filter(r => r.alive);
    if (alive.length <= 1 && this.robots.length > 1) {
      const w = alive[0] || null;
      this.result = {
        winnerId:   w?.id   || null,
        winnerName: w?.name || 'Draw',
        reason: 'last standing',
      };
    }

    return this.getFrame();
  }

  applyDamage(robot, rawDamage) {
    let dmg = rawDamage;
    if (robot.shieldActive && robot.energy > 0) dmg *= robot.hw.shieldMult;
    robot.armor -= dmg;
    if (robot.armor <= 0) { robot.armor = 0; robot.alive = false; }
  }

  spawnProjectile(robot) {
    const wType = robot.hw.weapon;
    const wDef  = HARDWARE_DEFS.weapon[wType];
    if (!wDef || wDef.damage === 0) return;

    robot.heat += wDef.heat;
    const rad = robot.aimAngle * Math.PI / 180;

    const make = (angleOffset = 0) => {
      const a = rad + angleOffset;
      return {
        id:    this.nextId++,
        type:  wType === 'triple' ? 'bullet' : wType,
        ownerId: robot.id,
        x: robot.x + Math.cos(a) * (ROBOT_RADIUS + 6),
        y: robot.y + Math.sin(a) * (ROBOT_RADIUS + 6),
        vx: Math.cos(a) * wDef.speed,
        vy: Math.sin(a) * wDef.speed,
        ticksAlive: 0,
        maxTicks:   wType === 'missile' ? 80 : wType === 'drone' ? 30 : 40,
        damage:     wDef.damage,
        radius:     wType === 'missile' ? 3 : wType === 'drone' ? 5 : 2,
        alive:      true,
        bounces:    0,
        homingLeft: wType === 'missile' ? 5 : 0,
      };
    };

    if (wType === 'triple') {
      this.projectiles.push(make(-0.2), make(0), make(0.2));
    } else if (wType === 'drone') {
      const p = make();
      p.vx = 0; p.vy = 0;
      this.projectiles.push(p);
    } else {
      this.projectiles.push(make());
    }
  }

  updateSensors(r) {
    r.sensors.ENERGY      = Math.round(r.energy);
    r.sensors.ARMOR       = Math.round(r.armor);
    r.sensors.HEAT        = Math.round(r.heat);
    r.sensors.SPEEDX      = Math.round(r.vx);
    r.sensors.SPEEDY      = Math.round(r.vy);
    r.sensors.POSX        = Math.round(r.x);
    r.sensors.POSY        = Math.round(r.y);
    r.sensors.STUNNED     = r.stunnedTicks > 0 ? 1 : 0;
    r.sensors.TIME        = this.tick;
    r.sensors.RANDOM      = Math.floor(r.rng() * 256);
    r.sensors.TEAMMATES   = this.robots.filter(o => o.alive && o.id !== r.id && o.team === r.team).length;
    this.updateRadar(r);
  }

  updateRadar(r) {
    let nearest = Infinity;
    let bearing = r.sensors.RADAR;

    for (const o of this.robots) {
      if (o.id === r.id || !o.alive) continue;
      const dx = o.x - r.x, dy = o.y - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist > r.hw.radarRange) continue;

      if (r.hw.radarCone < 360) {
        const b = angleDeg(dy, dx);
        if (Math.abs(angleDiff(b, r.aimAngle)) > r.hw.radarCone / 2) continue;
      }

      if (dist < nearest) {
        nearest = dist;
        bearing = Math.round(angleDeg(dy, dx));
      }
    }

    if (nearest < Infinity) {
      r.sensors.RANGE = Math.min(1500, Math.round(nearest));
      r.sensors.RADAR = bearing;
    } else {
      r.sensors.RANGE = 0;
    }
  }

  getFrame() {
    return {
      tick: this.tick,
      robots: this.robots.map(r => ({
        id:       r.id,
        name:     r.name,
        x:        r.x,
        y:        r.y,
        alive:    r.alive,
        armor:    r.armor,
        maxArmor: r.hw.maxArmor,
        energy:   r.energy,
        maxEnergy:r.hw.maxEnergy,
        heat:     r.heat,
        maxHeat:  r.hw.maxHeat,
        shieldActive: r.shieldActive,
        aimAngle: r.aimAngle,
        color:    r.color,
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, type: p.type,
        x: p.x, y: p.y, alive: p.alive, radius: p.radius,
      })),
      result: this.result,
    };
  }
}
