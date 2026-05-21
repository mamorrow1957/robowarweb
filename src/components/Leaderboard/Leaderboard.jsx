import React, { useState } from 'react';
import { getRobots } from '../../storage.js';
import { compile } from '../../engine/compiler.js';
import { CombatEngine } from '../../engine/combat.js';
import { ROBOT_COLORS, calcHardwareCost } from '../../engine/hardware.js';

function updateElo(ra, rb, winnerId, idA, idB, K = 32) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const eb = 1 - ea;
  const sa = winnerId === idA ? 1 : winnerId === idB ? 0 : 0.5;
  const sb = 1 - sa;
  return { newA: Math.round(ra + K * (sa - ea)), newB: Math.round(rb + K * (sb - eb)) };
}

export default function Leaderboard({ navigate }) {
  const storedRobots = getRobots();
  const [ratings, setRatings] = useState(() => {
    const saved = localStorage.getItem('robowar_elo');
    return saved ? JSON.parse(saved) : {};
  });
  const [running, setRunning] = useState(false);

  function getElo(id) { return ratings[id] ?? 1200; }

  function runRatedBattle(a, b) {
    const robots = [a, b].map(r => {
      const { bytecode } = compile(r.program || '');
      return { ...r, bytecode };
    });
    const engine = new CombatEngine({
      robots, arenaWidth: 300, arenaHeight: 300,
      tickLimit: 2000, seed: Math.floor(Math.random() * 0xFFFFFF),
    });
    const { result } = engine.simulate();
    const { newA, newB } = updateElo(getElo(a.id), getElo(b.id), result.winnerId, a.id, b.id);
    return { [a.id]: newA, [b.id]: newB };
  }

  function runAllMatches() {
    if (storedRobots.length < 2) return;
    setRunning(true);
    setTimeout(() => {
      let newRatings = { ...ratings };
      for (let i = 0; i < storedRobots.length; i++) {
        for (let j = i + 1; j < storedRobots.length; j++) {
          const updates = runRatedBattle(storedRobots[i], storedRobots[j]);
          newRatings = { ...newRatings, ...updates };
        }
      }
      setRatings(newRatings);
      localStorage.setItem('robowar_elo', JSON.stringify(newRatings));
      setRunning(false);
    }, 0);
  }

  const ranked = [...storedRobots]
    .map((r, i) => ({ ...r, elo: getElo(r.id), color: ROBOT_COLORS[i % ROBOT_COLORS.length] }))
    .sort((a, b) => b.elo - a.elo);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leaderboard</h1>
        <button className="btn primary" disabled={running || storedRobots.length < 2} onClick={runAllMatches}>
          {running ? 'Running…' : 'Run Rated Matches'}
        </button>
      </div>

      {ranked.length === 0 ? (
        <p className="empty-state">No robots yet.</p>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Robot</th>
              <th>Weapon</th>
              <th>HP cost</th>
              <th>ELO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr key={r.id}>
                <td style={{ color: 'var(--text-dim)' }}>{i + 1}</td>
                <td>
                  <span style={{ display:'inline-flex', alignItems:'center', gap: 8 }}>
                    <span style={{ width:10, height:10, borderRadius:'50%', background: r.color, display:'inline-block' }} />
                    {r.name}
                  </span>
                </td>
                <td>{r.hardware.weapon}</td>
                <td>{calcHardwareCost(r.hardware)}</td>
                <td style={{ fontWeight: 600 }}>{r.elo}</td>
                <td>
                  <button className="btn small" onClick={() => navigate('battle-setup', { preselected: [r.id] })}>
                    Battle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
