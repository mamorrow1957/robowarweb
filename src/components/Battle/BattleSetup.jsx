import React, { useState, useEffect } from 'react';
import { getRobots } from '../../storage.js';
import { getRobotsFromAPI } from '../../apiStorage.js';
import { isLoggedIn } from '../../auth.js';
import { ROBOT_COLORS, calcHardwareCost } from '../../engine/hardware.js';

export default function BattleSetup({ preselected = [], extraRobots = [], navigate }) {
  const [ownRobots, setOwnRobots] = useState([]);

  useEffect(() => {
    async function loadRobots() {
      const local = getRobots();
      if (isLoggedIn()) {
        try {
          const api = await getRobotsFromAPI();
          // Merge API robots with sample robots so logged-in users always have opponents
          const merged = [...api, ...local.filter(lr => !api.find(r => r.id === lr.id))];
          setOwnRobots(merged);
        } catch { setOwnRobots(local); }
      } else {
        setOwnRobots(local);
      }
    }
    loadRobots();
  }, []);

  const robots = [...ownRobots, ...extraRobots.filter(er => !ownRobots.find(r => r.id === er.id))];
  const [selected, setSelected] = useState(new Set(preselected));
  const [arenaSize, setArenaSize] = useState('300');
  const [tickLimit, setTickLimit] = useState('2000');

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startBattle() {
    const dim = parseInt(arenaSize, 10);
    const config = {
      robots: robots
        .filter(r => selected.has(r.id))
        .map(r => ({ ...r })),
      arenaWidth:  dim,
      arenaHeight: dim,
      tickLimit:   parseInt(tickLimit, 10),
      seed: Math.floor(Math.random() * 0xFFFFFF),
    };
    navigate('battle', { config });
  }

  const canStart = selected.size >= 2;

  return (
    <div className="battle-setup">
      <div className="page-header">
        <h1 className="page-title">Battle Setup</h1>
        <button className="btn" onClick={() => navigate('robots')}>← Back</button>
      </div>

      <div className="card">
        <div className="card-title">Select Robots (min 2)</div>
        <div className="robot-selector">
          {robots.map((r, i) => (
            <label
              key={r.id}
              className={`robot-check-row${selected.has(r.id) ? ' selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                style={{ display: 'none' }}
              />
              <span
                className="robot-color"
                style={{ background: ROBOT_COLORS[i % ROBOT_COLORS.length] }}
              />
              <span className="robot-name">{r.name}</span>
              <span className="robot-hw">
                {r.hardware.weapon} · {calcHardwareCost(r.hardware)}/30 HP
              </span>
            </label>
          ))}
          {robots.length === 0 && (
            <p style={{ color: 'var(--text-dim)' }}>
              No robots found. <button className="btn small" onClick={() => navigate('robots')}>Create one</button>
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Options</div>
        <div className="battle-options">
          <div className="option-group">
            <span className="option-label">Arena Size</span>
            <select className="option-select" value={arenaSize} onChange={e => setArenaSize(e.target.value)}>
              <option value="200">Small (200×200)</option>
              <option value="300">Standard (300×300)</option>
              <option value="500">Large (500×500)</option>
            </select>
          </div>
          <div className="option-group">
            <span className="option-label">Tick Limit</span>
            <select className="option-select" value={tickLimit} onChange={e => setTickLimit(e.target.value)}>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="2000">2000</option>
              <option value="5000">5000</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn primary"
          disabled={!canStart}
          onClick={startBattle}
          style={{ fontSize: 15, padding: '10px 28px' }}
        >
          Start Battle ({selected.size} robots)
        </button>
      </div>
    </div>
  );
}
