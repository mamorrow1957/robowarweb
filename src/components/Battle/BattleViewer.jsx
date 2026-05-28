import React, { useState, useEffect, useRef, useCallback } from 'react';
import ArenaCanvas from './ArenaCanvas.jsx';
import {
  getMuted, setMuted as soundSetMuted, unlockAudio,
  playFire, playHit, playExplosion, playVictory,
} from '../../engine/sound.js';

const SPEEDS = [0.1, 0.25, 1, 5, 20, 'max'];

export default function BattleViewer({
  config,
  navigate,
  title        = 'Battle',
  exitLabel    = '← New Battle',
  onExit       = null,
  skipLabel    = null,
  onSkip       = null,
  autoPlay     = false,   // start playing as soon as frames arrive
  autoAdvance  = false,   // call onExit automatically 1.5 s after battle ends
}) {
  const [frames, setFrames]           = useState([]);
  const [currentTick, setCurrentTick] = useState(0);
  const [playing, setPlaying]         = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [result, setResult]           = useState(null);
  const [muted, setMuted]             = useState(() => getMuted());

  const framesRef          = useRef([]);
  const playingRef         = useRef(false);
  const speedRef           = useRef(1);
  const rafRef             = useRef(null);
  const accumRef           = useRef(0);
  const prevFrameRef       = useRef(null);
  const lastFireRef        = useRef(0);
  const naturalEndRef      = useRef(false);   // true when playback reached last frame on its own
  const autoAdvanceTimer   = useRef(null);
  const onExitRef          = useRef(onExit);  // always up-to-date, avoids stale closure
  onExitRef.current = onExit;

  // Sync speed ref
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Cancel any pending auto-advance and reset the natural-end flag. */
  function cancelAutoAdvance() {
    naturalEndRef.current = false;
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }

  // ── Animation loop ────────────────────────────────────────────────────────

  const animate = useCallback(() => {
    if (!playingRef.current) return;
    const total = framesRef.current.length;
    if (!total) return;

    setCurrentTick(prev => {
      const spd = speedRef.current;
      let advance;
      if (spd === 'max') {
        advance = total;
      } else if (spd < 1) {
        accumRef.current += spd;
        advance = Math.floor(accumRef.current);
        accumRef.current -= advance;
      } else {
        advance = spd;
      }
      if (advance === 0) return prev;
      const next = Math.min(prev + advance, total - 1);
      if (next >= total - 1) {
        playingRef.current = false;
        setPlaying(false);
        naturalEndRef.current = true; // battle finished playing naturally
      }
      return next;
    });

    if (playingRef.current) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, []);

  // ── Auto-advance: schedule onExit after natural playback end ─────────────

  useEffect(() => {
    if (!playing && naturalEndRef.current && autoAdvance && onExitRef.current) {
      naturalEndRef.current = false;
      autoAdvanceTimer.current = setTimeout(() => {
        autoAdvanceTimer.current = null;
        onExitRef.current?.();
      }, 1500);
    }
  }, [playing, autoAdvance]);

  // ── Playback controls ─────────────────────────────────────────────────────

  function play() {
    if (framesRef.current.length === 0) return;
    unlockAudio(); // ensure AudioContext is running after this user gesture
    cancelAutoAdvance();
    if (currentTick >= framesRef.current.length - 1) {
      setCurrentTick(0);
    }
    accumRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(animate);
  }

  function pause() {
    cancelAutoAdvance();
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  function stepBy(delta) {
    cancelAutoAdvance();
    pause();
    setCurrentTick(prev =>
      Math.max(0, Math.min(prev + delta, framesRef.current.length - 1))
    );
  }

  function jumpTo(tick) {
    cancelAutoAdvance();
    pause();
    setCurrentTick(Math.max(0, Math.min(tick, framesRef.current.length - 1)));
  }

  function toggleMute() {
    unlockAudio(); // clicking mute is also a valid gesture to unlock audio
    const next = !muted;
    setMuted(next);
    soundSetMuted(next);
  }

  // ── Load worker ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!config) return;
    cancelAutoAdvance();
    setLoading(true);
    setFrames([]);
    setCurrentTick(0);
    setResult(null);
    setError(null);
    prevFrameRef.current = null;

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
        // Auto-play: start playback shortly after frames arrive
        if (autoPlay && e.data.frames.length > 0) {
          setTimeout(() => {
            if (framesRef.current.length > 0) {
              accumRef.current = 0;
              naturalEndRef.current = false;
              playingRef.current = true;
              setPlaying(true);
              rafRef.current = requestAnimationFrame(animate);
            }
          }, 100);
        }
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
  }, [config, autoPlay, animate]);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAutoAdvance();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space')      { e.preventDefault(); playing ? pause() : play(); }
      if (e.code === 'ArrowRight') stepBy(1);
      if (e.code === 'ArrowLeft')  stepBy(-1);
      if (e.key === '1') setSpeed(0.1);
      if (e.key === '2') setSpeed(0.25);
      if (e.key === '3') setSpeed(1);
      if (e.key === '4') setSpeed(5);
      if (e.key === '5') setSpeed(20);
      if (e.key === '6') setSpeed('max');
      if (e.key === 'm') toggleMute();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, muted]);

  // ── Sound detection ───────────────────────────────────────────────────────

  const frame = frames[currentTick] || null;

  useEffect(() => {
    const spd = speedRef.current;
    if (!frame || spd === 'max' || spd > 1) {
      prevFrameRef.current = frame;
      return;
    }

    const prev = prevFrameRef.current;
    if (prev) {
      // Fire: new alive projectiles appeared
      const prevCount = prev.projectiles.filter(p => p.alive).length;
      const curCount  = frame.projectiles.filter(p => p.alive).length;
      if (curCount > prevCount) {
        const now = Date.now();
        if (now - lastFireRef.current > 180) {
          const newProj = frame.projectiles.find(p => p.alive);
          playFire(newProj?.type || 'bullet');
          lastFireRef.current = now;
        }
      }

      // Hit: any alive robot lost armor
      let hitPlayed = false;
      for (const robot of frame.robots) {
        if (!robot.alive) continue;
        const prevRobot = prev.robots.find(r => r.id === robot.id);
        if (prevRobot && prevRobot.alive && robot.armor < prevRobot.armor - 0.5) {
          if (!hitPlayed) { playHit(); hitPlayed = true; }
        }
      }

      // Explosion: robot went alive → dead
      for (const robot of frame.robots) {
        if (robot.alive) continue;
        const prevRobot = prev.robots.find(r => r.id === robot.id);
        if (prevRobot?.alive) playExplosion();
      }

      // Victory: result appeared for first time
      if (frame.result && !prev.result) playVictory();
    }

    prevFrameRef.current = frame;
  }, [frame]);

  // ── Render ────────────────────────────────────────────────────────────────

  const total = frames.length;
  const handleExit = onExit || (() => navigate('battle-setup'));

  return (
    <div className="battle-layout">
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {skipLabel && onSkip && (
            <button className="btn" onClick={onSkip}>{skipLabel}</button>
          )}
          <button className="btn" onClick={handleExit}>{exitLabel}</button>
        </div>
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
                  {s === 'max' ? 'Max' : s < 1 ? `${Math.round(s * 100)}%` : `${s}×`}
                </button>
              ))}
            </div>

            <button
              className={`mute-btn${muted ? ' muted' : ''}`}
              onClick={toggleMute}
              title={muted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {muted ? '🔇' : '🔊'}
            </button>

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
