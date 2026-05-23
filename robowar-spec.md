# RoboWar Web — Game Specification

**Version:** 0.2 (updated to match v1 implementation)
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
- Backend server / online multiplayer (v1 uses localStorage; see §7)

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
│                                                               │
│  localStorage: robot definitions, ELO ratings                │
└─────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| **Compiler** | Tokenise, parse, and assemble RoboWar source into bytecode |
| **VM** | Execute bytecode on a per-robot stack machine each game tick |
| **Combat Engine** | Move projectiles, apply damage, resolve collisions each tick |
| **Renderer** | Draw arena state to Canvas 2D at up to 60 fps |
| **localStorage** | Persist robot definitions and ELO ratings client-side (v1) |

The VM and Combat Engine run inside a **Web Worker** so the UI thread stays responsive during fast-forward and simulation. The worker simulates the entire battle and returns all frames at once; the viewer plays them back from the local frame buffer.

### v2 Backend (not yet implemented)

```
Node.js / Express  +  PostgreSQL  +  Socket.io
```

Planned for online matchmaking, persistent leaderboards, robot sharing, and real-time spectating.

---

## 3. Robot Programming Language

### 3.1 Language Model

RoboWar programs execute on a **stack machine** similar to Forth. Each robot gets a fixed number of CPU cycles per game tick (configurable via hardware). A program consists of a flat list of tokens; control flow uses labels and conditional/unconditional jumps.

```
Stack:      integer values (32-bit signed), max depth 256 (oldest entry dropped on overflow)
Registers:  named hardware I/O ports (read or write)
Variables:  100 numbered slots (1–100) + named aliases via #DEFINE
```

**Coordinate system:** `0° = right (+X direction)`, angles increase clockwise (`90° = down`, `180° = left`, `270° = up`). This matches standard Canvas 2D math where +Y is downward. All angle registers (RADAR, AIM) use this convention.

### 3.2 Registers (Hardware Ports)

Registers are the primary interface between the program and the robot's hardware. Reading a register pushes the current sensor value; writing a register issues a hardware command.

#### Read-only Sensors

| Register | Range | Description |
|---|---|---|
| `ENERGY` | 0–max | Current energy level |
| `ARMOR` | 0–max | Current armor (hit points) |
| `HEAT` | 0–20 | Current weapon heat (max heat is fixed at 20) |
| `RANGE` | 0–1500 | Distance to nearest enemy in radar cone |
| `RADAR` | 0–359 | Absolute bearing (°) to nearest detected enemy |
| `SPEEDX` | −max–max | Current X velocity (pixels/tick, rounded) |
| `SPEEDY` | −max–max | Current Y velocity |
| `POSX` | 0–arenaW | Robot X position (rounded) |
| `POSY` | 0–arenaH | Robot Y position (rounded) |
| `COLLISION` | 0/1 | 1 if collided with wall or robot last tick |
| `STUNNED` | 0/1 | 1 if robot is stunned (hardware writes ignored) |
| `TEAMMATES` | 0–7 | Number of surviving robots on the same team |
| `RANDOM` | 0–255 | Deterministic per-robot RNG value; advances once per tick |
| `TIME` | 0+ | Elapsed ticks this battle |

#### Write-only Actuators

| Register | Value | Description |
|---|---|---|
| `SHIELD` | 0/1 | Enable or disable energy shield (ignored if shield hardware = 0) |
| `GUNX` | −10–10 | Set gun aim X component (angle derived via atan2) |
| `GUNY` | −10–10 | Set gun aim Y component |
| `FIRE` | 0–3 | Fire weapon (0=none, 1=bullet, 2=missile, 3=drone) |
| `THRUSTX` | −5–5 | Apply X thrust (clamped; multiplied by engine accel × 0.5 per tick) |
| `THRUSTY` | −5–5 | Apply Y thrust |
| `BRAKE` | 0/1 | Apply braking force (velocity × 0.80 per tick when active) |
| `BEEP` | 0–15 | Play tone (cosmetic only; no effect on simulation) |
| `AIM` | 0–359 | Set gun aim angle directly in degrees (overrides GUNX/GUNY) |

> **Note:** `AIM` is **write-only** in v1. Reading the current aim angle is not supported; use GUNX/GUNY for that purpose in future versions.

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
| `*` | `a b — a*b` | 32-bit integer multiply |
| `/` | `a b — a/b` | Integer division; divide-by-zero → 0 |
| `MOD` | `a b — a mod b` | Always non-negative; divide-by-zero → 0 |
| `ABS` | `a — \|a\|` | |
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
| `OR` | `a b — a\|\|b` |
| `NOT` | `a — !a` |
| `XOR` | `a b — a^b` |

