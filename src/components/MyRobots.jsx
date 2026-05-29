import React, { useState, useRef } from 'react';
import { getRobots, deleteRobot, saveRobot, newRobotId } from '../storage.js';
import { DEFAULT_HARDWARE, ROBOT_COLORS, calcHardwareCost } from '../engine/hardware.js';

function parseRwFile(text) {
  // Normalise line endings (CRLF → LF)
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let name = 'Imported Robot';
  let hardware = { ...DEFAULT_HARDWARE };
  let programLines = [];
  let inProgram = false;
  let foundProgram = false;

  for (const line of lines) {
    if (line.startsWith('#NAME ')) {
      name = line.slice(6).trim();
    } else if (line.startsWith('#HARDWARE ')) {
      const parts = line.slice(10).trim().split(/\s+/);
      for (const part of parts) {
        const [k, v] = part.split('=');
        if (k && v !== undefined) {
          hardware[k] = isNaN(v) ? v : parseInt(v, 10);
        }
      }
    } else if (line.startsWith('#PROGRAM')) {
      inProgram = true;
      foundProgram = true;
    } else if (line.startsWith('#END')) {
      inProgram = false;
    } else if (inProgram) {
      programLines.push(line);
    }
  }

  if (!foundProgram) return null;

  while (programLines.length && programLines[programLines.length - 1].trim() === '') {
    programLines.pop();
  }

  return { name, hardware, program: programLines.join('\n') };
}

export default function MyRobots({ navigate }) {
  const [robots, setRobots] = useState(() => getRobots());
  const importRef = useRef(null);

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

  function handleImportClick() {
    importRef.current?.click();
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseRwFile(ev.target.result);
      if (!parsed) {
        alert('Could not parse file — make sure it is a valid .rw robot file.');
        return;
      }
      const robot = { id: newRobotId(), ...parsed };
      saveRobot(robot);
      setRobots(getRobots());
      navigate('editor', { robotId: robot.id });
    };
    reader.onerror = () => alert('Failed to read file.');
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Robots</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={importRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button className="btn" onClick={handleImportClick}>Import .rw</button>
          <button className="btn primary" onClick={handleNew}>+ New Robot</button>
        </div>
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
