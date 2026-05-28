# RoboWar Web

A faithful browser-based recreation of the classic 1989 Macintosh game *RoboWar* by Rod McFarland. Write programs in a stack-based assembly language, build robots with configurable hardware, and watch them battle in a 2D arena.

Vibe coded in May 2026 by Michael Morrow using [Claude Code](https://claude.ai/code).

## What is RoboWar?

RoboWar is a programming game. You don't control your robot in real time — you write a program that runs autonomously during each battle. Programs execute on a stack machine (similar to Forth): push values, read sensor registers, write actuator registers, and use control flow to react to the arena.

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

## Features

- **Splash page** — intro screen with links to enter the game or open the Programmer's Guide
- **Robot editor** — CodeMirror-based editor with syntax highlighting, opcode autocomplete (Ctrl+Space), inline compiler errors, and a live hardware-point budget counter
- **Robot import/export** — save and load robots as `.rw` plain-text files from the editor or My Robots list
- **Hardware builder** — spend a 30-point budget across armor, shields, weapons, engine, energy, CPU, cooling, and radar
- **Battle viewer** — Canvas 2D arena with play/pause, step-by-step controls, speed modes (10%, 25%, 1×, 5×, 20×, Max), and procedural sound effects (mutable)
- **Deterministic simulation** — battles run entirely in a Web Worker from a seed + robot definitions; identical inputs always produce identical results
- **Tournament mode** — round-robin brackets with two modes: Results Only (instant standings) or Watch Matches (replay each match via the battle viewer with Next Match / Skip controls)
- **Leaderboard** — ELO ratings (K=32, starting at 1200) with W/L/D columns updated by running rated matches; persisted in localStorage
- **Programmer's Guide** — full HTML reference at `/programmer-guide.html` covering the instruction set, hardware tables, interrupt system, and example programs; accessible from the nav bar and splash page

## Programming Language

Robots are programmed in the RoboWar stack language. Key concepts:

| Concept | Description |
|---|---|
| Stack | 32-bit integer stack; all operations push or pop |
| Registers | Named I/O ports — read sensors (`ENERGY`, `RANGE`, `RADAR`, `ARMOR`, `DOPPLER`, `TOP`/`BOT`/`LEFT`/`RIGHT`, `DAMAGE`, `ID`, `CHRONON`, …), write actuators (`FIRE`, `SHIELD`, `THRUSTX`, `THRUSTY`, `LOOK`, `SCAN`, …) |
| Variables | 100 numbered slots (`STORE n` / `RECALL n`) with `#DEFINE` aliases |
| Control flow | `IF / ELSE / ENDIF`, `LOOP / POOL`, `GOTO`, `CALL / RETURN` |
| Math | `SQRT`, `DIST`, `SIN`, `COS`, `TAN`, `ARCTAN`, `ARCSIN`, `ARCCOS` — trig in degrees, ×1000 scaled |
| Interrupts | `SETINT name label` / `SETPARAM name value` / `INTON` / `INTOFF` / `RTI` / `FLUSHINT` — event-driven handlers for 13 interrupt types |
| CPU budget | Hardware-configurable cycles per tick (5–40); programs wrap at end |

**New in v0.5 — key additions:**
- `DOPPLER` — radial velocity of nearest enemy in `AIM+LOOK` direction (positive = approaching); use to lead shots
- `LOOK` / `SCAN` — decouple the DOPPLER scan direction and RADAR/RANGE scan direction from the gun aim angle
- `TOP`, `BOT`, `LEFT`, `RIGHT` — distances to the four arena walls
- `DAMAGE` — cumulative damage received; `ID` — robot's 0-based index; `CHRONON` — tick counter alias
- Full interrupt system: react to wall proximity, enemy detection, damage events, and more without polling

See [robowar-spec.md](robowar-spec.md) §3 for the full instruction set and register reference, or download the [Programmer's Guide PDF](public/RoboWar-Programmer-Guide.pdf).

## Hardware System

Each robot has a **30 hardware-point budget** split across eight components:

| Component | Controls |
|---|---|
| Armor | Hit points (15–100) |
| Shield | Damage reduction at an energy cost (0.75× / 0.50× / 0.30×) |
| Weapon | Bullet, Missile, Drone, or Triple Shot |
| Engine | Max speed and acceleration |
| Energy | Max energy pool and recharge rate |
| CPU | VM cycles per tick |
| Cooling | Heat dissipation rate |
| Radar | Detection range (200–999) and cone angle (60°–360°) |

## Architecture

All game logic runs entirely in the browser — no backend required.

```
Browser
  ├── Splash Page (React)
  ├── Robot Editor (CodeMirror + React)
  ├── Battle Viewer (Canvas 2D + React)
  ├── Tournament Browser (React)
  └── Leaderboard (React)
          │
  Game Engine (Web Worker)
    Compiler → VM Scheduler → Combat Engine
          │
  localStorage
    Robot definitions · ELO ratings
```

The VM and combat engine run in a Web Worker to keep the UI responsive during fast-forward and simulation.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, HTML5 Canvas, CodeMirror 6 |
| Game engine | JavaScript (Web Worker) |
| Storage | localStorage (robot definitions, ELO ratings) |
| Build tool | Vite |
| Tests | Playwright (371 tests, all passing) |

## Documentation

- [robowar-spec.md](robowar-spec.md) — full game specification: language reference, hardware system, combat engine, UI, data formats, and test structure
- [RoboWar-Programmer-Guide.pdf](public/RoboWar-Programmer-Guide.pdf) — printable quick-reference guide for robot programmers

## Running Locally

```bash
npm install
npm run dev        # starts dev server at http://localhost:5173
npm test           # runs the full Playwright test suite (371 tests)
```

## Status

v1.1 complete. All core features are implemented and tested.

**New in v1.1:**
- Robot `.rw` file import in editor and My Robots list
- Three new sample robots: WallAvoider, DopplerDuelist, ReactiveShield
- Visual SCAN/LOOK direction indicators in the arena (dashed cyan/purple lines)
- W/L/D columns on the leaderboard
- Opcode and register autocomplete in the code editor (Ctrl+Space)
- SIGNAL interrupt triggered by writing non-zero to `BEEP`
- Full HTML Programmer's Guide at `/programmer-guide.html`

Planned v2 additions include a Node.js/Express backend for online multiplayer, persistent leaderboards, and robot sharing via link.
