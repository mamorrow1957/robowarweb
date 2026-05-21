# RoboWar Web

A faithful browser-based recreation of the classic 1989 Macintosh game *RoboWar* by Rod McFarland. Write programs in a stack-based assembly language, build robots with configurable hardware, and watch them battle in a 2D arena.

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

- **Robot editor** — CodeMirror-based editor with syntax highlighting, inline compiler errors, and opcode autocomplete
- **Hardware builder** — spend a 30-point budget across armor, shields, weapons, engine, energy, CPU, cooling, and radar
- **Battle viewer** — Canvas 2D arena with play/pause, step-by-step, and speed controls (1×–Max)
- **Deterministic replays** — battles re-simulate from a seed + robot definitions; share any battle as a link
- **Tournament mode** — round robin, single elimination, or double elimination brackets with ELO ratings
- **Leaderboard** — global ELO rankings with per-weapon filters
- **Robot sharing** — export/import `.rw` text files or share via link; guest mode requires no account

## Programming Language

Robots are programmed in the RoboWar stack language. Key concepts:

| Concept | Description |
|---|---|
| Stack | 32-bit integer stack; all operations push or pop |
| Registers | Named I/O ports — read sensors (`ENERGY`, `RANGE`, `RADAR`, `ARMOR`, …), write actuators (`FIRE`, `SHIELD`, `THRUSTX`, `THRUSTY`, …) |
| Variables | 100 numbered slots (`STORE n` / `RECALL n`) with `#DEFINE` aliases |
| Control flow | `IF / ELSE / ENDIF`, `LOOP / POOL`, `GOTO`, `CALL / RETURN` |
| CPU budget | Hardware-configurable cycles per tick (5–40); programs wrap at end |

See [robowar-spec.md](robowar-spec.md) §3 for the full instruction set and register reference.

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

```
Browser
  Robot Editor (CodeMirror)
  Battle Viewer (Canvas 2D)
  Tournament Browser (React)
        │
  Game Engine (Web Worker)
    Compiler → VM → Combat Engine → Renderer
        │
Backend (Node.js / Express + PostgreSQL)
  Auth · Robot storage · Matchmaking · Leaderboards
```

The VM and combat engine run in a Web Worker to keep the UI responsive during fast-forward and simulation.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, HTML5 Canvas, CodeMirror |
| Game engine | JavaScript (Web Worker) |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Auth | JWT (httpOnly cookie) + optional GitHub OAuth |
| Realtime (v2) | Socket.io |

## Documentation

- [robowar-spec.md](robowar-spec.md) — full game specification covering the language, hardware, combat engine, UI, networking, and data formats

## Status

Early development. See the spec for open design questions before implementation begins.
