import React from 'react';

// Ordered sensor list — shown in full every tick
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

// Actuators — only shown when non-zero/non-null
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

export default function DebugPanel({ frame }) {
  if (!frame) return null;

  return (
    <div className="debug-panel">
      <div className="debug-panel-title">🐛 Debug — tick {frame.tick}</div>
      <div className="debug-robots">
        {frame.robots.map(r => {
          const d = r.debug || {};
          const sensors   = d.sensors   || {};
          const actuators = d.actuators || {};
          const vars      = d.vars      || {};
          const varNames  = d.varNames  || {};
          const pc        = d.pc ?? '?';
          const stack     = d.stack     || [];

          const activeActuators = Object.entries(actuators)
            .filter(([, v]) => isActive(v));

          const definedVars = Object.entries(vars);

          return (
            <div
              key={r.id}
              className="debug-robot-card"
              style={{ borderTopColor: r.color }}
            >
              <div className="debug-robot-name" style={{ color: r.color }}>
                {r.name}{!r.alive && ' ✕'}
              </div>

              {/* ── Sensors ── */}
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

              {/* ── Actuators ── */}
              <div className="debug-section-label">Actuators</div>
              {activeActuators.length === 0 ? (
                <div className="debug-empty">—</div>
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
              <div className="debug-section-label">Variables</div>
              {definedVars.length === 0 ? (
                <div className="debug-empty">—</div>
              ) : (
                <table className="debug-table">
                  <tbody>
                    {definedVars.map(([slot, val]) => {
                      const name = varNames[slot];
                      return (
                        <tr key={slot}>
                          <td className="debug-key">
                            {name ? <><span className="debug-var-name">{name}</span> <span className="debug-var-slot">[{slot}]</span></> : `Var ${slot}`}
                          </td>
                          <td className="debug-val">{val}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* ── VM state ── */}
              <div className="debug-section-label">VM</div>
              <div className="debug-vm-row">
                <span className="debug-key">PC</span>
                <span className="debug-val">{pc}</span>
              </div>
              <div className="debug-vm-row">
                <span className="debug-key">Stack</span>
                <span className="debug-val debug-stack">
                  {stack.length === 0 ? '[]' : `[${stack.join(', ')}]`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
