import React, { useState } from 'react';

const SENSOR_ROWS = [
  ['POSX',       'X pos'],
  ['POSY',       'Y pos'],
  ['SPEEDX',     'Vel X'],
  ['SPEEDY',     'Vel Y'],
  ['ENERGY',     'Energy'],
  ['ARMOR',      'Armor'],
  ['HEAT',       'Heat'],
  ['RADAR',      'Radar°'],
  ['RANGE',      'Range'],
  ['DOPPLER',    'Doppler'],
  ['TOP',        'Top'],
  ['BOT',        'Bottom'],
  ['LEFT',       'Left'],
  ['RIGHT',      'Right'],
  ['COLLISION',  'Collide'],
  ['STUNNED',    'Stunned'],
  ['TEAMMATES',  'Robots'],
  ['DAMAGE',     'Damage'],
  ['RANDOM',     'Random'],
  ['TIME',       'Time'],
  ['ID',         'ID'],
];

const ACTUATOR_LABELS = {
  fire:    'FIRE',
  thrustX: 'THRUSTX',
  thrustY: 'THRUSTY',
  brake:   'BRAKE',
  shield:  'SHIELD',
  aim:     'AIM',
  beep:    'BEEP',
  look:    'LOOK',
  scan:    'SCAN',
};

function isActive(val) {
  return val !== null && val !== 0 && val !== false;
}

function RobotDebugView({ robot }) {
  const d         = robot.debug    || {};
  const sensors   = d.sensors      || {};
  const actuators = d.actuators    || {};
  const vars      = d.vars         || {};
  const varNames  = d.varNames     || {};
  const pc        = d.pc           ?? '?';
  const stack     = d.stack        || [];

  const activeActuators = Object.entries(actuators).filter(([, v]) => isActive(v));
  const definedVars     = Object.entries(vars);

  return (
    <div className="debug-robot-view">

      {/* ── Sensors ── */}
      <div className="debug-columns">
        <div>
          <div className="debug-section-label">Sensors</div>
          <table className="debug-table">
            <tbody>
              {SENSOR_ROWS.map(([key, label]) => (
                <tr key={key}>
                  <td className="debug-key">{label}</td>
                  <td className="debug-val">{sensors[key] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          {/* ── Actuators ── */}
          <div className="debug-section-label">Actuators this tick</div>
          {activeActuators.length === 0 ? (
            <div className="debug-empty">— none written —</div>
          ) : (
            <table className="debug-table">
              <tbody>
                {activeActuators.map(([key, val]) => (
                  <tr key={key}>
                    <td className="debug-key">{ACTUATOR_LABELS[key] || key.toUpperCase()}</td>
                    <td className="debug-val">{String(val)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Variables ── */}
          <div className="debug-section-label" style={{ marginTop: 14 }}>Variables</div>
          {definedVars.length === 0 ? (
            <div className="debug-empty">— none defined —</div>
          ) : (
            <table className="debug-table">
              <tbody>
                {definedVars.map(([slot, val]) => {
                  const name = varNames[slot];
                  return (
                    <tr key={slot}>
                      <td className="debug-key">
                        {name
                          ? <><span className="debug-var-name">{name}</span>{' '}<span className="debug-var-slot">[{slot}]</span></>
                          : `Var ${slot}`}
                      </td>
                      <td className="debug-val">{val}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* ── VM state ── */}
          <div className="debug-section-label" style={{ marginTop: 14 }}>VM state</div>
          <table className="debug-table">
            <tbody>
              <tr>
                <td className="debug-key">PC</td>
                <td className="debug-val">{pc}</td>
              </tr>
              <tr>
                <td className="debug-key">Stack</td>
                <td className="debug-val debug-stack">
                  {stack.length === 0 ? '[]' : `[${stack.join(', ')}]`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function DebugPanel({
  frame,
  currentTick,
  total,
  onStepBack,
  onStepForward,
  onJumpStart,
  onJumpEnd,
}) {
  const [selectedId, setSelectedId] = useState(null);

  if (!frame) return null;

  const robots       = frame.robots;
  const activeId     = selectedId && robots.find(r => r.id === selectedId)
    ? selectedId
    : robots[0]?.id;
  const selectedRobot = robots.find(r => r.id === activeId) || null;

  return (
    <div className="debug-panel">

      {/* ── Header: title + step controls ── */}
      <div className="debug-header">
        <span className="debug-panel-title">🐛 Debug</span>
        <div className="debug-step-btns">
          <button className="btn small" onClick={onJumpStart}    title="Jump to start">⏮</button>
          <button className="btn small" onClick={onStepBack}     title="Previous tick  ←"
            disabled={currentTick === 0}>◀ Prev</button>
          <span className="debug-tick-counter">tick {frame.tick + 1} / {total}</span>
          <button className="btn small" onClick={onStepForward}  title="Next tick  →"
            disabled={currentTick >= total - 1}>Next ▶</button>
          <button className="btn small" onClick={onJumpEnd}      title="Jump to end">⏭</button>
        </div>
      </div>

      {/* ── Robot selector ── */}
      <div className="debug-robot-tabs">
        {robots.map(r => (
          <button
            key={r.id}
            className={`debug-robot-tab${r.id === activeId ? ' active' : ''}`}
            style={r.id === activeId ? { borderBottomColor: r.color, color: r.color } : {}}
            onClick={() => setSelectedId(r.id)}
          >
            {r.name}{!r.alive ? ' ✕' : ''}
          </button>
        ))}
      </div>

      {/* ── Selected robot data ── */}
      {selectedRobot && <RobotDebugView robot={selectedRobot} />}
    </div>
  );
}
