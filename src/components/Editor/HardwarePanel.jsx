import React from 'react';
import { HARDWARE_DEFS, HARDWARE_BUDGET, calcHardwareCost } from '../../engine/hardware.js';

const FIELDS = [
  { key: 'armor',   label: 'Armor',   type: 'levels', max: 4 },
  { key: 'shield',  label: 'Shield',  type: 'levels', max: 3 },
  { key: 'weapon',  label: 'Weapon',  type: 'weapon' },
  { key: 'engine',  label: 'Engine',  type: 'levels', max: 3 },
  { key: 'energy',  label: 'Energy',  type: 'levels', max: 3 },
  { key: 'cpu',     label: 'CPU',     type: 'levels', max: 3 },
  { key: 'cooling', label: 'Cooling', type: 'levels', max: 2 },
  { key: 'radar',   label: 'Radar',   type: 'levels', max: 3 },
];

function levelLabel(key, lvl) {
  const def = HARDWARE_DEFS[key]?.[lvl];
  if (!def) return `Level ${lvl}`;
  const cost = def.cost;
  if (key === 'armor')   return `Lvl ${lvl} — ${def.maxArmor} HP (${cost}pt)`;
  if (key === 'shield')  return lvl === 0 ? 'None' : `Lvl ${lvl} — ${def.multiplier}x dmg (${cost}pt)`;
  if (key === 'engine')  return `Lvl ${lvl} — spd ${def.maxSpeed} (${cost}pt)`;
  if (key === 'energy')  return `Lvl ${lvl} — ${def.maxEnergy} max (${cost}pt)`;
  if (key === 'cpu')     return `Lvl ${lvl} — ${def.cycles} cyc/tick (${cost}pt)`;
  if (key === 'cooling') return `Lvl ${lvl} — ${def.dissipation} heat/tick (${cost}pt)`;
  if (key === 'radar')   return `Lvl ${lvl} — ${def.range} range (${cost}pt)`;
  return `Level ${lvl} (${cost}pt)`;
}

export default function HardwarePanel({ hardware, onChange }) {
  const cost = calcHardwareCost(hardware);
  const remaining = HARDWARE_BUDGET - cost;
  const barPct = Math.min(100, (cost / HARDWARE_BUDGET) * 100);
  const barColor = remaining < 0 ? 'var(--red)' : remaining <= 5 ? 'var(--yellow)' : 'var(--green)';

  function set(key, value) {
    onChange({ ...hardware, [key]: value });
  }

  return (
    <div className="hardware-panel card">
      <div className="card-title">Hardware</div>

      {FIELDS.map(f => (
        <div key={f.key} className="hw-row">
          <span className="hw-label">{f.label}</span>
          {f.type === 'weapon' ? (
            <select
              className="hw-select"
              value={hardware.weapon}
              onChange={e => set('weapon', e.target.value)}
            >
              {Object.keys(HARDWARE_DEFS.weapon).map(w => {
                const d = HARDWARE_DEFS.weapon[w];
                return (
                  <option key={w} value={w}>
                    {w.charAt(0).toUpperCase() + w.slice(1)} ({d.cost}pt)
                  </option>
                );
              })}
            </select>
          ) : (
            <select
              className="hw-select"
              value={hardware[f.key]}
              onChange={e => set(f.key, parseInt(e.target.value, 10))}
            >
              {Array.from({ length: f.max + 1 }, (_, i) => (
                <option key={i} value={i}>{levelLabel(f.key, i)}</option>
              ))}
            </select>
          )}
        </div>
      ))}

      <div className="hp-bar">
        <div className="hp-label">
          {cost} / {HARDWARE_BUDGET} HP used
          {remaining < 0 && <span style={{ color: 'var(--red)' }}> (over budget!)</span>}
        </div>
        <div className="hp-track">
          <div className="hp-fill" style={{ width: `${barPct}%`, background: barColor }} />
        </div>
      </div>
    </div>
  );
}