#### Control Flow

```
LABEL:          ; define a jump target (no instruction emitted, no CPU cost)

GOTO label      ; unconditional jump to label
IF              ; pop top; if 0 skip to matching ELSE or ENDIF
ELSE            ; within IF block; flip condition branch
ENDIF           ; end IF block (no instruction emitted)
LOOP            ; begin infinite loop (no instruction emitted; marks body start)
POOL            ; end LOOP block — unconditional jump back to body start
CALL label      ; push return address, jump to label (subroutine)
RETURN          ; pop return address, jump back
```

`IF/ELSE/ENDIF` and `LOOP/POOL` may be nested up to any depth (limited by available stack memory).

> **LOOP semantics:** `LOOP/POOL` creates an **infinite loop** — no count is popped from the stack. The loop body executes continuously across ticks; the robot's VM picks up from where it left off each tick (PC is preserved between ticks). To break out of a loop, use `GOTO`.

#### Variable Access

```
STORE n         ; pop value, store in variable slot n (1–100)
RECALL n        ; push value from variable slot n
```

Named variables are syntactic sugar resolved by the compiler:

```
#DEFINE myvar 42    ; resolves "myvar" to slot 42 everywhere in this program
```

#### Register Access

Reading a register pushes its value; writing pops a value from the stack:

```
ENERGY          ; push current energy level
5 SHIELD        ; pop 5 (truthy) → enable shield
RANGE           ; push radar range reading
RADAR AIM       ; push bearing then pop it into AIM (point gun at nearest enemy)
```

### 3.4 Execution Model

1. At the start of each game tick, sensors are updated for all robots.
2. The VM executes **CPU cycles** instructions for each alive, unstunned robot.
3. Stack underflow returns 0 (no crash).
4. Programs wrap around: when the PC reaches the end of the bytecode it resets to 0.
5. A robot that is `STUNNED` still advances its PC but hardware writes are silently ignored.
6. The VM is cycle-accurate for replay determinism; the battle seed is stored in the replay header.

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

1. **Tokeniser** — split source on whitespace, strip comments (`;` to end of line)
2. **`#DEFINE` extraction** — collect macro definitions before other processing
3. **Macro expansion** — substitute defined names in the token stream (GOTO/CALL label operands are never expanded)
4. **Label collection** — first pass over expanded tokens; simulate bytecode size to assign each label a PC address
5. **Bytecode emission** — second pass emits actual opcodes; back-patches `IF/ELSE/ENDIF` placeholders; resolves `LOOP/POOL` backward jumps
6. **Validation** — unmatched IF/ENDIF, LOOP/POOL; unknown opcodes; invalid STORE/RECALL slots; undefined labels → error with token text

Compiler errors are displayed inline in the editor's error panel.

---

## 4. Hardware System

Each robot is configured by spending **hardware points (HP)** from a fixed budget (**30 HP**). Players may not exceed the budget; unspent points are wasted.

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
| 0 | 0 | — | none (no shield hardware) |
| 1 | 2 | 2 | 0.75× |
| 2 | 4 | 3 | 0.50× |
| 3 | 6 | 5 | 0.30× |

#### Weapon

| Type | HP cost | Damage | Speed | Heat/shot | Notes |
|---|---|---|---|---|---|
| None | 0 | — | — | — | No projectiles |
| Bullet | 2 | 3 | 15 px/tick | 1 | Unlimited ammo |
| Missile | 4 | 8 | 8 px/tick | 3 | Tracks nearest enemy for 5 ticks |
| Drone | 6 | 4/tick | 0 (stationary) | 5 | Persists up to 30 ticks; deals proximity damage each tick |
| Triple | 6 | 3×3 | 15 px/tick | 4 | Three bullets in a ±0.2 rad spread |

Robots overheat when `HEAT` reaches **20** (fixed max); while overheated, `FIRE` writes are ignored until heat dissipates below 20.

#### Engine

| Level | HP cost | Max speed | Acceleration |
|---|---|---|---|
| 0 | 0 | 4 | 1 |
| 1 | 2 | 6 | 2 |
| 2 | 4 | 8 | 3 |
| 3 | 6 | 12 | 4 |

