# RoboWar Web

A faithful browser-based recreation of the classic 1989 Macintosh game *RoboWar* by Rod McFarland. Write programs in a stack-based assembly language, build robots with configurable hardware, and watch them battle in a 2D arena.

Vibe coded in May–June 2026 by Michael Morrow using [Claude Code](https://claude.ai/code).

**Live at [robowar.morroweb.com](https://robowar.morroweb.com)**

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

- **User accounts** — register with email verification, log in, and save robots to the server; guest mode fully supported with localStorage fallback
- **Robot sharing** — share any robot via a unique link (`/#robot=ID`); requires login to view; share/unshare from My Robots or the editor
- **Admin panel** — ban/unban users, reset passwords, manage emails, manually verify email, view/delete user robots, delete accounts
- **Password recovery** — email-based reset link flow via Nodemailer
- **Email verification** — new accounts require email verification before login; existing users are grandfathered
- **Account settings** — change password, update recovery email, or permanently delete your account
- **Privacy policy** — at `/privacy-policy.html`; commits to never selling data, no marketing emails, no AI training use
- **Splash page** — intro screen with links to enter the game or open the Programmer's Guide
- **Robot editor** — CodeMirror-based editor with syntax highlighting, opcode autocomplete (Ctrl+Space), inline compiler errors, and a live hardware-point budget counter
- **Robot import/export** — save and load robots as `.rw` plain-text files from the editor or My Robots list
- **Hardware builder** — spend a 30-point budget across armor, shields, weapons, engine, energy, CPU, cooling, and radar
- **Battle viewer** — Canvas 2D arena with play/pause, step-by-step controls, speed modes (10%, 25%, 1×, 5×, 20×, Max), and procedural sound effects (mutable)
- **Deterministic simulation** — battles run entirely in a Web Worker from a seed + robot definitions; identical inputs always produce identical results
- **Tournament mode** — round-robin or double elimination brackets; Results Only or Watch Matches modes
- **Leaderboard** — ELO ratings (K=32, starting at 1200) with W/L/D columns; persisted in localStorage
- **Programmer's Guide** — full HTML reference at `/programmer-guide.html` covering the instruction set, hardware tables, interrupt system, and example programs

## Programming Language

Robots are programmed in the RoboWar stack language:

| Concept | Description |
|---|---|
| Stack | 32-bit integer stack; all operations push or pop |
| Registers | Named I/O ports — read sensors (`ENERGY`, `RANGE`, `RADAR`, `ARMOR`, `DOPPLER`, `TOP`/`BOT`/`LEFT`/`RIGHT`, `DAMAGE`, `ID`, `CHRONON`, …), write actuators (`FIRE`, `SHIELD`, `THRUSTX`, `THRUSTY`, `LOOK`, `SCAN`, …) |
| Variables | 100 numbered slots (`STORE n` / `RECALL n`) with `#DEFINE` aliases |
| Control flow | `IF / ELSE / ENDIF`, `LOOP / POOL`, `GOTO`, `CALL / RETURN` |
| Math | `SQRT`, `DIST`, `SIN`, `COS`, `TAN`, `ARCTAN`, `ARCSIN`, `ARCCOS` — trig in degrees, ×1000 scaled |
| Interrupts | `SETINT name label` / `SETPARAM name value` / `INTON` / `INTOFF` / `RTI` / `FLUSHINT` — 13 interrupt types |
| CPU budget | Hardware-configurable cycles per tick (5–40); programs wrap at end |

See [robowar-spec.md](robowar-spec.md) or the [Programmer's Guide](https://robowar.morroweb.com/programmer-guide.html) for the full reference.

## Architecture

```
Browser (React + Vite)
  ├── Splash Page
  ├── Robot Editor (CodeMirror)
  ├── Battle Viewer (Canvas 2D)
  ├── Tournament Browser
  ├── Leaderboard
  └── Game Engine (Web Worker)
        Compiler → VM Scheduler → Combat Engine
          │
  localStorage (guest robots, ELO ratings, auth token)

          │ HTTPS /api/* (JWT Bearer)
          ▼
Server (Ubuntu / Nginx / Cloudflare)
  ├── Express API (port 3001)
  │     /api/auth/*    — register, login, logout, change password,
  │                       forgot/reset password, verify email,
  │                       resend verification, delete account
  │     /api/robots    — CRUD + share/unshare (per-user, JWT-scoped)
  │     /api/robots/shared/:id — public robot view (auth required)
  │     /api/admin/*   — user management, robot management (admin only)
  └── SQLite (robowar.db)
        users   — accounts, email, email_verified, password hash, admin/ban flags
        robots  — per-user robot definitions, is_public flag
        revoked_tokens — server-side logout blacklist
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, HTML5 Canvas, CodeMirror 6 |
| Game engine | JavaScript (Web Worker) |
| API server | Node.js, Express, better-sqlite3, bcryptjs, jsonwebtoken, nodemailer |
| Build tool | Vite |
| Reverse proxy | Nginx + Cloudflare |
| CI/CD | GitHub Actions + self-hosted runner |
| Tests | Playwright (~350 tests, all passing) |

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWT authentication with server-side revocation on logout
- Rate limiting on all auth endpoints (20 req / 15 min per IP)
- Account lockout after 5 consecutive failed login attempts; admin notified by email and can unlock via the admin panel
- Admin account is never locked — 5 failed admin attempts trigger a password-reset email alert instead
- CORS restricted to `robowar.morroweb.com`
- Password reset and email verification tokens delivered via hash fragment (`/#reset=TOKEN`, `/#verify=TOKEN`) — never logged by the server
- Email addresses unique across accounts; required and verified for all new accounts
- Username validation: 2–32 chars, alphanumeric/underscore/hyphen only
- Shared robots require authentication to view (no anonymous access)
- Privacy policy commits to no data sales, no marketing emails, no AI training use; full text at `/privacy-policy.html`
- Daily SQLite backups with 30-day retention

## Running Locally

```bash
# Frontend
npm install
npm run dev        # http://localhost:5173

# API (in a second terminal)
cd api
npm install
JWT_SECRET=dev node server.js   # http://localhost:3001

# Tests
npm test           # runs the full Playwright suite
```

## CI/CD

Push to `dev` → tests run on GitHub Actions.  
Merge to `main` → tests run, then self-hosted runner deploys to [robowar.morroweb.com](https://robowar.morroweb.com).  
Slack notifications sent to `#deployments` on pass/fail/deploy.

## Documentation

- [robowar-spec.md](robowar-spec.md) — full specification: language reference, hardware system, combat engine, API endpoints, test structure
- [Programmer's Guide](https://robowar.morroweb.com/programmer-guide.html) — in-game reference for robot programmers
- [Privacy Policy](https://robowar.morroweb.com/privacy-policy.html) — data handling commitments
