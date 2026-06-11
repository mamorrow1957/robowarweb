import { getHardwareStats, HARDWARE_DEFS, ROBOT_COLORS, ROBOT_RADIUS } from './hardware.js';
import { createVM, setSensors, runTick, queueInterrupt } from './vm.js';

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
      const vm = createVM(rDef.bytecode || []);

      // Set arena-size-dependent interrupt defaults
      vm.intParams[5] = this.height - 20;  // BOTTOM: y > arenaH-20
      vm.intParams[7] = this.width  - 20;  // RIGHT:  x > arenaW-20
      vm.intParams[8] = this.width  * 2;   // RADAR:  range ≤ 2×arenaW
      vm.intParams[9] = this.width  * 2;   // RANGE:  range ≤ 2×arenaW

      return {
        id:     rDef.id   || `robot_${idx}`,
        name:   rDef.name || `Robot ${idx + 1}`,
        vm,
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
        robotIdx:    idx,           // stable 0-based index (ID sensor)
        damageTaken: 0,             // damage received THIS tick (for DAMAGE interrupt)
        totalDamage: 0,             // cumulative damage received (DAMAGE sensor)
        varNames:    rDef.varNames || {},  // slot→name map from #DEFINE directives
        sensors: {
          ENERGY:0, ARMOR:0, HEAT:0, RANGE:0, RADAR:180,
          SPEEDX:0, SPEEDY:0, POSX:0, POSY:0,
          COLLISION:0, STUNNED:0, TEAMMATES:0, RANDOM:0, TIME:0,
          // v0.5
          DAMAGE:0, DOPPLER:0, TOP:0, BOT:0, LEFT:0, RIGHT:0, ID:idx,
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
      // Attach the tick-limit result to the last frame so frame?.result shows
      // the winner (the UI reads frame.result, not the separate result return value).
      if (frames.length > 0) {
        frames[frames.length - 1].result = this.result;
      }
    }
    return { frames, result: this.result };
  }

  step() {
    // 1. Update sensors (reads previous-tick state) + check interrupt conditions
    //    (interrupt conditions are evaluated against last tick's damage & sensors)
    //    then reset per-tick damage accumulator.
    for (const r of this.robots) {
      if (!r.alive) continue;
      this.updateSensors(r);
      if (r.stunnedTicks === 0) this.checkInterrupts(r);
      r.damageTaken = 0;   // reset for this tick's physics phase
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

    // 2b. BEEP-based SIGNAL interrupt — notify all alive teammates
    for (const r of this.robots) {
      if (!r.alive || r.vm.beep <= 0) continue;
      for (const other of this.robots) {
        if (!other.alive || other.id === r.id) continue;
        queueInterrupt(other.vm, 11); // 11 = SIGNAL
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

      if (r.x - ROBOT_RADIUS < 0)            { r.x = ROBOT_RADIUS;              r.vx =  Math.abs(r.vx);  r.sensors.COLLISION = 1; }
      if (r.x + ROBOT_RADIUS > this.width)   { r.x = this.width - ROBOT_RADIUS; r.vx = -Math.abs(r.vx);  r.sensors.COLLISION = 1; }
      if (r.y - ROBOT_RADIUS < 0)            { r.y = ROBOT_RADIUS;              r.vy =  Math.abs(r.vy);  r.sensors.COLLISION = 1; }
      if (r.y + ROBOT_RADIUS > this.height)  { r.y = this.height - ROBOT_RADIUS;r.vy = -Math.abs(r.vy);  r.sensors.COLLISION = 1; }
      if (r.sensors.COLLISION) { this.applyDamage(r, 2); r.vm.beep = 1; }
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

          // Determine which robot is approaching the other *before* any correction.
          const aVn = a.vx * nx + a.vy * ny;  // + means A moving toward B
          const bVn = b.vx * nx + b.vy * ny;  // - means B moving toward A
          const aApproaching = aVn > 0;
          const bApproaching = bVn < 0;

          // Position correction: push only the approaching robot back so the
          // stationary one is not displaced. If neither (e.g. spawned overlapping)
          // or both are approaching, split the correction evenly.
          if (aApproaching && !bApproaching) {
            a.x -= nx * overlap;  a.y -= ny * overlap;
          } else if (!aApproaching && bApproaching) {
            b.x += nx * overlap;  b.y += ny * overlap;
          } else {
            a.x -= nx * overlap / 2;  a.y -= ny * overlap / 2;
            b.x += nx * overlap / 2;  b.y += ny * overlap / 2;
          }

          // Velocity correction: cancel each robot's own approach velocity without
          // transferring momentum to the other. A non-thrusting robot therefore
          // stays still — only the actively-moving robot is deflected.
          const relV = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (relV > 0) {
            if (aVn > 0) { a.vx -= aVn * nx; a.vy -= aVn * ny; }
            if (bVn < 0) { b.vx -= bVn * nx; b.vy -= bVn * ny; }
          }

          a.sensors.COLLISION = 1;
          b.sensors.COLLISION = 1;
          this.applyDamage(a, 2);
          this.applyDamage(b, 2);
          a.vm.beep = 1;
          b.vm.beep = 1;
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

    // 8. Spawn projectiles from fire commands (vm.fire counts how many times
    //    FIRE was written this tick, so multiple writes in one tick each produce
    //    one projectile, subject to the heat cap).
    for (const r of this.robots) {
      if (!r.alive || r.stunnedTicks > 0) continue;
      for (let i = 0; i < r.vm.fire; i++) {
        if (r.heat >= r.hw.maxHeat || r.hw.weapon === 'none') break;
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
    robot.damageTaken += dmg;
    robot.totalDamage += dmg;
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
    // v0.5: ROBOTS = total alive robots (including self); both ROBOTS and TEAMMATES alias this
    r.sensors.TEAMMATES   = this.robots.filter(o => o.alive).length;
    // v0.5 new sensors
    r.sensors.DAMAGE      = Math.round(r.totalDamage);
    r.sensors.TOP         = Math.round(r.y);
    r.sensors.BOT         = Math.round(this.height - r.y);
    r.sensors.LEFT        = Math.round(r.x);
    r.sensors.RIGHT       = Math.round(this.width - r.x);
    r.sensors.ID          = r.robotIdx;
    this.updateRadar(r);
  }

  updateRadar(r) {
    // Scan direction = AIM + SCAN offset (for RADAR/RANGE sensors)
    const scanDir = ((r.aimAngle + r.vm.scan) % 360 + 360) % 360;
    // Look direction = AIM + LOOK offset (for DOPPLER sensor)
    const lookDir = ((r.aimAngle + r.vm.look) % 360 + 360) % 360;

    let nearest = Infinity;
    let bearing = r.sensors.RADAR;   // retain last known if no detection
    let dopplerVal = 0;

    for (const o of this.robots) {
      if (o.id === r.id || !o.alive) continue;
      const dx = o.x - r.x, dy = o.y - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist > r.hw.radarRange) continue;

      // Check if enemy is within the radar cone (centred on scanDir)
      if (r.hw.radarCone < 360) {
        const b = angleDeg(dy, dx);
        if (Math.abs(angleDiff(b, scanDir)) > r.hw.radarCone / 2) continue;
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

    // DOPPLER: radial velocity of nearest enemy in AIM+LOOK direction
    // Positive = approaching, negative = receding.
    let dopplerNearest = Infinity;
    for (const o of this.robots) {
      if (o.id === r.id || !o.alive) continue;
      const dx = o.x - r.x, dy = o.y - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist > r.hw.radarRange) continue;

      if (r.hw.radarCone < 360) {
        const b = angleDeg(dy, dx);
        if (Math.abs(angleDiff(b, lookDir)) > r.hw.radarCone / 2) continue;
      }

      if (dist < dopplerNearest) {
        dopplerNearest = dist;
        if (dist > 0.01) {
          const nx = dx / dist, ny = dy / dist;          // unit vector toward enemy
          const relVx = o.vx - r.vx, relVy = o.vy - r.vy; // relative velocity
          // Dot product > 0 means enemy moving away; negate for "approaching = positive"
          dopplerVal = -Math.round(relVx * nx + relVy * ny);
        }
      }
    }
    r.sensors.DOPPLER = dopplerVal;
  }

  /**
   * Evaluate all interrupt conditions against current sensor state + last tick's
   * damageTaken, then queue any whose handlers are registered.
   */
  checkInterrupts(r) {
    const p = r.vm.intParams;
    const s = r.sensors;

    const fire = (type) => queueInterrupt(r.vm, type);

    // 0: COLLISION — any wall or robot collision this tick
    if (s.COLLISION) fire(0);

    // 1: WALL — within N px of any wall
    if (Math.min(s.TOP, s.BOT, s.LEFT, s.RIGHT) <= p[1]) fire(1);

    // 2: DAMAGE — damage taken last tick ≥ threshold
    if (r.damageTaken > 0 && r.damageTaken >= p[2]) fire(2);

    // 3: SHIELD — energy below threshold while shield is active
    if (r.shieldActive && r.energy <= p[3]) fire(3);

    // 4: TOP — within N px of top wall
    if (s.TOP <= p[4]) fire(4);

    // 5: BOTTOM — within N px of bottom wall
    if (s.BOT <= p[5]) fire(5);

    // 6: LEFT — within N px of left wall
    if (s.LEFT <= p[6]) fire(6);

    // 7: RIGHT — within N px of right wall
    if (s.RIGHT <= p[7]) fire(7);

    // 8: RADAR — nearest detected enemy ≤ threshold
    if (s.RANGE > 0 && s.RANGE <= p[8]) fire(8);

    // 9: RANGE — same direction-specific scan (using vm.scan offset)
    if (s.RANGE > 0 && s.RANGE <= p[9]) fire(9);

    // 10: ROBOTS — fewer than N robots alive
    if (s.TEAMMATES < p[10]) fire(10);

    // 11: SIGNAL — queued externally via BEEP (handled in step() after VMs run)

    // 12: CHRONON — fires every N ticks (0 = disabled)
    if (p[12] > 0 && this.tick % p[12] === 0) fire(12);

    // Sort queue so higher-priority (lower-numbered) interrupts fire first
    r.vm.intQueue.sort((a, b) => a - b);
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
        aimAngle:  r.aimAngle,
        scanAngle: ((r.aimAngle + r.vm.scan) % 360 + 360) % 360,
        lookAngle: ((r.aimAngle + r.vm.look) % 360 + 360) % 360,
        color:     r.color,
        // ── Debug data ─────────────────────────────────────────────────────
        debug: {
          // Sensor values that were available to the VM this tick
          sensors: { ...r.sensors },
          // Actuator values the VM wrote this tick (reset each tick)
          actuators: {
            fire:    r.vm.fire,
            thrustX: r.vm.thrustX,
            thrustY: r.vm.thrustY,
            brake:   r.vm.brake,
            shield:  r.vm.shield,
            aim:     r.vm.aim,
            beep:    r.vm.beep,
            look:    r.vm.look,
            scan:    r.vm.scan,
          },
          // Only non-zero STORE/RECALL slots
          vars: r.vm.vars.reduce((acc, v, i) => {
            if (i > 0 && v !== 0) acc[i] = v;
            return acc;
          }, {}),
          // #DEFINE slot→name map
          varNames: r.varNames,
          // VM internals
          pc:    r.vm.pc,
          stack: r.vm.stack.slice(-8),  // last 8 items
        },
      })),
      projectiles: this.projectiles.map(p => ({
        id: p.id, type: p.type,
        x: p.x, y: p.y, alive: p.alive, radius: p.radius,
      })),
      result: this.result,
    };
  }
}
