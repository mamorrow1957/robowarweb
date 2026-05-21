import React, { useState } from 'react';
import { getRobots } from '../../storage.js';
import { compile } from '../../engine/compiler.js';
import { CombatEngine } from '../../engine/combat.js';
import { ROBOT_COLORS } from '../../engine/hardware.js';

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

export default function TournamentBrowser({ navigate }) {
  const robots = getRobots();
  const [selected, setSelected] = useState(new Set());
  const [tournResult, setTournResult] = useState(null);
  const [running, setRunning] = useState(false);

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
    setTimeout(() => {
      const res = roundRobin(participants);
      setTournResult(res);
      setRunning(false);
    }, 0);
  }

  return (
    <div className="tournament-page">
      <div className="page-header">
        <h1 className="page-title">Tournament</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Select Robots (min 2)</div>
        <div className="robot-selector">
          {robots.map((r, i) => (
            <label key={r.id} className={`robot-check-row${selected.has(r.id) ? ' selected' : ''}`}>
              <input type="checkbox" style={{ display:'none' }} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <span className="robot-color" style={{ background: ROBOT_COLORS[i % ROBOT_COLORS.length] }} />
              <span className="robot-name">{r.name}</span>
            </label>
          ))}
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

      {tournResult && (
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

          <div className="card">
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
        </>
      )}
    </div>
  );
}
