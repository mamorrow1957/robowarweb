import React, { useState, useEffect, useRef } from 'react';
import { getRobotById, saveRobot, newRobotId } from "../../storage.js";
import { saveRobotToAPI } from "../../apiStorage.js";
import { isLoggedIn } from "../../auth.js";
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

  // Return null if the file doesn't look like a .rw robot file at all
  if (!foundProgram) return null;

  // Strip trailing blank lines from program
  while (programLines.length && programLines[programLines.length - 1].trim() === '') {
    programLines.pop();
  }

  return { name, hardware, program: programLines.join('\n') };
}

export default function RobotEditor({ robotId, navigate }) {
  const [robot, setRobot] = useState(null);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const importRef = useRef(null);

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

  async function handleSave() {
    if (!robot) return;
    saveRobot(robot);
    if (isLoggedIn()) await saveRobotToAPI(robot);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function handleBattle() {
    if (!robot) return;
    saveRobot(robot);
    if (isLoggedIn()) await saveRobotToAPI(robot);
    navigate('battle-setup', { preselected: [robot.id] });
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
      update({ name: parsed.name, hardware: parsed.hardware, program: parsed.program });
    };
    reader.onerror = () => alert('Failed to read file.');
    reader.readAsText(file);
    e.target.value = ''; // allow re-import of same file
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
          <input
            ref={importRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button className="btn" onClick={handleImportClick}>Import .rw</button>
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
