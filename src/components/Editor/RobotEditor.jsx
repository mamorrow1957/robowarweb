import React, { useState, useEffect, useRef } from 'react';
import { getRobotById, saveRobot, newRobotId } from "../../storage.js";
import { saveRobotToAPI, getRobotsFromAPI, setRobotShared } from "../../apiStorage.js";
import { isLoggedIn } from "../../auth.js";
import { DEFAULT_HARDWARE, calcHardwareCost, HARDWARE_BUDGET } from '../../engine/hardware.js';
import { compile, parseHardwareDirectives } from '../../engine/compiler.js';
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

export default function RobotEditor({ robotId, navigate }) {
  const [robot, setRobot]               = useState(null);
  const [errors, setErrors]             = useState([]);
  const [saved, setSaved]               = useState(false);
  const [isPublic, setIsPublic]         = useState(false);
  const [shareMsg, setShareMsg]         = useState('');
  const [hasHwDirectives, setHasHwDirectives] = useState(false);
  const importRef = useRef(null);

  useEffect(() => {
    if (robotId) {
      const r = getRobotById(robotId);
      setRobot(r || makeNew());
    } else {
      setRobot(makeNew());
    }
    // Fetch is_public from API if logged in
    if (robotId && isLoggedIn()) {
      getRobotsFromAPI().then(list => {
        const found = list.find(r => r.id === robotId);
        if (found) setIsPublic(!!found.is_public);
      }).catch(() => {});
    }
  }, [robotId]);

  useEffect(() => {
    if (!robot) return;
    const { errors: errs } = compile(robot.program || '');
    setErrors(errs);

    const hwOverrides = parseHardwareDirectives(robot.program || '');
    setHasHwDirectives(!!hwOverrides);
    if (hwOverrides) {
      setRobot(r => {
        const merged = { ...r.hardware, ...hwOverrides };
        if (JSON.stringify(merged) === JSON.stringify(r.hardware)) return r;
        return { ...r, hardware: merged };
      });
    }
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

  async function handleShare() {
    if (!robot || !isLoggedIn()) return;
    const sharing = !isPublic;
    await setRobotShared(robot.id, sharing);
    setIsPublic(sharing);
    if (sharing) {
      const url = `${window.location.origin}/#robot=${robot.id}`;
      navigator.clipboard.writeText(url).catch(() => {});
      setShareMsg('Link copied!');
      setTimeout(() => setShareMsg(''), 2000);
    }
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
    e.target.value = '';
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={importRef} type="file" accept=".rw" style={{ display: 'none' }} onChange={handleImportFile} />
          <button className="btn" onClick={handleImportClick}>Import .rw</button>
          <button className="btn" onClick={handleExport}>Export .rw</button>
          {isLoggedIn() && robotId && (
            <button className="btn" onClick={handleShare}>
              {shareMsg || (isPublic ? 'Unshare' : 'Share')}
            </button>
          )}
          {isLoggedIn() && robotId && isPublic && !shareMsg && (
            <button className="btn" onClick={() => {
              const url = `${window.location.origin}/#robot=${robot.id}`;
              navigator.clipboard.writeText(url).catch(() => {});
              setShareMsg('Copied!');
              setTimeout(() => setShareMsg(''), 2000);
            }}>Copy Link</button>
          )}
          <button className="btn" onClick={handleBattle} disabled={overBudget || errors.length > 0}>Test Battle</button>
          <button className="btn primary" onClick={handleSave} disabled={overBudget}>
            {saved ? 'Saved!' : 'Save'}
          </button>
          <button className="btn" onClick={() => navigate('robots')}>← Back</button>
        </div>
      </div>

      <div className="editor-layout">
        <HardwarePanel
          hardware={robot.hardware}
          onChange={hw => update({ hardware: hw })}
          controlled={hasHwDirectives}
        />
        <ProgramEditor value={robot.program} onChange={prog => update({ program: prog })} errors={errors} />
      </div>
    </div>
  );
}
