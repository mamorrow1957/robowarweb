import React, { useState, useEffect } from 'react';
import { getRobotById, saveRobot, newRobotId } from '../../storage.js';
import { DEFAULT_HARDWARE, calcHardwareCost, HARDWARE_BUDGET } from '../../engine/hardware.js';
import { compile } from '../../engine/compiler.js';
import HardwarePanel from './HardwarePanel.jsx';
import ProgramEditor from './ProgramEditor.jsx';

const DEFAULT_PROGRAM =
`; Write your program here
LOOP
  RADAR AIM
  1 FIRE
POOL
`;

export default function RobotEditor({ robotId, navigate }) {
  const [robot, setRobot] = useState(null);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (robotId) {
      const r = getRobotById(robotId);
      setRobot(r || makeNew());
    } else {
      setRobot(makeNew());
    }
  }, [robotId]);

  useEffect(() => {
    if (!robot) return;
    const { errors: errs } = compile(robot.program || '');
    setErrors(errs);
  }, [robot?.program]);

  function makeNew() {
    return {
      id: newRobotId(),
      name: 'New Robot',
      hardware: { ...DEFAULT_HARDWARE },
      program: DEFAULT_PROGRAM,
    };
  }

  function update(patch) {
    setRobot(r => ({ ...r, ...patch }));
    setSaved(false);
  }

  function handleSave() {
    if (!robot) return;
    saveRobot(robot);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleBattle() {
    if (!robot) return;
    saveRobot(robot);
    navigate('battle-setup', { preselected: [robot.id] });
  }

  function handleExport() {
    if (!robot) return;
    const content = [
      `#NAME ${robot.name}`,
      `#HARDWARE ${Object.entries(robot.hardware).map(([k,v]) => `${k}=${v}`).join(' ')}`,
      '#PROGRAM',
      robot.program,
      '#END',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${robot.name.replace(/\s+/g, '_')}.rw`;
    a.click();
  }

  if (!robot) return <div>Loading…</div>;

  const cost = calcHardwareCost(robot.hardware);
  const overBudget = cost > HARDWARE_BUDGET;

  return (
    <div>
      <div className="page-header">
        <input
          className="editor-name"
          value={robot.name}
          onChange={e => update({ name: e.target.value })}
          placeholder="Robot name"
          style={{ maxWidth: 300 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleExport}>Export .rw</button>
          <button
            className="btn"
            onClick={handleBattle}
            disabled={overBudget || errors.length > 0}
          >
            Test Battle
          </button>
          <button
            className="btn primary"
            onClick={handleSave}
            disabled={overBudget}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
          <button className="btn" onClick={() => navigate('robots')}>← Back</button>
        </div>
      </div>

      <div className="editor-layout">
        <HardwarePanel
          hardware={robot.hardware}
          onChange={hw => update({ hardware: hw })}
        />
        <ProgramEditor
          value={robot.program}
          onChange={prog => update({ program: prog })}
          errors={errors}
        />
      </div>
    </div>
  );
}
