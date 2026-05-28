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

/** Round-robin: returns standings + per-match results. */
function roundRobin(robots) {
  const results = [];
  const wins = {};
  robots.forEach(r => { wins[r.id] = 0; });

  let seed = 0x1234;
  for (let i = 0; i < robots.length; i++) {
    for (let j = i + 1; j < robots.length; j++) {
      const result = runMatch(robots[i], robots[j], seed++);
      results.push({ a: robots[i].name, b: robots[j].name, winner: result.winnerName, reason: result.reason });
      if (result.winnerId) wins[result.winnerId] = (wins[result.winnerId] || 0) + 1;
    }
  }

  const standings = robots
    .map(r => ({ name: r.name, id: r.id, wins: wins[r.id] || 0 }))
    .sort((a, b) => b.wins - a.wins);

  return { results, standings };
}

/** Round-robin with match configs for watch mode. */
function roundRobinWithConfigs(robots) {
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
        a: robots[i].name,
        b: robots[j].name,
        winner: result.winnerName,
        reason: result.reason,
      });
      if (result.winnerId) wins[result.winnerId] = (wins[result.winnerId] || 0) + 1;
      // Store config so BattleViewer can re-simulate for animation
      matchConfigs.push({
        robots: [robots[i], robots[j]],
        arenaWidth: 300,
        arenaHeight: 300,
        tickLimit: 2000,
        seed: matchSeed,
      });
    }
  }

  const standings = robots
    .map(r => ({ name: r.name, id: r.id, wins: wins[r.id] || 0 }))
    .sort((a, b) => b.wins - a.wins);

  return { results, standings, matchConfigs };
}

export default function TournamentBrowser({ navigate }) {
  const robots = getRobots();
  const [selected, setSelected]       = useState(new Set());
  const [tournResult, setTournResult] = useState(null);
  const [running, setRunning]         = useState(false);
  const [mode, setMode]               = useState('results'); // 'results' | 'watch'
  const [phase, setPhase]             = useState('setup');  // 'setup' | 'watching' | 'done'
  const [matchConfigs, setMatchConfigs] = useState([]);
  const [matchIndex, setMatchIndex]   = useState(0);

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
      if (mode === 'watch') {
        const { results, standings, matchConfigs: cfgs } = roundRobinWithConfigs(participants);
        setTournResult({ results, standings });
        setMatchConfigs(cfgs);
        setMatchIndex(0);
        setRunning(false);
        setPhase('watching');
      } else {
        const res = roundRobin(participants);
        setTournResult(res);
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

  function skipToResults() {
    setPhase('done');
  }

  // ── Watch mode: inline BattleViewer ──────────────────────────────────────
  if (phase === 'watching' && matchConfigs.length > 0) {
    const cfg = matchConfigs[matchIndex];
    const isLast = matchIndex === matchConfigs.length - 1;
    const matchTitle = `Match ${matchIndex + 1} of ${matchConfigs.length}: ${cfg.robots[0].name} vs ${cfg.robots[1].name}`;

    return (
      <BattleViewer
        config={cfg}
        navigate={navigate}
        title={`Tournament — ${matchTitle}`}
        exitLabel={isLast ? '🏆 View Results' : `Next Match (${matchIndex + 2}/${matchConfigs.length}) →`}
        onExit={handleMatchExit}
        skipLabel="Skip to Results"
        onSkip={skipToResults}
      />
    );
  }

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

          {/* Mode toggle */}
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
              {running ? 'Running…' : 'Run Round Robin'}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && tournResult && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Standings</div>
            <table className="lb-table">
              <thead>
                <tr><th>#</th><th>Robot</th><th>Wins</th></tr>
              </thead>
              <tbody>
                {tournResult.standings.map((s, i) => (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td>{s.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Match Results</div>
            <table className="lb-table">
              <thead>
                <tr><th>Robot A</th><th>Robot B</th><th>Winner</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {tournResult.results.map((r, i) => (
                  <tr key={i}>
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
