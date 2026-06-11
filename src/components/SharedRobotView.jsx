import React, { useState, useEffect } from 'react';
import { getSharedRobot } from '../apiStorage.js';
import { calcHardwareCost } from '../engine/hardware.js';

export default function SharedRobotView({ robotId, navigate }) {
  const [robot, setRobot] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getSharedRobot(robotId)
      .then(setRobot)
      .catch(() => setError('This robot could not be found or is no longer shared.'));
  }, [robotId]);

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: 'var(--text-dim)' }}>{error}</p>
        <button className="btn" onClick={() => navigate('robots')}>← My Robots</button>
      </div>
    );
  }

  if (!robot) return <div style={{ padding: 32 }}>Loading…</div>;

  const cost = calcHardwareCost(robot.hardware);

  function handleBattle() {
    navigate('battle-setup', { preselected: [robot.id], extraRobots: [robot] });
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/#robot=${robotId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  const hwEntries = Object.entries(robot.hardware)
    .filter(([, v]) => v && v !== 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{robot.name}</h1>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>by {robot.owner} · {cost}/30 HP</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleCopyLink}>{copied ? 'Copied!' : 'Copy Link'}</button>
          <button className="btn primary" onClick={handleBattle}>Battle This Robot</button>
          <button className="btn" onClick={() => navigate('robots')}>← My Robots</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Hardware</div>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: 0 }}>{hwEntries}</p>
      </div>

      <div className="card">
        <div className="card-title">Program</div>
        <pre className="shared-program">{robot.program}</pre>
      </div>
    </div>
  );
}