> Velocity change per tick = `THRUSTX/Y × accel × 0.5`, clamped to ±maxSpeed.

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

| Level | HP cost | Max range | Cone angle |
|---|---|---|---|
| 0 | 0 | 200 | 60° |
| 1 | 2 | 350 | 120° |
| 2 | 4 | 500 | 180° |
| 3 | 6 | 999 | 360° |

The radar cone is centered on the robot's current `AIM` angle. If no enemy falls within the cone and range, `RANGE` returns 0 and `RADAR` retains its last known value.

### 4.2 Hardware Budget Enforcement

The editor displays a live **HP remaining** counter. Any configuration exceeding 30 HP marks the robot invalid and blocks saving or starting a battle.

---

## 5. Arena & Combat Engine

### 5.1 Arena

- **Dimensions:** configurable — Small 200×200, Standard 300×300, Large 500×500 (logical units, rendered scaled to viewport)
- **Coordinate system:** origin top-left; +X right, +Y down
- **Robot radius:** 8 logical units (collision boundary and render size)
- **Walls:** hard boundaries; robots bounce elastically (velocity component negated); `COLLISION` set to 1
- **Starting positions:** random spawn within a 40-unit inset margin; robots are placed at least 60 units apart; seed-deterministic
- **Victory condition:** last robot (or team) standing wins; at tick limit the robot with the highest remaining armor wins; ties broken by remaining energy; mutual destruction → Draw

Default tick limit: **2000 ticks** per battle.

### 5.2 Physics

Each tick the combat engine runs in this order:

1. Update all sensors (radar, position, speed, heat, energy, etc.)
2. Run VM for each alive, unstunned robot; collect actuator outputs
3. Apply aim changes from `AIM` / `GUNX` / `GUNY` writes
4. Apply thrust: `vx += thrustX × accel × 0.5`; clamp to ±maxSpeed  
   Apply braking: `vx *= 0.80` when `BRAKE=1`
5. Move each robot by its velocity vector
6. Resolve wall collisions (elastic bounce; set `COLLISION=1`)
7. Resolve robot–robot collisions (overlap separation + elastic velocity exchange; set `COLLISION=1` on both)
8. Move active projectiles; apply missile homing
9. Resolve projectile–robot hits; apply damage
10. Spawn new projectiles from fire commands (if not overheated)
11. Update heat (dissipate `cooling.dissipation` per tick), energy (recharge + shield drain)
12. Remove dead projectiles; check victory condition

### 5.3 Projectiles

| Property | Bullet | Missile | Drone |
|---|---|---|---|
| Radius | 2 | 3 | 5 |
| Max ticks alive | 40 | 80 | 30 |
| Wall behaviour | Destroyed | Bounces once then destroyed | N/A (stationary) |
| Homing | No | Yes (5 ticks) | No |
| Movement | Ballistic | Ballistic + weighted homing | Stationary at spawn point |
| Damage | On contact | On contact | Proximity check each tick |

**Missile homing** uses weighted velocity blending: each homing tick the velocity is adjusted toward the nearest living enemy (`vNew = v×0.7 + direction×speed×0.3`), speed capped at 8 px/tick.

### 5.4 Damage Resolution

```
raw_damage = weapon_damage
shielded_damage = raw_damage × shield_multiplier   (if shield active and energy > 0)
armor -= shielded_damage
energy -= shield_energy_drain                       (per tick shield is active)
```

When `armor ≤ 0` the robot is destroyed and removed from the arena immediately.

When shield energy falls to zero mid-tick the shield deactivates automatically.

### 5.5 Radar Resolution

Each tick, the radar scans a cone of `radarCone` degrees centered on the robot's current `aimAngle`. The nearest enemy within the cone and within `radarRange` updates `RANGE` and `RADAR`. If no enemy is in the cone, `RANGE` returns 0 and `RADAR` retains its last value.

### 5.6 Determinism & Replay

- Each robot has its own **Mulberry32 LCG** seeded from `battleSeed + robotIndex × 997`
- The shared battle RNG (also Mulberry32, seeded from `battleSeed`) is used only for spawn position generation
- Arena state is a pure function of `(battleSeed, robotPrograms, hardwareConfigs, tickCount)`
- Replays are stored as `{ seed, robots[] }` — the full battle is re-simulated client-side
- The battle worker simulates the entire battle synchronously and posts all frames at once

---

## 6. User Interface & Game Modes

### 6.1 Splash Page

