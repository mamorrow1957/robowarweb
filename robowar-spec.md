# RoboWar Web — Game Specification

**Version:** 0.1 (draft)  
**Platform:** Web (JavaScript / HTML5 Canvas)  
**Based on:** RoboWar 4.1.7 (Rod McFarland, 1989–1994)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Robot Programming Language](#3-robot-programming-language)
4. [Hardware System](#4-hardware-system)
5. [Arena & Combat Engine](#5-arena--combat-engine)
6. [User Interface & Game Modes](#6-user-interface--game-modes)
7. [Networking & Multiplayer](#7-networking--multiplayer)
8. [Data Formats](#8-data-formats)
9. [Open Questions](#9-open-questions)

---

## 1. Overview

RoboWar Web is a faithful browser-based recreation of the classic 1989 Macintosh game *RoboWar*. Players write programs in a stack-based assembly language that control autonomous robots battling in a 2D arena. The game is deterministic: identical programs and seeds produce identical battles, enabling replay sharing and online tournaments.

### Design Goals

| Goal | Description |
|---|---|
| Faithful | Instruction set, hardware model, and combat physics match original RoboWar 4.x |
| Deterministic | Battles replay exactly from seed + robot definitions |
| Accessible | Runs in any modern browser, no install required |
| Social | Share robots, watch replays, run asynchronous tournaments |

### Non-Goals (v1)

- 3D graphics or physics
- Mobile touch support (keyboard-centric editor is desktop-first)
- Real-time streaming of live battles (replays are sufficient)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Robot Editor │  │ Battle Viewer │  │ Tournament Browser │ │
│  │  (CodeMirror) │  │  (Canvas 2D) │  │     (React UI)     │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘ │
│         │                 │                   │              │
│  ┌──────▼─────────────────▼───────────────────▼───────────┐  │
│  │              Game Engine (Web Worker)                   │  │
│  │   Compiler → VM Scheduler → Combat Engine → Renderer   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (optional, for multiplayer)                         │
│  Node.js / Express  +  PostgreSQL  +  Socket.io              │
└─────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| **Compiler** | Tokenise, parse, and assemble RoboWar source into bytecode |
| **VM** | Execute bytecode on a per-robot stack machine each game tick |
| **Combat Engine** | Move projectiles, apply damage, resolve collisions each tick |
| **Renderer** | Draw arena state to Canvas at up to 60 fps |
| **Backend API** | Authentication, robot storage, matchmaking, leaderboards |

The VM and Combat Engine run inside a **Web Worker** so the UI thread stays responsive during fast-forward and simulation.

---

## 3. Robot Programming Language

### 3.1 Language Model

RoboWar programs execute on a **stack machine** similar to Forth. Each robot gets a fixed number of CPU cycles per game tick (configurable via hardware). A program consists of a flat list of tokens; control flow uses labels and conditional/unconditional jumps.

```
Stack:      integer values (32-bit signed)
Registers:  named hardware I/O ports (read or write)
Variables:  100 numbered slots (1–100) + named aliases
```

### 3.2 Registers (Hardware Ports)

Registers are the primary interface between the program and the robot's hardware. Reading a register returns the current sensor value; writing a register issues a hardware command.

#### Read-only Sensors

| Register | Range | Description |
|---|---|---|
| `ENERGY` | 0–max | Current energy level |
| `ARMOR` | 0–max | Current armor (hit points) |
| `HEAT` | 0–max | Current weapon heat |
| `RANGE` | 0–1500 | Distance to nearest enemy in radar cone |
| `RADAR` | 0–359 | Bearing (°) to nearest enemy in radar cone |
| `SPEEDX` | −10–10 | Current X velocity (pixels/tick) |
| `SPEEDY` | −10–10 | Current Y velocity |
| `POSX` | 0–299 | Robot X position |
| `POSY` | 0–299 | Robot Y position |
| `COLLISION` | 0/1 | 1 if collided with wall or robot last tick |
| `STUNNED` | 0/1 | 1 if robot is stunned (cannot fire) |
| `TEAMMATES` | 0–7 | Number of surviving teammates |
| `RANDOM` | 0–255 | Pseudo-random value (seeded deterministically) |
| `TIME` | 0+ | Elapsed ticks this battle |

#### Write-only Actuators

| Register | Value | Description |
|---|---|---|
| `SHIELD` | 0/1 | Enable or disable energy shield |
| `GUNX` | −10–10 | Set gun aim X component |
| `GUNY` | −10–10 | Set gun aim Y component |
| `FIRE` | 0–3 | Fire weapon (0=none, 1=bullet, 2=missile, 3=drone) |
| `THRUSTX` | −5–5 | Apply X thrust |
| `THRUSTY` | −5–5 | Apply Y thrust |
| `BRAKE` | 0/1 | Apply braking force |
| `BEEP` | 0–15 | Play tone (cosmetic only) |

#### Read/Write

| Register | Description |
|---|---|
| `AIM` | Gun angle in degrees; shorthand for setting GUNX/GUNY via polar |

### 3.3 Instruction Set

#### Stack Operations

| Opcode | Stack effect | Description |
|---|---|---|
| `n` (literal integer) | `— n` | Push integer literal |
| `DUP` | `a — a a` | Duplicate top |
| `POP` | `a —` | Discard top |
| `SWAP` | `a b — b a` | Swap top two |
| `OVER` | `a b — a b a` | Copy second to top |
| `ROT` | `a b c — b c a` | Rotate top three |
| `DROP` | alias for `POP` | |

#### Arithmetic

| Opcode | Stack effect | Notes |
|---|---|---|
| `+` | `a b — a+b` | |
| `-` | `a b — a-b` | |
| `*` | `a b — a*b` | |
| `/` | `a b — a/b` | Integer division; divide-by-zero → 0 |
| `MOD` | `a b — a mod b` | |
| `ABS` | `a — |a|` | |
| `NEG` | `a — −a` | |
| `MAX` | `a b — max(a,b)` | |
| `MIN` | `a b — min(a,b)` | |

#### Comparison (return 1=true, 0=false)

| Opcode | Stack effect |
|---|---|
| `=` | `a b — a==b` |
| `<>` | `a b — a!=b` |
| `<` | `a b — a<b` |
| `>` | `a b — a>b` |
| `<=` | `a b — a<=b` |
| `>=` | `a b — a>=b` |

#### Logic

| Opcode | Stack effect |
|---|---|
| `AND` | `a b — a&&b` |
| `OR` | `a b — a||b` |
| `NOT` | `a — !a` |
| `XOR` | `a b — a^b` |

#### Control Flow

```
LABEL:          ; define a jump target (not an instruction, no cost)

GOTO label      ; unconditional jump
IF              ; pop top; if 0 skip to matching ENDIF
ELSE            ; within IF block; flip condition branch
ENDIF           ; end IF block
LOOP            ; begin a counted loop: pop N, iterate N times
POOL            ; end LOOP block
CALL label      ; push return address, jump to label (subroutine)
RETURN          ; pop return address, jump back
```

`IF/ELSE/ENDIF` and `LOOP/POOL` may be nested up to 16 levels deep.

#### Variable Access

```
STORE n         ; pop value, store in variable slot n (1–100)
RECALL n        ; push value from variable slot n
```

Named variables are syntactic sugar resolved by the compiler:

```
#DEFINE myvar 42    ; resolves "myvar" to slot 42
```

#### Register Access

Reading a register pushes its value; writing pops a value from the stack:

```
ENERGY          ; push current energy
5 SHIELD        ; pop 5 (truthy) → enable shield
RANGE           ; push radar range reading
```

### 3.4 Execution Model

1. At the start of each game tick the VM executes **CPU cycles** instructions for each robot (see §4 hardware).
2. If the stack underflows, the offending instruction is a no-op (no crash).
3. Programs wrap around: execution reaching the end jumps to the beginning.
4. A robot that is `STUNNED` still runs its program but hardware writes are ignored.
5. The VM is cycle-accurate for replay determinism; random seeds are stored in the replay header.

### 3.5 Sample Program

```
; Simple duelist — aim at nearest enemy and fire continuously
LOOP
  RADAR AIM     ; point gun at detected bearing
  1 FIRE        ; fire bullet
  ENERGY 20 <   ; if low on energy
  IF
    0 SHIELD    ; drop shields to conserve energy
  ELSE
    1 SHIELD    ; otherwise keep shields up
  ENDIF
POOL
```

### 3.6 Compiler

The compiler performs these passes:

1. **Tokeniser** — whitespace/comment stripping, string → token stream
2. **Label resolution** — first pass collects all label addresses
3. **Macro expansion** — `#DEFINE` substitution
4. **Bytecode emission** — tokens → compact integer array
5. **Validation** — unmatched IF/ENDIF, LOOP/POOL, CALL with no RETURN, unknown opcodes → error with line number

Compiler errors are displayed inline in the editor (§6.2).

---

## 4. Hardware System

Each robot is configured by spending **hardware points (HP)** from a fixed budget (default: **30 HP**). Players may not exceed the budget; unspent points are wasted.

### 4.1 Hardware Components

#### Armor

| Level | HP cost | Max armor |
|---|---|---|
| 0 | 0 | 15 |
| 1 | 2 | 30 |
| 2 | 4 | 50 |
| 3 | 6 | 75 |
| 4 | 8 | 100 |

#### Shield

| Level | HP cost | Energy drain/tick (when active) | Damage multiplier |
|---|---|---|---|
| 0 | 0 | — | none (no shield) |
| 1 | 2 | 2 | 0.75× |
| 2 | 4 | 3 | 0.50× |
| 3 | 6 | 5 | 0.30× |

#### Weapon

| Type | HP cost | Damage | Speed | Heat/shot | Notes |
|---|---|---|---|---|---|
| None | 0 | — | — | — | Programs can still store/recall |
| Bullet | 2 | 3 | 15 px/tick | 1 | Unlimited ammo |
| Missile | 4 | 8 | 8 px/tick | 3 | Tracks target for 5 ticks |
| Drone | 6 | 4/tick | 5 px/tick | 5 | Persists until destroyed or timer expires (30 ticks) |
| Triple shot | 6 | 3×3 | 15 px/tick | 4 | Three bullets in a spread |

Robots overheat when `HEAT` exceeds max heat; while overheated `FIRE` is ignored until heat dissipates.

#### Engine

| Level | HP cost | Max speed | Acceleration |
|---|---|---|---|
| 0 | 0 | 4 | 1 |
| 1 | 2 | 6 | 2 |
| 2 | 4 | 8 | 3 |
| 3 | 6 | 12 | 4 |

#### Energy

| Level | HP cost | Max energy | Recharge/tick |
|---|---|---|---|
| 0 | 0 | 50 | 1 |
| 1 | 2 | 100 | 2 |
| 2 | 4 | 150 | 3 |
| 3 | 6 | 200 | 4 |

#### CPU

Controls how many VM instructions execute per tick.

| Level | HP cost | Cycles/tick |
|---|---|---|
| 0 | 0 | 5 |
| 1 | 2 | 10 |
| 2 | 4 | 20 |
| 3 | 6 | 40 |

#### Cooling

| Level | HP cost | Heat dissipated/tick |
|---|---|---|
| 0 | 0 | 1 |
| 1 | 2 | 2 |
| 2 | 4 | 4 |

#### Radar

Affects the cone angle and maximum range of the radar sensor.

| Level | HP cost | Max range | Cone angle |
|---|---|---|---|
| 0 | 0 | 200 | 60° |
| 1 | 2 | 350 | 120° |
| 2 | 4 | 500 | 180° |
| 3 | 6 | 999 | 360° |

### 4.2 Hardware Budget Enforcement

The editor displays a live **HP remaining** counter. Any configuration exceeding 30 HP marks the robot invalid and blocks saving.

---

## 5. Arena & Combat Engine

### 5.1 Arena

- **Dimensions:** 300 × 300 logical units (rendered scaled to fit viewport)
- **Walls:** Hard boundaries; robots and projectiles bounce off walls elastically (velocity component negated)
- **Starting positions:** Assigned randomly from a set of spawn zones at tick 0; no two robots spawn within 50 units of each other
- **Victory condition:** Last robot (or team) standing; if tick limit is reached the robot with most remaining armor wins; ties go to the robot with most remaining energy

Default tick limit: **2000 ticks** per battle.

### 5.2 Physics

Each tick the combat engine:

1. Processes all VM writes (thrust, aim, fire commands)
2. Applies acceleration from thrust to velocity, capped by engine max speed
3. Applies braking (velocity × 0.85 per tick when `BRAKE=1`)
4. Moves each robot by its velocity vector
5. Resolves wall collisions (bounce + set `COLLISION=1`)
6. Resolves robot–robot collisions (elastic exchange, both `COLLISION=1`)
7. Moves all active projectiles
8. Resolves projectile–robot hits
9. Updates heat, energy, shield state
10. Checks win condition

### 5.3 Projectiles

| Property | Bullet | Missile | Drone |
|---|---|---|---|
| Radius | 2 | 4 | 6 |
| Max ticks alive | 40 | 80 | 30 |
| Wall behaviour | Destroyed | Bounces once then destroyed | Destroyed |
| Homing | No | Yes (5 ticks) | Stationary |
| Collateral | No | No | Yes (proximity each tick) |

Missiles home toward the **owner's current radar target** for the first 5 ticks using a proportional navigation algorithm, then fly straight.

### 5.4 Damage Resolution

```
raw_damage = weapon_damage
shielded_damage = raw_damage × shield_multiplier   (if shield active & energy > 0)
armor -= shielded_damage
energy -= shield_energy_drain × shielded  (per tick shield is active)
```

When `armor ≤ 0` the robot is destroyed and removed from the arena.

### 5.5 Radar Resolution

Each tick, the radar scans a cone of `radar_cone_angle` centered on the robot's `AIM` direction. The nearest enemy within the cone and within `radar_max_range` updates `RANGE` and `RADAR`. If no enemy is in the cone, both registers return their previous values.

### 5.6 Determinism & Replay

- All RNG uses a **seeded LCG** (seed stored in battle record)
- Arena state is a pure function of (seed, robot programs, hardware configs, tick)
- Replays are stored as `{ seed, robots[] }` — the full battle can be re-simulated client-side
- Simulation runs in a Web Worker; the main thread renders from a frame buffer updated via `postMessage`

---

## 6. User Interface & Game Modes

### 6.1 Navigation

```
Home
├── My Robots          — list, create, import
├── Battle             — set up and run a battle
├── Tournament         — create / join / view
├── Leaderboard        — global rankings
└── Settings           — account, display, key bindings
```

### 6.2 Robot Editor

The editor is the primary creation surface. It is split into three panels:

```
┌───────────────────────┬─────────────────────────────┐
│  Hardware Config      │  Program Editor (CodeMirror) │
│  ─────────────────    │  ────────────────────────    │
│  Armor      [▓▓░░] 2  │  1  LOOP                     │
│  Shield     [▓░░░] 1  │  2    RADAR AIM              │
│  Weapon     [Missile]  │  3    1 FIRE                 │
│  Engine     [▓▓░░] 2  │  4  POOL                     │
│  Energy     [▓▓▓░] 3  │                              │
│  CPU        [▓░░░] 1  │  [Errors]                    │
│  Cooling    [▓░░░] 1  │  No errors                   │
│  Radar      [▓▓░░] 2  │                              │
│  ─────────────────    │                              │
│  HP used: 14 / 30     │                              │
│  HP remaining: 16     │                              │
└───────────────────────┴─────────────────────────────┘
│  [ Save ]  [ Test in Battle ]  [ Share ]              │
└───────────────────────────────────────────────────────┘
```

**Editor features:**

- Syntax highlighting for all opcodes, registers, labels, and comments
- Inline error markers (red gutter icon) with hover messages for compiler errors
- Opcode autocomplete (Ctrl+Space)
- Jump-to-label navigation (Ctrl+Click on label reference)
- Robot icon picker (16 classic pixel-art icons)
- Import/export as plain-text `.rw` file

### 6.3 Battle Setup

1. Select 2–8 robots from the robot roster (own + downloaded)
2. Choose arena size (Small: 200×200 / Standard: 300×300 / Large: 500×500)
3. Set team assignments (optional)
4. Set tick limit (500–5000)
5. Click **Start Battle**

### 6.4 Battle Viewer

```
┌─────────────────────────────────────────────────────────────┐
│  [Arena Canvas — 300×300 logical, scaled to fit]            │
│  Robots rendered as 16×16 sprite; projectiles as dots       │
│  Shield shown as coloured glow                              │
└─────────────────────────────────────────────────────────────┘
│  Tick: 1204 / 2000   Speed: [●○○○] 1×  [▶ Play] [◼ Stop]  │
├────────────────────┬────────────────────┬───────────────────┤
│ Robot A            │ Robot B            │ Robot C           │
│ Armor  ██████░  65 │ Armor  ████░░░  40 │ DESTROYED (t=876) │
│ Energy █████░░  80 │ Energy ███░░░░  45 │                   │
│ Heat   █░░░░░░  10 │ Heat   ██░░░░░  20 │                   │
└────────────────────┴────────────────────┴───────────────────┘
```

**Viewer controls:**

| Control | Action |
|---|---|
| Play / Pause | Space |
| Step forward 1 tick | → |
| Step back 1 tick | ← |
| Speed 1× / 5× / 20× / Max | 1/2/3/4 |
| Jump to tick | Ctrl+G |
| Export replay | Ctrl+S |
| Share replay link | Ctrl+Shift+S |

### 6.5 Tournament Mode

**Bracket formats:**

- **Round Robin** — every robot faces every other; ranked by wins then armor
- **Single Elimination** — standard bracket, seeded by ELO or manual
- **Double Elimination** — losers get one more chance

**Tournament flow:**

1. Creator names the tournament, sets format and robot limit
2. Participants submit one robot per entry (or organiser loads a set)
3. All battles simulate server-side (or locally for private tournaments)
4. Results page shows bracket, per-battle replays, and final standings
5. ELO ratings update after each tournament concludes

**Public tournaments** appear on the Leaderboard page. Private tournaments are accessible only by link.

### 6.6 Leaderboard

- **All-time ELO** — global ranking of robots by rated score
- **This week** — wins since Monday reset
- **By weapon type** — filter by primary weapon
- Each row shows: rank, robot name, owner, win/loss/draw, ELO, link to latest replay

---

## 7. Networking & Multiplayer

### 7.1 Asynchronous Matchmaking

Battles are **asynchronous** — there is no real-time connection requirement. The server simulates battles in a background queue and stores replays. Players submit robots; the system runs ranked battles automatically.

**Match frequency:**

- Each robot enters the queue for a rated match every 6 hours (configurable)
- Players can also challenge any public robot to an unranked match at any time

### 7.2 API Endpoints

```
POST   /api/robots             — create robot
GET    /api/robots/:id         — fetch robot definition
PATCH  /api/robots/:id         — update robot program/hardware
DELETE /api/robots/:id         — delete robot

POST   /api/battles            — queue a battle
GET    /api/battles/:id        — fetch battle result + replay blob
GET    /api/battles/:id/replay — download replay JSON

POST   /api/tournaments        — create tournament
GET    /api/tournaments/:id    — fetch bracket + results
POST   /api/tournaments/:id/enter — add robot to tournament

GET    /api/leaderboard        — paginated ELO rankings
GET    /api/users/:id/robots   — list a user's public robots
```

### 7.3 Robot Sharing

A robot's definition (program text + hardware config) is exportable as:

- **`.rw` file** — plain text, importable into any compatible client
- **Share link** — `robowar.example.com/robots/:id` — view-only page with editor (read-only) and battle button

### 7.4 Authentication

- Email + password (bcrypt)
- Optional OAuth via GitHub
- JWT access token (1 hour) + refresh token (30 days) stored in `httpOnly` cookie
- Guest mode: play locally without an account; battles are not rated

### 7.5 Real-time Battle Spectating (v2)

> Out of scope for v1; documented here for forward compatibility.

When two users trigger a live match simultaneously, the server uses Socket.io to push frame-by-frame battle events to both clients, enabling real-time co-watching. The protocol emits delta state (moved robots, new projectiles, destroyed objects) rather than full arena snapshots.

---

## 8. Data Formats

### 8.1 Robot Definition (JSON)

```json
{
  "id": "rbt_abc123",
  "name": "Trackstar",
  "owner": "usr_xyz",
  "icon": 3,
  "hardware": {
    "armor": 2,
    "shield": 1,
    "weapon": "missile",
    "engine": 2,
    "energy": 3,
    "cpu": 1,
    "cooling": 1,
    "radar": 2
  },
  "program": "LOOP\n  RADAR AIM\n  1 FIRE\nPOOL\n",
  "createdAt": "2026-05-21T00:00:00Z",
  "updatedAt": "2026-05-21T00:00:00Z"
}
```

### 8.2 Replay Format (JSON)

```json
{
  "version": 1,
  "seed": 48291,
  "tickLimit": 2000,
  "arena": { "width": 300, "height": 300 },
  "robots": [
    { "robotId": "rbt_abc123", "startX": 50, "startY": 50 },
    { "robotId": "rbt_def456", "startX": 250, "startY": 250 }
  ],
  "result": {
    "winner": "rbt_abc123",
    "survivingArmor": 42,
    "ticksElapsed": 1204
  }
}
```

Full frame data is not stored; the client re-simulates from this header.

### 8.3 .rw File Format

Plain text, one token per line. Sections delimited by `#`:

```
#NAME Trackstar
#ICON 3
#HARDWARE armor=2 shield=1 weapon=missile engine=2 energy=3 cpu=1 cooling=1 radar=2
#PROGRAM
LOOP
  RADAR AIM
  1 FIRE
POOL
#END
```

---

## 9. Open Questions

| # | Question | Options | Priority |
|---|---|---|---|
| 1 | Should the hardware budget be 30 HP (classic) or adjustable per tournament? | Fixed / Variable | High |
| 2 | Exact damage values for weapons — mirror original or rebalance for web feel? | Classic / Rebalanced | High |
| 3 | Should drones have player-writable velocity each tick or be fully autonomous? | Autonomous (classic) / Programmable | Medium |
| 4 | Team communication — should teammates share a message register? | No / Register pair per team slot | Medium |
| 5 | ELO K-factor and initial rating? | K=32, 1200 start | Low |
| 6 | Tick rate for real-time spectating (v2)? | 60 ticks/s sim, 20 fps push | Low |
| 7 | Maximum program length (instruction count)? | 1000 (classic) / 4000 | Low |
