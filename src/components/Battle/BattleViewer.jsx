import React, { useState, useEffect, useRef, useCallback } from 'react';
import ArenaCanvas from './ArenaCanvas.jsx';

const SPEEDS = [1, 5, 20, 'max'];

export default function BattleViewer({ config, navigate }) {
  const [frames, setFrames]       = useState([]);
  const [currentTick, setCurrentTick] = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [speed, setSpeed]         = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [result, setResult]       = useState(null);

  const framesRef   = useRef([]);
  const playingRef  = useRef(false);
  const speedRef    = useRef(1);
  const rafRef      = useRef(null);

  // Sync refs
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Load worker
  useEffect(() => {
    if (!config) return;
    setLoading(true);
    setFrames([]);
    setCurrentTick(0);
    setResult(null);
    setError(null);

    const worker = new Worker(
      new URL('../../engine/worker.js', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e) => {
      if (e.data.type === 'BATTLE_COMPLETE') {
        framesRef.current = e.data.frames;
        setFrames(e.data.frames);
        setResult(e.data.result);
        setLoading(false);
      } else if (e.data.type === 'COMPILE_ERROR') {
        setError('Compile error:\n' + e.data.errors.join('\n'));
        setLoading(false);
      } else if (e.data.type === 'ERROR') {
        setError(e.data.message);
        setLoading(false);
      }
    };

    worker.onerror = (e) => { setError(e.message); setLoading(false); };
    worker.postMessage({ type: 'RUN_BATTLE', config });

    return () => worker.terminate();
  }, [config]);

  // Animation loop
  const animate = useCallback(() => {
    if (!playingRef.current) return;
    const total = framesRef.current.length;
    if (!total) return;

    setCurrentTick(prev => {
      const spd = speedRef.current;
      const advance = spd === 'max' ? total : spd;
      const next = Math.min(prev + advance, total - 1);
      if (next >= total - 1) {
        playingRef.current = false;
        setPlaying(false);
      }
      return next;
    });

    if (playingRef.current) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, []);

  function play() {
    if (framesRef.current.length === 0) return;
    if (currentTick >= framesRef.current.length - 1) {
      setCurrentTick(0);
    }
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(animate);
  }

  function pause() {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  function stepBy(delta) {
    pause();
    setCurrentTick(prev =>
      Math.max(0, Math.min(prev + delta, framesRef.current.length - 1))
    );
  }

  function jumpTo(tick) {
    pause();
    setCurrentTick(Math.max(0, Math.min(tick, framesRef.current.length - 1)));
  }

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space')      { e.preventDefault(); playing ? pause() : play(); }
      if (e.code === 'ArrowRight') stepBy(1);
      if (e.code === 'ArrowLeft')  stepBy(-1);
      if (e.key === '1') setSpeed(1);
      if (e.key === '2') setSpeed(5);
      if (e.key === '3') setSpeed(20);
      if (e.key === '4') setSpeed('max');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const frame = frames[currentTick] || null;
  const total = frames.length;

  return (
    <div className="battle-layout">
      <div className="page-header">
        <h1 className="page-title">Battle</h1>
        <button className="btn" onClick={() => navigate('battle-setup')}>← New Battle</button>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>Simulating battle…</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Compiling programs and running {config?.tickLimit || 2000} ticks
          </div>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <pre style={{ color: 'var(--red)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="arena-wrap">
            <ArenaCanvas
              frame={frame}
              arenaWidth={config?.arenaWidth  || 300}
              arenaHeight={config?.arenaHeight || 300}
            />
          </div>

          {/* Controls */}
          <div className="battle-controls">
            <button className="btn" onClick={playing ? pause : play}>
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>
            <button className="btn small" onClick={() => stepBy(-1)} disabled={playing}>◀</button>
            <button className="btn small" onClick={() => stepBy(1)}  disabled={playing}>▶</button>
            <button className="btn small" onClick={() => jumpTo(0)}  disabled={playing}>⏮</button>
            <button className="btn small" onClick={() => jumpTo(total - 1)} disabled={playing}>⏭</button>

            <span className="tick-display">
              {currentTick + 1} / {total} ticks
            </span>

            <div className="speed-btns">
              {SPEEDS.map(s => (
                <button
                  key={s}
                  className={`speed-btn${speed === s ? ' active' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s === 'max' ? 'Max' : `${s}×`}
                </button>
              ))}
            </div>

            {result && (
              <span style={{ marginLeft: 'auto', color: 'var(--green)', fontWeight: 600 }}>
                {result.winnerName
                  ? `${result.winnerName} wins! (${result.reason})`
                  : 'Draw'}
              </span>
            )}
          </div>

          {/* Robot stats */}
          {frame && (
            <div className="robot-stats">
              {frame.robots.map(r => (
                <div key={r.id} className="robot-stat-card">
                  <div className="stat-name" style={{ color: r.color }}>
                    {r.name}
                  </div>
                  {r.alive ? (
                    <>
                      <div className="stat-row">
                        <span className="stat-key">Armor</span>
                        <div className="mini-bar">
                          <div className="mini-fill" style={{ width: `${(r.armor/r.maxArmor)*100}%`, background: '#3fb950' }} />
                        </div>
                        <span style={{ fontSize: 11, width: 28, textAlign: 'right' }}>{Math.round(r.armor)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-key">Energy</span>
                        <div className="mini-bar">
                          <div className="mini-fill" style={{ width: `${(r.energy/r.maxEnergy)*100}%`, background: '#58a6ff' }} />
                        </div>
                        <span style={{ fontSize: 11, width: 28, textAlign: 'right' }}>{Math.round(r.energy)}</span>
                      </div>
                      <div className="stat-row">
                        <span className="stat-key">Heat</span>
                        <div className="mini-bar">
                          <div className="mini-fill" style={{ width: `${(r.heat/r.maxHeat)*100}%`, background: '#d29922' }} />
                        </div>
                        <span style={{ fontSize: 11, width: 28, textAlign: 'right' }}>{Math.round(r.heat)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="destroyed-label">Destroyed at tick {
                      frames.findIndex(f => !f.robots.find(rb => rb.id === r.id)?.alive) + 1
                    }</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