Displayed on first load before the main navigation. Full-screen dark background with floating particles.

- **⚔ Enter the Arena** — dismisses the splash and shows the main app (My Robots)
- **📖 Programmer's Guide** — downloads `RoboWar-Programmer-Guide.pdf` (served from `public/`)
- Hint text directs new players to read the guide before entering
- **Credits footer** (below a divider):
  - Original *RoboWar* created by **Rod McFarland** (1989–1994); additional development by **Peter Spear** and the RoboWar community
  - Web version vibe coded in **May 2026** by **Michael Morrow** using **Claude Code** (linked to `https://claude.ai/code`)

### 6.2 Navigation

```
Nav bar
├── My Robots          — list, create, edit, delete, export
├── Battle             — robot selection + arena config → battle viewer
├── Tournament         — round-robin bracket (local, no backend)
├── Leaderboard        — ELO rankings (localStorage)
└── [📖 Docs]          — far-right; downloads RoboWar-Programmer-Guide.pdf
```

### 6.3 Robot Editor

Split into two panels:

```
┌───────────────────────┬─────────────────────────────┐
│  Hardware Config      │  Program Editor (CodeMirror) │
│  ─────────────────    │  ────────────────────────    │
│  Armor      [Lvl 2]   │  1  LOOP                     │
│  Shield     [Lvl 1]   │  2    RADAR AIM              │
│  Weapon     [Bullet]  │  3    1 FIRE                 │
│  Engine     [Lvl 2]   │  4  POOL                     │
│  Energy     [Lvl 2]   │                              │
│  CPU        [Lvl 1]   │  ⚠ Compile errors panel      │
│  Cooling    [Lvl 1]   │                              │
│  Radar      [Lvl 2]   │                              │
│  ─────────────────    │                              │
│  HP used: 14 / 30     │                              │
└───────────────────────┴─────────────────────────────┘
│  [ Save ]  [ Test Battle ]  [ Export .rw ]            │
└───────────────────────────────────────────────────────┘
```

**Editor features (implemented):**

- Syntax highlighting for opcodes, registers, labels, numbers, comments, directives
- Inline error panel below editor listing all compiler errors
- `#DEFINE` macro support
- Import/export as plain-text `.rw` file (export only in v1)
- Live HP budget counter with colour-coded bar (green → yellow → red)
- Save blocked when over budget or compile errors present

### 6.4 Battle Setup

1. Select 2–8 robots via checkboxes
2. Choose arena size (Small 200 / Standard 300 / Large 500)
3. Set tick limit (500 / 1000 / 2000 / 5000)
4. Click **Start Battle** — battle is simulated in a Web Worker

### 6.5 Battle Viewer

```
┌─────────────────────────────────────────────────────────────┐
│  [Arena Canvas — scaled to 600×600 px display]              │
│  Robots: coloured circles + aim line + name + HP/energy bar │
│  Shield: outer glow ring                                     │
│  Projectiles: white (bullet), orange (missile), blue (drone)│
│  Destroyed robots: faded with × mark                        │
└─────────────────────────────────────────────────────────────┘
│  [▶ Play] [◀] [▶] [⏮] [⏭]  Tick: 1204 / 2000              │
│  Speed: [10%] [25%] [1×] [5×] [20×] [Max]  Winner: …       │
├────────────────────┬────────────────────┬───────────────────┤
│ Robot A (color)    │ Robot B            │ Robot C (dead)    │
│ Armor  ██████ 65   │ Armor  ████   40   │ Destroyed         │
│ Energy █████  80   │ Energy ███    45   │                   │
│ Heat   █      10   │ Heat   ██     20   │                   │
└────────────────────┴────────────────────┴───────────────────┘
```

**Viewer controls:**

| Action | Keyboard |
|---|---|
| Play / Pause | Space |
| Step forward 1 tick | → |
| Step back 1 tick | ← |
| Jump to start / end | ⏮ / ⏭ buttons |
| Speed 10% / 25% / 1× / 5× / 20× / Max | 1 / 2 / 3 / 4 / 5 / 6 |

### 6.6 Tournament Mode

**Implemented in v1:** Round-robin only. All matches simulate synchronously on the main thread (no Web Worker). Results include per-match winners and a final standings table sorted by win count.

**v2 (not yet implemented):** Single elimination, double elimination, server-side simulation for large brackets.

### 6.7 Leaderboard

