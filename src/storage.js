const KEY = 'robowar_robots';

const SAMPLE_ROBOTS = [
  {
    id: 'rbt_tracker',
    name: 'Tracker',
    hardware: { armor:2, shield:1, weapon:'bullet', engine:2, energy:2, cpu:1, cooling:1, radar:2 },
    program:
`; Aim at nearest enemy and fire. Manage shield by energy level.
LOOP
  RADAR AIM
  1 FIRE
  ENERGY 40 >
  IF
    1 SHIELD
  ELSE
    0 SHIELD
  ENDIF
POOL`,
  },
  {
    id: 'rbt_evader',
    name: 'Evader',
    hardware: { armor:3, shield:0, weapon:'bullet', engine:3, energy:2, cpu:2, cooling:1, radar:2 },
    program:
`; Random movement while shooting.
LOOP
  RANDOM 11 MOD 5 - THRUSTX
  RANDOM 11 MOD 5 - THRUSTY
  RADAR AIM
  1 FIRE
POOL`,
  },
  {
    id: 'rbt_sniper',
    name: 'Sniper',
    hardware: { armor:1, shield:2, weapon:'missile', engine:1, energy:3, cpu:2, cooling:2, radar:3 },
    program:
`; Fire missiles when close. Shield up when energy is high.
LOOP
  RADAR AIM
  RANGE 0 >
  IF
    2 FIRE
  ENDIF
  ENERGY 80 >
  IF
    1 SHIELD
  ELSE
    0 SHIELD
  ENDIF
POOL`,
  },
  {
    id: 'rbt_wallavoider',
    name: 'WallAvoider',
    hardware: { armor:2, shield:0, weapon:'bullet', engine:3, energy:2, cpu:2, cooling:1, radar:2 },
    program:
`; Wall-proximity interrupt steers the robot away from borders.
SETINT WALL wallHandler
SETPARAM WALL 50
INTON

LOOP
  RADAR AIM
  1 FIRE
POOL

wallHandler:
  LEFT 50 <
  IF
    3 THRUSTX
  ELSE
    RIGHT 50 <
    IF
      -3 THRUSTX
    ENDIF
  ENDIF
  TOP 50 <
  IF
    3 THRUSTY
  ELSE
    BOT 50 <
    IF
      -3 THRUSTY
    ENDIF
  ENDIF
  RTI`,
  },
  {
    id: 'rbt_doppler',
    name: 'DopplerDuelist',
    hardware: { armor:2, shield:1, weapon:'bullet', engine:2, energy:2, cpu:2, cooling:1, radar:3 },
    program:
`; Lead shots using DOPPLER radial velocity to predict enemy position.
#DEFINE bearing 1
#DEFINE lead 2

LOOP
  RADAR STORE bearing
  RECALL bearing AIM
  DOPPLER 4 / STORE lead
  RECALL bearing RECALL lead + AIM
  RANGE 0 >
  IF
    1 FIRE
  ENDIF
  ENERGY 40 >
  IF
    1 SHIELD
  ELSE
    0 SHIELD
  ENDIF
POOL`,
  },
  {
    id: 'rbt_reactive',
    name: 'ReactiveShield',
    hardware: { armor:3, shield:2, weapon:'bullet', engine:1, energy:3, cpu:1, cooling:1, radar:1 },
    program:
`; Raise shield reactively when the DAMAGE interrupt fires.
SETINT DAMAGE damageHandler
SETPARAM DAMAGE 3
INTON

LOOP
  RADAR AIM
  1 FIRE
  ENERGY 15 <
  IF
    0 SHIELD
  ENDIF
POOL

damageHandler:
  1 SHIELD
  RTI`,
  },
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function save(robots) {
  localStorage.setItem(KEY, JSON.stringify(robots));
}

export function getRobots() {
  let robots = load();
  if (!robots) {
    robots = SAMPLE_ROBOTS.map(r => ({ ...r }));
    save(robots);
  }
  return robots;
}

export function getRobotById(id) {
  return getRobots().find(r => r.id === id) || null;
}

export function saveRobot(robot) {
  const robots = getRobots();
  const idx = robots.findIndex(r => r.id === robot.id);
  if (idx >= 0) {
    robots[idx] = robot;
  } else {
    robots.push(robot);
  }
  save(robots);
}

export function deleteRobot(id) {
  save(getRobots().filter(r => r.id !== id));
}

export function newRobotId() {
  return 'rbt_' + Math.random().toString(36).slice(2, 10);
}
