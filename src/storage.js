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
