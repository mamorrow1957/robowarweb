import React, { useState } from 'react';
import { getRobots, deleteRobot, saveRobot, newRobotId } from '../storage.js';
import { DEFAULT_HARDWARE, ROBOT_COLORS, calcHardwareCost } from '../engine/hardware.js';

export default function MyRobots({ navigate }) {
  const [robots, setRobots] = useState(() => getRobots());

  function handleNew() {
    const robot = {
      id:       newRobotId(),
      name:     'New Robot',
      hardware: { ...DEFAULT_HARDWARE },
      program:  '; Write your program here\nLOOP\n  RADAR AIM\n  1 FIRE\nPOOL\n',
    };
    saveRobot(robot);
    navigate('editor', { robotId: robot.id });
  }

  function handleEdit(id) {
    navigate('editor', { robotId: id });
  }

  function handleDelete(id) {
    if (!window.confirm('Delete this robot?')) return;
    deleteRobot(id);
    setRobots(getRobots());
  }

  function handleBattle(id) {
    navigate('battle-setup', { preselected: [id] });
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Robots</h1>
        <button className="btn primary" onClick={handleNew}>+ New Robot</button>
      </div>
      <div className="robot-list">
        {robots.map((r, i) => (
          <div key={r.id} className="robot-row">
            <span
              className="robot-color"
              style={{ background: ROBOT_COLORS[i % ROBOT_COLORS.length] }}
            />
            <span className="robot-name">{r.name}</span>
            <span className="robot-hw">
              {r.hardware.weapon} · {calcHardwareCost(r.hardware)}/30 HP
            </span>
            <div className="robot-actions">
              <button className="btn small" onClick={() => handleEdit(r.id)}>Edit</button>
              <button className="btn small" onClick={() => handleBattle(r.id)}>Battle</button>
              <button className="btn small danger" onClick={() => handleDelete(r.id)}>Delete</button>
            </div>
          </div>
        ))}
        {robots.length === 0 && (
          <p className="empty-state">No robots yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
