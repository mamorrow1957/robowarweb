import React, { useState, useEffect } from 'react';
import { getPublicRobots } from '../apiStorage.js';
import { calcHardwareCost, ROBOT_COLORS } from '../engine/hardware.js';

export default function PublicRobots({ navigate }) {
  const [robots, setRobots] = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    getPublicRobots()
      .then(setRobots)
      .catch(() => setError('Could not load public robots.'));
  }, []);

  if (error) return <p style={{ color: 'var(--text-dim)', padding: 32 }}>{error}</p>;
  if (!robots) return <p style={{ color: 'var(--text-dim)', padding: 32 }}>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Public Robots</h1>
      </div>

      {robots.length === 0 && (
        <p className="empty-state">No robots have been shared yet.</p>
      )}

      <div className="robot-list">
        {robots.map((r, i) => {
          const cost = calcHardwareCost(r.hardware);
          return (
            <div key={r.id} className="robot-row">
              <span
                className="robot-color"
                style={{ background: ROBOT_COLORS[i % ROBOT_COLORS.length] }}
              />
              <span className="robot-name">{r.name}</span>
              <span className="robot-hw" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                by {r.owner} · {r.hardware.weapon} · {cost}/30 HP
              </span>
              <div className="robot-actions">
                <button className="btn small" onClick={() => navigate('shared-robot', { robotId: r.id })}>
                  View
                </button>
                <button
                  className="btn small"
                  onClick={() => navigate('battle-setup', { preselected: [r.id], extraRobots: [r] })}
                >
                  Battle
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
