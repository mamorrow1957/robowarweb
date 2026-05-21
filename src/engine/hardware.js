export const HARDWARE_BUDGET = 30;

export const ROBOT_RADIUS = 8;

export const ROBOT_COLORS = [
  '#ff4757', '#2ed573', '#1e90ff', '#ffa502',
  '#ff6b81', '#70a1ff', '#eccc68', '#a29bfe',
];

export const WEAPON_TYPES = ['none', 'bullet', 'missile', 'drone', 'triple'];

export const HARDWARE_DEFS = {
  armor: [
    { cost: 0, maxArmor: 15 },
    { cost: 2, maxArmor: 30 },
    { cost: 4, maxArmor: 50 },
    { cost: 6, maxArmor: 75 },
    { cost: 8, maxArmor: 100 },
  ],
  shield: [
    { cost: 0, drain: 0,  multiplier: 1.0 },
    { cost: 2, drain: 2,  multiplier: 0.75 },
    { cost: 4, drain: 3,  multiplier: 0.50 },
    { cost: 6, drain: 5,  multiplier: 0.30 },
  ],
  weapon: {
    none:   { cost: 0, damage: 0,   speed: 0,  heat: 0, notes: 'No weapon' },
    bullet: { cost: 2, damage: 3,   speed: 15, heat: 1, notes: 'Unlimited ammo' },
    missile:{ cost: 4, damage: 8,   speed: 8,  heat: 3, notes: 'Tracks target 5 ticks' },
    drone:  { cost: 6, damage: 4,   speed: 5,  heat: 5, notes: 'Stationary, 30 ticks' },
    triple: { cost: 6, damage: 3,   speed: 15, heat: 4, notes: '3-bullet spread' },
  },
  engine: [
    { cost: 0, maxSpeed: 4,  accel: 1 },
    { cost: 2, maxSpeed: 6,  accel: 2 },
    { cost: 4, maxSpeed: 8,  accel: 3 },
    { cost: 6, maxSpeed: 12, accel: 4 },
  ],
  energy: [
    { cost: 0, maxEnergy: 50,  recharge: 1 },
    { cost: 2, maxEnergy: 100, recharge: 2 },
    { cost: 4, maxEnergy: 150, recharge: 3 },
    { cost: 6, maxEnergy: 200, recharge: 4 },
  ],
  cpu: [
    { cost: 0, cycles: 5  },
    { cost: 2, cycles: 10 },
    { cost: 4, cycles: 20 },
    { cost: 6, cycles: 40 },
  ],
  cooling: [
    { cost: 0, dissipation: 1 },
    { cost: 2, dissipation: 2 },
    { cost: 4, dissipation: 4 },
  ],
  radar: [
    { cost: 0, range: 200, cone: 60  },
    { cost: 2, range: 350, cone: 120 },
    { cost: 4, range: 500, cone: 180 },
    { cost: 6, range: 999, cone: 360 },
  ],
};

export function getHardwareStats(hw) {
  const weapon = HARDWARE_DEFS.weapon[hw.weapon] || HARDWARE_DEFS.weapon.none;
  return {
    maxArmor:    HARDWARE_DEFS.armor[hw.armor]?.maxArmor   ?? 15,
    shieldDrain: HARDWARE_DEFS.shield[hw.shield]?.drain     ?? 0,
    shieldMult:  HARDWARE_DEFS.shield[hw.shield]?.multiplier ?? 1.0,
    hasShield:   (hw.shield ?? 0) > 0,
    weapon:      hw.weapon ?? 'none',
    weaponDamage:weapon.damage,
    weaponSpeed: weapon.speed,
    weaponHeat:  weapon.heat,
    maxSpeed:    HARDWARE_DEFS.engine[hw.engine]?.maxSpeed  ?? 4,
    accel:       HARDWARE_DEFS.engine[hw.engine]?.accel     ?? 1,
    maxEnergy:   HARDWARE_DEFS.energy[hw.energy]?.maxEnergy ?? 50,
    recharge:    HARDWARE_DEFS.energy[hw.energy]?.recharge  ?? 1,
    cycles:      HARDWARE_DEFS.cpu[hw.cpu]?.cycles          ?? 5,
    dissipation: HARDWARE_DEFS.cooling[hw.cooling]?.dissipation ?? 1,
    radarRange:  HARDWARE_DEFS.radar[hw.radar]?.range       ?? 200,
    radarCone:   HARDWARE_DEFS.radar[hw.radar]?.cone        ?? 60,
    maxHeat:     20,
  };
}

export function calcHardwareCost(hw) {
  let cost = 0;
  cost += HARDWARE_DEFS.armor[hw.armor]?.cost   ?? 0;
  cost += HARDWARE_DEFS.shield[hw.shield]?.cost ?? 0;
  cost += HARDWARE_DEFS.weapon[hw.weapon]?.cost ?? 0;
  cost += HARDWARE_DEFS.engine[hw.engine]?.cost ?? 0;
  cost += HARDWARE_DEFS.energy[hw.energy]?.cost ?? 0;
  cost += HARDWARE_DEFS.cpu[hw.cpu]?.cost       ?? 0;
  cost += HARDWARE_DEFS.cooling[hw.cooling]?.cost ?? 0;
  cost += HARDWARE_DEFS.radar[hw.radar]?.cost   ?? 0;
  return cost;
}

export const DEFAULT_HARDWARE = {
  armor: 2, shield: 1, weapon: 'bullet',
  engine: 2, energy: 2, cpu: 1, cooling: 1, radar: 2,
};
