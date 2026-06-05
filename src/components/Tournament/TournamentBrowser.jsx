import React, { useState } from 'react';
import { getRobots } from '../../storage.js';
import { compile } from '../../engine/compiler.js';
import { CombatEngine } from '../../engine/combat.js';
import { ROBOT_COLORS } from '../../engine/hardware.js';
import BattleViewer from '../Battle/BattleViewer.jsx';

function runMatch(a, b, seed) {
  const robotsWithBytecode = [a, b].map(r => {
    const { bytecode } = compile(r.program || '');
    return { ...r, bytecode };
  });
  const engine = new CombatEngine({
    robots: robotsWithBytecode,
    arenaWidth: 300, arenaHeight: 300,
    tickLimit: 2000, seed,
  });
  const { result } = engine.simulate();
  return result;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Round Robin ───────────────────────────────────────────────────────────────

function roundRobinRun(robots, includeConfigs) {
  const results = [];
  const wins = {};
  const matchConfigs = [];
  robots.forEach(r => { wins[r.id] = 0; });

  let seed = 0x1234;
  for (let i = 0; i < robots.length; i++) {
    for (let j = i + 1; j < robots.length; j++) {
      const matchSeed = seed++;
      const result = runMatch(robots[i], robots[j], matchSeed);
      results.push({
        a: robots[i].name, b: robots[j].name,
        winner: result.winnerName, reason: result.reason,
      });
      if (result.winnerId) wins[result.winnerId] = (wins[result.winnerId] || 0) + 1;
      if (includeConfigs) {
        matchConfigs.push({
          robots: [robots[i], robots[j]],
          arenaWidth: 300, arenaHeight: 300, tickLimit: 2000, seed: matchSeed,
        });
      }
    }
  }

  const standings = robots
    .map(r => ({ name: r.name, id: r.id, wins: wins[r.id] || 0 }))
    .sort((a, b) => b.wins - a.wins);

  return { results, standings, matchConfigs, type: 'round-robin' };
}

// ── Double Elimination ────────────────────────────────────────────────────────

function doubleElimRun(robots, includeConfigs) {
  let wb = [...robots];  // winners bracket — 0 losses
  let lb = [];           // losers bracket  — 1 loss
  const results = [];
  const matchConfigs = [];
  const eliminated = []; // accumulated in elimination order (earliest first)
  let seed = 0xDE00;
  let roundNum = 0;
  const maxRounds = robots.length * 4; // safety guard against infinite loop

  /** Run one pass of paired matches on `pool`; odd robot gets a bye. */
  function play(pool, roundLabel) {
    const advancing = [];
    const dropping = [];
    for (let i = 0; i + 1 < pool.length; i += 2) {
      const a = pool[i], b = pool[i + 1];
      const s = seed++;
      const res = runMatch(a, b, s);
      const winner = res.winnerId === a.id ? a : res.winnerId === b.id ? b : a;
      const loser  = winner === a ? b : a;
      results.push({ round: roundLabel, a: a.name, b: b.name, winner: res.winnerName, reason: res.reason });
      if (includeConfigs) {
        matchConfigs.push({ robots: [a, b], arenaWidth: 300, arenaHeight: 300, tickLimit: 2000, seed: s });
      }
      advancing.push(winner);
      dropping.push(loser);
    }
    if (pool.length % 2 === 1) advancing.push(pool[pool.length - 1]); // bye
    return { advancing, dropping };
  }

  // Main bracket loop: alternate WB and LB rounds until only one robot remains
  // in each bracket (which becomes the Grand Final match-up).
  while ((wb.length > 1 || lb.length > 1) && roundNum < maxRounds) {
    roundNum++;

    // Winners bracket round
    if (wb.length >= 2) {
      const { advancing, dropping } = play(wb, `WB Round ${roundNum}`);
      wb = advancing;
      lb = [...lb, ...dropping]; // WB losers drop into the losers bracket
    }

    // Losers bracket round — eliminates robots with their second loss
    if (lb.length >= 2) {
      const { advancing, dropping: elim } = play(lb, `LB Round ${roundNum}`);
      lb = advancing;
      eliminated.push(...elim);
    }
  }

  // Grand Final: WB survivor (0 losses) vs LB survivor (1 loss).
  // If the LB winner wins, both have 1 loss → bracket reset (play again).
  let champion = null;
  let runnerUp  = null;

  if (wb.length === 1 && lb.length === 1) {
    const s1 = seed++;
    const gfRes = runMatch(wb[0], lb[0], s1);
    results.push({ round: 'Grand Final', a: wb[0].name, b: lb[0].name, winner: gfRes.winnerName, reason: gfRes.reason });
    if (includeConfigs) {
      matchConfigs.push({ robots: [wb[0], lb[0]], arenaWidth: 300, arenaHeight: 300, tickLimit: 2000, seed: s1 });
    }

    const gfWinner = gfRes.winnerId === wb[0].id ? wb[0]
                   : gfRes.winnerId === lb[0].id ? lb[0] : wb[0];

    if (gfWinner === lb[0]) {
      // Bracket reset — WB winner now also has 1 loss; both on equal footing
      const s2 = seed++;
      const resetRes = runMatch(wb[0], lb[0], s2);
      results.push({ round: 'Grand Final (Reset)', a: wb[0].name, b: lb[0].name, winner: resetRes.winnerName, reason: resetRes.reason });
      if (includeConfigs) {
        matchConfigs.push({ robots: [wb[0], lb[0]], arenaWidth: 300, arenaHeight: 300, tickLimit: 2000, seed: s2 });
      }
      champion = resetRes.winnerId === wb[0].id ? wb[0] : lb[0];
      runnerUp  = champion === wb[0] ? lb[0] : wb[0];
    } else {
      // WB winner took the title without a reset
      champion = gfWinner;
      runnerUp  = lb[0];
    }
  } else if (wb.length === 1) {
    // No LB survivors (edge case: ≤1 robot entered LB the whole tournament)
    champion = wb[0];
  }

  // Build standings: 1st = champion, 2nd = runner-up, then latest-eliminated → earliest
  const placements = [];
  if (champion) placements.push(champion);
  if (runnerUp)  placements.push(runnerUp);
  for (let i = eliminated.length - 1; i >= 0; i--) placements.push(eliminated[i]);

  const standings = placements.map((r, i) => ({ id: r.id, name: r.name, place: i + 1 }));

  return { results, standings, matchConfigs, type: 'double-elim' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TournamentBrowser({ navigate }) {
  const robots = getRobots();
  const [selected, setSelected]         = useState(new Set());
  const [tournResult, setTournResult]   = useState(null);
  const [running, setRunning]           = useState(false);
  const [format, setFormat]             = useState('round-robin'); // 'round-robin' | 'double-elim'
  const [mode, setMode]                 = useState('results');     // 'results' | 'watch'
  const [phase, setPhase]               = useState('setup');       // 'setup' | 'watching' | 'done'
  const [matchConfigs, setMatchConfigs] = useState([]);
  const [matchIndex, setMatchIndex]     = useState(0);

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function runTournament() {
    const participants = robots.filter(r => selected.has(r.id));
    if (participants.length < 2) return;
    setRunning(true);
    setTournResult(null);
    setPhase('setup');

    setTimeout(() => {
      const includeConfigs = mode === 'watch';
      const res = format === 'double-elim'
        ? doubleElimRun(participants, includeConfigs)
        : roundRobinRun(participants, includeConfigs);

      setTournResult(res);
      if (mode === 'watch') {
        setMatchConfigs(res.matchConfigs);
        setMatchIndex(0);
        setRunning(false);
        setPhase('watching');
      } else {
        setRunning(false);
        setPhase('done');
      }
    }, 0);
  }

  function handleMatchExit() {
    if (matchIndex < matchConfigs.length - 1) {
      setMatchIndex(i => i + 1);
    } else {
      setPhase('done');
    }
  }

  function skipToResults() { setPhase('done'); }

  // ── Watch mode: inline BattleViewer ──────────────────────────────────────
  if (phase === 'watching' && matchConfigs.length > 0) {
    const cfg     = matchConfigs[matchIndex];
    const isLast  = matchIndex === matchConfigs.length - 1;
    const roundLabel = tournResult?.type === 'double-elim'
      ? tournResult.results[matchIndex]?.round
      : null;
    const matchTitle = roundLabel
      ? `${roundLabel}: ${cfg.robots[0].name} vs ${cfg.robots[1].name}`
      : `Match ${matchIndex + 1} of ${matchConfigs.length}: ${cfg.robots[0].name} vs ${cfg.robots[1].name}`;

    return (
      <BattleViewer
        config={cfg}
        navigate={navigate}
        title={`Tournament — ${matchTitle}`}
        exitLabel={isLast ? '🏆 View Results' : 'Next Match →'}
        onExit={handleMatchExit}
        skipLabel="Skip to Results"
        onSkip={skipToResults}
        autoPlay={true}
        autoAdvance={true}
      />
    );
  }

  const runLabel = running ? 'Running…'
    : format === 'double-elim' ? 'Run Double Elimination'
    : 'Run Round Robin';

  // ── Setup + Results layout ────────────────────────────────────────────────
  return (
    <div className="tournament-page">
      <div className="page-header">
        <h1 className="page-title">Tournament</h1>
      </div>

      {phase !== 'done' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Select Robots (min 2)</div>
          <div className="robot-selector">
            {robots.map((r, i) => (
              <label key={r.id} className={`robot-check-row${selected.has(r.id) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  style={{ display: 'none' }}
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <span className="robot-color" style={{ background: ROBOT_COLORS[i % ROBOT_COLORS.length] }} />
                <span className="robot-name">{r.name}</span>
              </label>
            ))}
          </div>

          {/* Format selector */}
          <div className="tourn-mode-row">
            <span className="tourn-mode-label">Format:</span>
            <div className="tourn-mode-toggle">
              <button
                className={`tourn-mode-btn${format === 'round-robin' ? ' active' : ''}`}
                onClick={() => setFormat('round-robin')}
              >
                🔄 Round Robin
              </button>
              <button
                className={`tourn-mode-btn${format === 'double-elim' ? ' active' : ''}`}
                onClick={() => setFormat('double-elim')}
              >
                🏆 Double Elimination
              </button>
            </div>
          </div>

          {/* Mode selector */}
          <div className="tourn-mode-row">
            <span className="tourn-mode-label">Mode:</span>
            <div className="tourn-mode-toggle">
              <button
                className={`tourn-mode-btn${mode === 'results' ? ' active' : ''}`}
                onClick={() => setMode('results')}
              >
                📊 Results Only
              </button>
              <button
                className={`tourn-mode-btn${mode === 'watch' ? ' active' : ''}`}
                onClick={() => setMode('watch')}
              >
                👁 Watch Matches
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              className="btn primary"
              disabled={selected.size < 2 || running}
              onClick={runTournament}
            >
              {runLabel}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && tournResult && (
        <>
          {/* Standings */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              {tournResult.type === 'double-elim' ? '🏆 Final Standings' : 'Standings'}
            </div>
            <table className="lb-table">
              <thead>
                <tr>
                  <th>{tournResult.type === 'double-elim' ? 'Place' : '#'}</th>
                  <th>Robot</th>
                  {tournResult.type === 'round-robin' && <th>Wins</th>}
                </tr>
              </thead>
              <tbody>
                {tournResult.standings.map((s, i) => (
                  <tr key={s.id}>
                    <td style={tournResult.type === 'double-elim' && i === 0 ? { color: 'var(--yellow)', fontWeight: 600 } : {}}>
                      {tournResult.type === 'double-elim' ? ordinal(s.place) : i + 1}
                    </td>
                    <td>{s.name}</td>
                    {tournResult.type === 'round-robin' && <td>{s.wins}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Match results */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              {tournResult.type === 'double-elim' ? 'Bracket Results' : 'Match Results'}
            </div>
            <table className="lb-table">
              <thead>
                <tr>
                  {tournResult.type === 'double-elim' && <th>Round</th>}
                  <th>Robot A</th>
                  <th>Robot B</th>
                  <th>Winner</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {tournResult.results.map((r, i) => (
                  <tr key={i}>
                    {tournResult.type === 'double-elim' && (
                      <td style={{ color: 'var(--text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>{r.round}</td>
                    )}
                    <td>{r.a}</td>
                    <td>{r.b}</td>
                    <td style={{ color: 'var(--green)' }}>{r.winner}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn" onClick={() => { setPhase('setup'); setTournResult(null); }}>
            ← New Tournament
          </button>
        </>
      )}
    </div>
  );
}
