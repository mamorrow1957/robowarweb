# RoboWar Web — Game Specification

**Version:** 0.6 (user accounts, server-side robot storage, JWT auth — fully implemented)
**Platform:** Web (JavaScript / HTML5 Canvas)
**Based on:** RoboWar 4.1.7 (Rod McFarland, 1989–1994)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Robot Programming Language](#3-robot-programming-language) — registers, instructions, DOPPLER, LOOK/SCAN, wall distances, trig, interrupts
4. [Hardware System](#4-hardware-system)
5. [Arena & Combat Engine](#5-arena--combat-engine)
6. [User Interface & Game Modes](#6-user-interface--game-modes)
7. [Networking & Multiplayer](#7-networking--multiplayer)
8. [Data Formats](#8-data-formats)
9. [Test Case Structure](#9-test-case-structure)
10. [Open Questions](#10-open-questions)

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
- Real-time multiplayer / live battle spectating (deferred to v2)

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
| **localStorage** | Persist guest robots, ELO ratings, and auth token client-side |
| **Express API** | REST endpoints for auth and robot CRUD; runs on port 3001 |
| **SQLite DB** | Server-side persistence for user accounts and robot definitions |

The VM and Combat Engine run inside a **Web Worker** so the UI thread stays responsive during fast-forward and simulation. The worker simulates the entire battle and returns all frames at once; the viewer plays them back from the local frame buffer.

### v1 Backend (implemented in v0.6)

```
Node.js / Express  +  SQLite  +  JWT (bcryptjs)
```

Deployed alongside the Nginx front-end server. Nginx proxies `/api/*` to the Express process on port 3001. The database file (`robowar.db`) lives on the server filesystem and persists across deployments. The service runs under systemd and restarts automatically on failure.

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
| `DAMAGE` | 0+ | Total damage received so far this battle |
| `RANGE` | 0–1500 | Distance to nearest enemy within the `AIM+SCAN` cone |
| `RADAR` | 0–359 | Absolute bearing (°) to nearest detected enemy in `AIM+SCAN` cone |
| `DOPPLER` | −max–max | Radial velocity of nearest object in the `AIM+LOOK` direction (positive = approaching, negative = receding). Used to lead shots. |
| `SPEEDX` | −max–max | Current X velocity (pixels/tick, rounded) |
| `SPEEDY` | −max–max | Current Y velocity |
| `X` | 0–arenaW | Robot X position (rounded). Alias: `POSX` |
| `Y` | 0–arenaH | Robot Y position (rounded). Alias: `POSY` |
| `TOP` | 0+ | Distance from robot to the top arena wall |
| `BOT` | 0+ | Distance from robot to the bottom arena wall |
| `LEFT` | 0+ | Distance from robot to the left arena wall |
| `RIGHT` | 0+ | Distance from robot to the right arena wall |
| `COLLISION` | 0/1 | 1 if collided with wall or robot last tick |
| `STUNNED` | 0/1 | 1 if robot is stunned (hardware writes ignored) |
| `ROBOTS` | 1+ | Total robots still alive (including self). Alias: `TEAMMATES` |
| `RANDOM` | 0–255 | Deterministic per-robot RNG value; advances once per tick |
| `CHRONON` | 0+ | Elapsed ticks this battle. Alias: `TIME` |
| `ID` | 0–7 | Robot's index in this battle (0-based, stable for full battle) |

#### Read/Write Registers

These registers can be both read (push current value) and written (update the stored value).

| Register | Range | Read | Write |
|---|---|---|---|
| `AIM` | 0–359 | Push current gun aim angle in degrees | Set gun aim directly (overrides GUNX/GUNY) |
| `LOOK` | 0–359 | Push current look offset | Set angular offset used by `DOPPLER`. Combined with `AIM` to determine the direction scanned for Doppler reading. **Resets to 0 each tick — write inside `LOOP` to keep active.** |
| `SCAN` | 0–359 | Push current scan offset | Set angular offset applied to the radar/range scan direction. Combined with `AIM` when computing `RADAR`/`RANGE`. **Resets to 0 each tick — write inside `LOOP` to keep active.** |

> **LOOK vs SCAN:** `LOOK` shifts the direction used for `DOPPLER` sensing; `SCAN` shifts the direction used for `RADAR`/`RANGE` sensing. Both offsets are relative to the current `AIM` angle and **reset to 0 each tick** (like THRUSTX/THRUSTY). Include them inside your main loop to maintain a persistent offset.

#### Write-only Actuators

| Register | Value | Description |
|---|---|---|
| `SHIELD` | 0/1 | Enable or disable energy shield (ignored if shield hardware = 0) |
| `GUNX` | −10–10 | Set gun aim X component (angle derived via atan2) |
| `GUNY` | −10–10 | Set gun aim Y component |
| `FIRE` | any > 0 | Fire one projectile per write. Each write with value > 0 queues one shot; write N times in a tick to fire N projectiles. Ignored if heat ≥ 20 or no weapon. |
| `THRUSTX` | −5–5 | Apply X thrust (clamped; multiplied by engine accel × 0.5 per tick) |
| `THRUSTY` | −5–5 | Apply Y thrust |
| `BRAKE` | 0/1 | Apply braking force (velocity × 0.80 per tick when active) |
| `BEEP` | 0–15 | Play tone; writing any non-zero value also queues a SIGNAL interrupt on all alive teammates |

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
| `SQRT` | `a — floor(√a)` | Integer square root; negative input → 0 |
| `DIST` | `dx dy — dist` | Euclidean distance: `floor(√(dx²+dy²))` |

#### Trigonometry

All trig functions work in **degrees** (matching the angle convention used by all registers). Results are scaled by 1000 (i.e. `SIN 90` → 1000, `SIN 45` → 707) so programs can do integer arithmetic without floating point.

| Opcode | Stack effect | Notes |
|---|---|---|
| `SIN` | `deg — sin×1000` | Sine, degrees in, ×1000 scaled out |
| `COS` | `deg — cos×1000` | Cosine, degrees in, ×1000 scaled out |
| `TAN` | `deg — tan×1000` | Tangent; 90° / 270° → 0 (undefined clamped) |
| `ARCTAN` | `y x — deg` | Two-argument arctangent (like atan2); returns 0–359 |
| `ARCSIN` | `val — deg` | Inverse sine; input is ×1000 scaled |
| `ARCCOS` | `val — deg` | Inverse cosine; input is ×1000 scaled |

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

#### Interrupt Control

| Opcode | Operands | Description |
|---|---|---|
| `SETINT` | `name label` | Register `label` as the ISR for interrupt `name`. Use `0` as label to disable. |
| `SETPARAM` | `name value` | Set the threshold parameter for interrupt `name` (see §3.7 for defaults). |
| `INTON` | — | Enable interrupt processing (default: enabled). |
| `INTOFF` | — | Disable interrupt processing (interrupts still queue but do not fire). |
| `RTI` | — | Return from interrupt — re-enables interrupts and jumps back to interrupted PC. Equivalent to `INTON RETURN`. |
| `FLUSHINT` | — | Clear the interrupt queue without executing pending handlers. |

Interrupt names: `COLLISION`, `WALL`, `DAMAGE`, `SHIELD`, `TOP`, `BOTTOM`, `LEFT`, `RIGHT`, `RADAR`, `RANGE`, `ROBOTS`, `SIGNAL`, `CHRONON`. See §3.7 for full descriptions.

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

1. At the start of each game tick, sensors are updated for all robots (including `DOPPLER`, wall distances, `CHRONON`, etc.).
2. Before executing normal program instructions, the VM checks the **interrupt queue**:
   - Any interrupt whose condition became true this tick is appended to the queue (highest-priority first).
   - If interrupts are enabled (`INTON`) and the queue is non-empty, the VM saves the current PC, disables further interrupt delivery, and jumps to the registered handler.
   - The handler runs for as many CPU cycles as remain this tick. `RTI` re-enables interrupts and restores the saved PC.
3. The VM executes **CPU cycles** instructions for each alive, unstunned robot.
4. Stack underflow returns 0 (no crash).
5. Programs wrap around: when the PC reaches the end of the bytecode it resets to 0.
6. A robot that is `STUNNED` still advances its PC but hardware writes are silently ignored.
7. The VM is cycle-accurate for replay determinism; the battle seed is stored in the replay header.

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

### 3.6 Advanced Sample Programs

**Doppler-guided duelist** — uses `LOOK`/`DOPPLER` to lead shots:

```
; Lead shots using Doppler radial velocity
#DEFINE targetBearing 1
#DEFINE leadAngle     2
#DEFINE dopplerVal    3

LOOP
  RADAR STORE targetBearing   ; bearing to nearest enemy
  0 LOOK                      ; look straight along aim direction
  DOPPLER STORE dopplerVal    ; positive = enemy approaching

  ; Crude lead: add doppler/4 degrees of lead angle
  RECALL dopplerVal 4 / STORE leadAngle
  RECALL targetBearing RECALL leadAngle + AIM

  1 FIRE

  ENERGY 20 <
  IF  0 SHIELD  ELSE  1 SHIELD  ENDIF
POOL
```

**CHRONON-based alternator** — different behavior in odd vs even ticks:

```
LOOP
  CHRONON 2 MOD  ; 0 on even ticks, 1 on odd
  IF
    RADAR AIM  1 FIRE   ; odd ticks: shoot
  ELSE
    RANDOM THRUSTX      ; even ticks: random thrust
  ENDIF
POOL
```

**Interrupt-driven wall avoider** — uses `SETINT`/`SETPARAM` to react to wall proximity:

```
; Register wall interrupt handler at program start
SETINT WALL wallAvoid
SETPARAM WALL 40          ; fire when within 40 units of any wall
INTON

LOOP
  RADAR AIM
  1 FIRE
POOL

wallAvoid:
  ; When near a wall, thrust toward arena center and then return
  X 150 - NEG THRUSTX     ; push away from X edge (assumes 300×300 arena)
  Y 150 - NEG THRUSTY
RTI
```

### 3.7 Interrupt System

Interrupts let a robot define **event-driven subroutines** that execute automatically when a condition is met, without the main program needing to poll for it each tick.

#### How Interrupts Work

1. The program registers a handler label and optional threshold using `SETINT` and `SETPARAM`.
2. Each tick, before normal VM execution, the engine evaluates all registered interrupts.
3. Any that fire are appended to the **interrupt queue** in priority order (lower number = higher priority).
4. If interrupts are enabled (`INTON`), the VM saves the current PC and jumps to the handler.
5. The handler runs for the remaining CPU cycles that tick. `RTI` re-enables interrupts and resumes the original PC next tick.
6. Multiple interrupts can queue; they are served one per tick in priority order.

#### Interrupt Types

| Name | Priority | Default Param | Fires when… |
|---|---|---|---|
| `COLLISION` | 1 | — | Robot collides with a wall or another robot |
| `WALL` | 2 | 30 | Robot is within N units of any arena wall |
| `DAMAGE` | 3 | 1 | Damage taken in a single tick ≥ N |
| `SHIELD` | 4 | 10 | Shield energy drops below N |
| `TOP` | 5 | 20 | Robot Y position < N (near top wall) |
| `BOTTOM` | 6 | arenaH−20 | Robot Y position > N (near bottom wall) |
| `LEFT` | 7 | 20 | Robot X position < N (near left wall) |
| `RIGHT` | 8 | arenaW−20 | Robot X position > N (near right wall) |
| `RADAR` | 9 | arenaW×2 | Nearest detected enemy range ≤ N |
| `RANGE` | 10 | arenaW×2 | Nearest object in SCAN direction ≤ N units away |
| `ROBOTS` | 12 | 6 | Fewer than N robots remain alive in the arena |
| `CHRONON` | 14 | 0 | Fires every N ticks (0 = disabled) |

#### Interrupt Instructions in Detail

```
SETINT WALL myHandler     ; register label "myHandler" as the WALL interrupt service routine
                          ; use "0" or an undefined label to unregister

SETPARAM WALL 50          ; set the WALL interrupt threshold to 50 units

SETPARAM CHRONON 10       ; fire a CHRONON interrupt every 10 ticks

INTOFF                    ; globally disable interrupt delivery (they still queue)
INTON                     ; re-enable interrupt delivery

RTI                       ; return from interrupt:
                          ;   re-enables interrupts + jumps to saved PC
                          ;   equivalent to: INTON RETURN

FLUSHINT                  ; discard all queued interrupts without executing them
```

> **Interrupt safety:** While a handler is executing, interrupts are automatically disabled (to prevent re-entry). Always end handlers with `RTI` rather than `RETURN` to ensure interrupts are re-enabled. Calling `INTOFF` inside a handler followed by `RETURN` permanently disables interrupts for that robot.

#### Example: Reactive Shield

```
; Only raise shield when taking heavy fire — saves energy otherwise
SETINT DAMAGE damageISR
SETPARAM DAMAGE 3         ; fire if we take ≥ 3 damage in one tick
INTON

LOOP
  RADAR AIM
  1 FIRE
  0 SHIELD                ; shield normally off to save energy
POOL

damageISR:
  1 SHIELD                ; snap shield on
  ; main loop will turn it off again next time through
RTI
```

### 3.8 Compiler

The compiler performs these passes:

1. **Tokeniser** — split source on whitespace, strip comments (`;` to end of line)
2. **`#DEFINE` extraction** — collect macro definitions before other processing
3. **Macro expansion** — substitute defined names in the token stream (GOTO/CALL/SETINT/SETPARAM label and name operands are never expanded)
4. **Label collection** — first pass over expanded tokens; simulate bytecode size to assign each label a PC address
5. **Bytecode emission** — second pass emits actual opcodes; back-patches `IF/ELSE/ENDIF` placeholders; resolves `LOOP/POOL` backward jumps; encodes `SETINT`/`SETPARAM` two-word instructions
6. **Validation** — unmatched IF/ENDIF, LOOP/POOL; unknown opcodes; invalid STORE/RECALL slots; undefined labels; unknown interrupt names in SETINT/SETPARAM → error with token text

Compiler errors are displayed inline in the editor's error panel.

#### Two-word Instructions

`SETINT` and `SETPARAM` each consume **two tokens**: the interrupt name and the label/value. These tokens are never macro-expanded and must be literal identifiers or integers.

```
SETINT  WALL   myHandler   ; two tokens consumed: "WALL" and "myHandler"
SETPARAM CHRONON 10         ; two tokens consumed: "CHRONON" and "10"
```

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
- **📖 Programmer's Guide** — opens `programmer-guide.html` in a new tab (served from `public/`)
- Hint text directs new players to read the guide before entering
- **Credits footer** (below a divider):
  - Original *RoboWar* created by **Rod McFarland** (1989–1994); additional development by **Peter Spear** and the RoboWar community
  - Web version vibe coded in **May 2026** by **Michael Morrow** using **Claude Code** (linked to `https://claude.ai/code`)

### 6.2 Navigation

```
Nav bar
├── My Robots          — list, create, edit, delete, import/export
├── Battle             — robot selection + arena config → battle viewer
├── Tournament         — round-robin bracket (local, no backend)
├── Leaderboard        — ELO + W/L/D rankings (localStorage)
└── [📖 Docs]          — far-right; opens programmer-guide.html in new tab
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

- Syntax highlighting for opcodes, registers, labels, numbers, comments, directives, interrupt type names
- Opcode/register autocomplete via Ctrl+Space (powered by `@codemirror/autocomplete`)
- Inline error panel below editor listing all compiler errors
- `#DEFINE` macro support
- Import and export as plain-text `.rw` file (Import .rw button, Export .rw button)
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
│  SCAN direction: dashed cyan line (when offset from aim)     │
│  LOOK direction: dashed purple line (when offset from aim)   │
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
| Toggle mute | M |
| Toggle debug mode | D |

**Debug mode** — press **🐛 Debug** (or D) to pause and open the register inspector. The panel has:
- Its own step-control strip: ⏮ Prev / Next ▶ ⏭ with a tick counter (← / → keyboard shortcuts also work)
- A **robot-selector tab bar** — one tab per robot, coloured with that robot's arena colour; click to inspect that robot. Destroyed robots are labelled with ✕.
- A two-column register view for the selected robot:

| Section | Contents |
|---|---|
| Sensors | All 21 read registers for that tick |
| Actuators | Only write registers with non-zero values this tick |
| Variables | Non-zero STORE/RECALL slots; `#DEFINE` names shown if available |
| VM | Program counter (PC) + top 8 stack entries |

Winner text in the controls bar is only shown once the user views the final frame (not pre-populated when frames load).

**Sound effects** (Web Audio API, procedural — no audio files):

| Event | Sound |
|---|---|
| Bullet fired | Short square-wave tone |
| Missile fired | Sawtooth glide + noise burst |
| Drone fired | Sine chorus |
| Triple shot fired | Three simultaneous tones |
| Hit (armor decreased) | Noise burst + low thud |
| Explosion (robot destroyed) | Long noise + deep tones |
| Victory | Ascending C–E–G–C arpeggio |

Sounds only play at speeds ≤ 1×. Mute state persists in `localStorage` under key `robowar_muted`.

**Embedding props** (used by tournament watch mode):

| Prop | Default | Description |
|---|---|---|
| `title` | `'Battle'` | Page title shown in the header |
| `exitLabel` | `'← New Battle'` | Label for the header exit button |
| `onExit` | `navigate('battle-setup')` | Called when the exit button is clicked |
| `skipLabel` | — | If set, shows a secondary button with this label |
| `onSkip` | — | Called when the secondary button is clicked |
| `autoPlay` | `false` | Start playing automatically when frames arrive |
| `autoAdvance` | `false` | Call `onExit` automatically 1.5 s after playback ends naturally |

When `autoAdvance` is true the timer is cancelled if the user manually pauses, steps, or jumps, preserving full manual control.

### 6.6 Tournament Mode

Round-robin only. All matches simulate synchronously on the main thread (no Web Worker). Results include per-match winners and a final standings table sorted by win count.

**Mode toggle** (shown in the setup card before running):

| Mode | Behaviour |
|---|---|
| 📊 Results Only | Pre-simulates all matches and displays standings immediately |
| 👁 Watch Matches | Pre-simulates all matches for standings, then replays each match via the inline Battle Viewer |

**Watch Matches flow:**

1. Select robots, switch to Watch Matches, click **Run Round Robin**
2. All matches are pre-simulated (standings computed); the viewer opens for Match 1 and **begins playing automatically**
3. Page title shows `Tournament — Match N of M: A vs B`
4. When playback finishes, the next match loads and plays automatically after a **1.5 s pause** (so the result banner is visible)
5. Header buttons available during each match:
   - **Skip Match →** — immediately advance to the next match (last match shows **🏆 View Results**)
   - **Skip to Results** — jump directly to the standings screen at any time
6. After all matches complete (or on skip), the standings and match results tables are shown with a **← New Tournament** button

The viewer's standard controls (pause, step, speed, mute) remain fully functional during watch mode — the user can pause, scrub, or change speed freely; the auto-advance timer is cancelled whenever the user interacts manually.

**v2 (not yet implemented):** Single elimination, double elimination, server-side simulation for large brackets.

### 6.7 Leaderboard

- Displays all saved robots sorted by ELO rating (default 1200), with win-margin (W−L) as a tiebreaker
- **Run Rated Matches** button simulates every pairwise match and updates ELO (K=32) and W/L/D records
- ELO persists in `localStorage` under key `robowar_elo`; W/L/D persists under key `robowar_wld`
- Columns: rank, robot name, weapon type, HP cost, W, L, D, ELO

---

## 7. Networking & Backend

### 7.1 Authentication (implemented — v0.6)

Users register with a **username and password** (minimum 6 characters). Passwords are hashed with **bcrypt** (salt rounds: 10). On successful login or registration the server issues a **JWT** (signed with `HS256`, 30-day expiry). The token is stored in `localStorage` under key `robowar_token`; the username under `robowar_user`.

Guest mode is fully supported — users who have not logged in continue to use `localStorage` for robot storage and can use all battle/tournament features. A nudge banner on the My Robots page encourages guests to create an account.

### 7.2 API Endpoints (implemented)

All endpoints are served at `/api/*` by the Express process; Nginx proxies them from the public HTTPS URL.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create account; returns `{ token, username }` |
| `POST` | `/api/auth/login` | None | Authenticate; returns `{ token, username }` |
| `GET` | `/api/robots` | Bearer JWT | List all robots for authenticated user |
| `PUT` | `/api/robots/:id` | Bearer JWT | Upsert (create or update) a robot |
| `DELETE` | `/api/robots/:id` | Bearer JWT | Delete a robot |

Request bodies and responses use JSON. Auth-required endpoints return `401` if no token is provided or the token is invalid/expired.

### 7.3 Robot Storage Strategy

| User state | Read source | Write destination |
|---|---|---|
| Guest (not logged in) | `localStorage` | `localStorage` |
| Logged in | REST API (`GET /api/robots`) | REST API + `localStorage` |

The editor writes to both `localStorage` and the API when logged in, ensuring offline resilience and server persistence simultaneously.

### 7.4 Robot Sharing

**v1:** Export and import as `.rw` plain-text files. Both operations are available from the Robot Editor toolbar and from the My Robots list.

**v2 (planned):** Share link — `robowar.morroweb.com/robots/:id` — view-only page with read-only editor and battle button.

### 7.5 Multiplayer & Spectating (v2 — planned)

Online matchmaking, persistent leaderboards, and real-time battle spectating are deferred to a future version. The v2 backend is expected to add Socket.io for live frame streaming and server-side battle simulation for large tournaments.

## 8. Data Formats

### 8.1 Robot Definition (JSON — localStorage and server API)

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

## 9. Test Case Structure

The project uses **Playwright** for all testing. Tests are co-located under `tests/` and run against a live Vite dev server.

### 9.1 Framework & Configuration

| Setting | Value |
|---|---|
| Framework | `@playwright/test` v1.60 |
| Browser | Chromium (Desktop Chrome preset) |
| Base URL | `http://localhost:5173` |
| Parallelism | Fully parallel (5 workers locally, 1 in CI) |
| Retries | 0 locally, 2 in CI |
| Web server | `npm run dev` — auto-started by Playwright; reused if already running |
| Config file | `playwright.config.js` |

Run the suite: `npm test` (or `./node_modules/.bin/playwright test`)

### 9.2 File Layout

```
tests/
├── helpers.js              — shared utilities (loadApp, resetApp, seedRobots, …)
├── auth.spec.js            — login/register modal, nav auth state, error cases
├── navigation.spec.js      — splash page, credits, nav bar, page routing
├── robots.spec.js          — My Robots list (CRUD, display)
├── editor.spec.js          — Robot Editor (hardware panel, code editor, save/compile)
├── battle.spec.js          — Battle Setup + Battle Viewer (controls, speed buttons, stats)
├── tournament.spec.js      — Tournament mode (selection, round-robin, standings)
├── leaderboard.spec.js     — Leaderboard (ELO display, rated matches)
└── engine/
    ├── compiler.spec.js    — Compiler unit tests (opcodes, labels, #DEFINE, errors)
    ├── vm.spec.js          — VM unit tests (stack ops, registers, control flow)
    └── combat.spec.js      — Combat engine unit tests (physics, weapons, damage)
```

### 9.3 Test Counts (~298 total)

| File | Tests | Coverage area |
|---|---|---|
| `auth.spec.js` | 23 | Login/register modal, nav auth state, nudge banner, error cases |
| `navigation.spec.js` | 24 | Splash page, credits, dismiss flow, nav routing, Docs link |
| `battle.spec.js` | 29 | Battle setup UI, viewer controls, speed buttons, robot stats, mute button |
| `editor.spec.js` | 22 | Hardware panel, code editor, save/compile, error display |
| `engine/compiler.spec.js` | 98 | All opcodes, labels, #DEFINE macros, error cases, v0.5 instructions |
| `engine/vm.spec.js` | 107 | Stack operations, arithmetic, control flow, registers, trig, interrupts |
| `engine/combat.spec.js` | 37 | Spawn, physics, projectiles, damage, shield, wall sensors, interrupts |
| `leaderboard.spec.js` | 16 | ELO display, rated matches, column layout |
| `tournament.spec.js` | 26 | Robot selection, round-robin, standings, mode toggle, watch mode flow |
| `robots.spec.js` | 12 | Robot list CRUD, color dot, editor navigation |

### 9.4 Shared Helpers (`tests/helpers.js`)

| Helper | Description |
|---|---|
| `loadApp(page)` | Navigate to `/`, dismiss splash, wait for nav bar |
| `resetApp(page)` | Clear localStorage, reload, dismiss splash, wait for nav bar |
| `seedRobots(page, robots)` | Write robot array to localStorage, reload, dismiss splash |
| `navTo(page, label)` | Click a nav button by label text |
| `getRobotNames(page)` | Return text content of all `.robot-name` elements |
| `makeRobot(overrides)` | Return a minimal valid robot definition object |
| `SAMPLE_NAMES` | `['Tracker', 'Evader', 'Sniper', 'WallAvoider', 'DopplerDuelist', 'ReactiveShield']` — the six built-in sample robots |
| `DEFAULT_SENSORS` | Default sensor object used in VM unit tests |

### 9.5 Key Conventions

- **Splash handling** — every test that reloads the page must call `loadApp`, `resetApp`, or `seedRobots` (which all invoke the internal `dismissSplash` helper). Direct `page.waitForSelector('.nav')` calls are not permitted since the nav is hidden behind the splash on every fresh load.
- **UI tests** use `test.beforeEach` to load a clean app state via `loadApp` + `resetApp`. Engine unit tests import modules directly and do not require a browser page.
- **Engine unit tests** (`engine/`) import `compiler.js`, `vm.js`, and `combat.js` directly — no DOM involved. They verify correctness of the stack machine and combat simulation independently of the UI.
- **Timeouts** — canvas and battle-viewer tests use `page.waitForSelector('canvas', { timeout: 15000 })` to allow time for the Web Worker to complete simulation before assertions run.

---

## 10. Open Questions

| # | Question | Status | Decision |
|---|---|---|---|
| 1 | Hardware budget fixed at 30 HP or adjustable per tournament? | **Resolved** | Fixed at 30 HP in v1; per-tournament override is a v2 feature |
| 2 | Damage values — mirror original or rebalance? | **Resolved** | Spec values used as-is; balance tuning deferred to v2 |
| 3 | Drones — autonomous or player-writable velocity? | **Resolved** | Autonomous (stationary); fully programmable drone velocity is v2 |
| 4 | Team communication — shared message register? | **Resolved** | Not implemented in v1; TEAMMATES register is read-only |
| 5 | ELO K-factor and initial rating? | **Resolved** | K=32, 1200 start; stored in localStorage |
| 6 | Tick rate for real-time spectating? | **Deferred** | Not applicable until v2 backend is implemented |
| 7 | Maximum program length? | **Open** | No hard limit in v1; stack capped at 256 entries; bytecode length unconstrained |
| 8 | `.rw` file import in editor? | **Resolved** | Import and export both implemented in v1.1 |
| 9 | Tournament formats beyond round robin? | **Open** | Single and double elimination deferred to v2 |