- Displays all saved robots sorted by ELO rating (default 1200)
- **Run Rated Matches** button simulates every pairwise match and updates ELO (K=32)
- Ratings persist in `localStorage` under key `robowar_elo`
- Columns: rank, robot name, weapon type, HP cost, ELO

---

## 7. Networking & Multiplayer

> **v1 status:** All features in this section are **not implemented**. v1 uses localStorage for all persistence. This section describes the planned v2 backend.

### 7.1 Asynchronous Matchmaking

Battles are **asynchronous** — there is no real-time connection requirement. The server simulates battles in a background queue and stores replays. Players submit robots; the system runs ranked battles automatically.

### 7.2 API Endpoints (v2)

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

**v1:** Export as `.rw` text file (download). Import from `.rw` file is planned but not yet implemented.

**v2:** Share link — `robowar.example.com/robots/:id` — view-only page with read-only editor and battle button.

### 7.4 Authentication (v2)

- Email + password (bcrypt)
- Optional OAuth via GitHub
- JWT access token (1 hour) + refresh token (30 days) stored in `httpOnly` cookie
- Guest mode: play locally without an account; battles are not rated

### 7.5 Real-time Battle Spectating (v2)

When two users trigger a live match simultaneously, the server uses Socket.io to push frame-by-frame battle events to both clients. The protocol emits delta state (moved robots, new projectiles, destroyed objects) rather than full arena snapshots.

---

## 8. Data Formats

### 8.1 Robot Definition (JSON — localStorage)

```json
{
  "id": "rbt_abc123",
  "name": "Trackstar",
  "hardware": {
    "armor": 2,
    "shield": 1,
    "weapon": "bullet",
    "engine": 2,
    "energy": 2,
    "cpu": 1,
    "cooling": 1,
    "radar": 2
  },
  "program": "LOOP\n  RADAR AIM\n  1 FIRE\nPOOL\n"
}
```

### 8.2 Battle Config (passed to Web Worker)

```json
{
  "robots": [ /* array of robot definitions */ ],
  "arenaWidth":  300,
  "arenaHeight": 300,
  "tickLimit":   2000,
  "seed":        48291
}
```

### 8.3 Frame (returned by worker, one per tick)

```json
{
  "tick": 42,
  "robots": [
    {
      "id": "rbt_abc123",
      "name": "Trackstar",
      "x": 145.3, "y": 88.7,
      "alive": true,
      "armor": 42,   "maxArmor": 50,
      "energy": 110, "maxEnergy": 150,
      "heat": 3,     "maxHeat": 20,
      "shieldActive": true,
      "aimAngle": 37.5,
      "color": "#ff4757"
    }
  ],
  "projectiles": [
    { "id": 7, "type": "bullet", "x": 200, "y": 100, "alive": true, "radius": 2 }
  ],
  "result": null
}
```

`result` is `null` until the battle ends, then `{ "winnerId", "winnerName", "reason" }`.

Full frame data is held in the browser's memory; replays are not persisted to localStorage in v1.

### 8.4 .rw File Format

Plain text. Sections delimited by `#` directives:

```
#NAME Trackstar
#HARDWARE armor=2 shield=1 weapon=bullet engine=2 energy=2 cpu=1 cooling=1 radar=2
#PROGRAM
LOOP
  RADAR AIM
  1 FIRE
POOL
#END
```

---

## 9. Open Questions

| # | Question | Status | Decision |
|---|---|---|---|
| 1 | Hardware budget fixed at 30 HP or adjustable per tournament? | **Resolved** | Fixed at 30 HP in v1; per-tournament override is a v2 feature |
| 2 | Damage values — mirror original or rebalance? | **Resolved** | Spec values used as-is; balance tuning deferred to v2 |
| 3 | Drones — autonomous or player-writable velocity? | **Resolved** | Autonomous (stationary); fully programmable drone velocity is v2 |
| 4 | Team communication — shared message register? | **Resolved** | Not implemented in v1; TEAMMATES register is read-only |
| 5 | ELO K-factor and initial rating? | **Resolved** | K=32, 1200 start; stored in localStorage |
| 6 | Tick rate for real-time spectating? | **Deferred** | Not applicable until v2 backend is implemented |
| 7 | Maximum program length? | **Open** | No hard limit in v1; stack capped at 256 entries; bytecode length unconstrained |
| 8 | `.rw` file import in editor? | **Open** | Export implemented; import UI not yet built |
| 9 | Tournament formats beyond round robin? | **Open** | Single and double elimination deferred to v2 |
