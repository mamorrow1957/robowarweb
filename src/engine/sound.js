/**
 * Procedural sound effects for RoboWar battles.
 * Uses Web Audio API — all synthesis is done in-browser, no audio files.
 *
 * AudioContext autoplay policy (Chrome/Safari/Firefox): the context must be
 * created *and* resumed during or shortly after a user gesture, otherwise it
 * sits in "suspended" state and scheduled events never fire.
 *
 * We handle this two ways:
 *   1. A global capture-phase click/keydown listener unlocks the context on
 *      the very first user interaction anywhere on the page.
 *   2. unlockAudio() is exported so components can call it explicitly from
 *      known user-gesture handlers (Play button, Mute button).
 */

let _ctx = null;
let _muted = false;

try {
  _muted = localStorage.getItem('robowar_muted') === 'true';
} catch { /* ignore */ }

// ── AudioContext unlock ───────────────────────────────────────────────────────

/**
 * Create the AudioContext (if needed) and resume it.
 * Safe to call multiple times; idempotent once running.
 * Must be called from a user-gesture handler for the resume to take effect.
 */
export function unlockAudio() {
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state !== 'running') {
      _ctx.resume();
    }
  } catch { /* ignore */ }
}

/** Global first-interaction unlock — fires on ANY click or keydown. */
function _handleFirstGesture() {
  unlockAudio();
  document.removeEventListener('click',   _handleFirstGesture, true);
  document.removeEventListener('keydown', _handleFirstGesture, true);
}
document.addEventListener('click',   _handleFirstGesture, true);
document.addEventListener('keydown', _handleFirstGesture, true);

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Return the running AudioContext, or null if not yet unlocked. */
function ac() {
  return _ctx && _ctx.state === 'running' ? _ctx : null;
}

/** Short noise burst. */
function playNoise(duration, gainPeak, decay) {
  const a = ac();
  if (!a) return;
  const bufSize = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, bufSize, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, decay);
  }
  const src  = a.createBufferSource();
  src.buffer = buf;
  const gain = a.createGain();
  gain.gain.setValueAtTime(gainPeak, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
  src.connect(gain);
  gain.connect(a.destination);
  src.start();
}

/** Pitched tone with optional frequency glide. */
function playTone(freq, duration, gainPeak, type = 'square', freqEnd = null) {
  const a = ac();
  if (!a) return;
  const osc  = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime);
  if (freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, a.currentTime + duration);
  }
  gain.gain.setValueAtTime(gainPeak, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
  osc.connect(gain);
  gain.connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + duration + 0.01);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getMuted() { return _muted; }

export function setMuted(v) {
  _muted = v;
  try { localStorage.setItem('robowar_muted', String(v)); } catch { /* ignore */ }
}

/** Play a collision scrape — grating noise burst with a low dissonant tone. */
export function playCollision() {
  if (_muted) return;
  try {
    const a = ac();
    if (!a) return;
    // White noise filtered to mid-range: harsh scraping texture
    const bufSize = Math.floor(a.sampleRate * 0.12);
    const buf = a.createBuffer(1, bufSize, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.2);
    }
    const src    = a.createBufferSource();
    src.buffer   = buf;
    const filter = a.createBiquadFilter();
    filter.type            = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value         = 0.8;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.55, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(a.destination);
    src.start();
    // Low dissonant sawtooth underneath
    playTone(55, 0.10, 0.18, 'sawtooth', 40);
    playTone(58, 0.10, 0.12, 'sawtooth', 43);
  } catch { /* ignore */ }
}

/**
 * Play a fire sound.
 * @param {string} weaponType - 'bullet' | 'missile' | 'drone' | 'triple'
 */
export function playFire(weaponType = 'bullet') {
  if (_muted) return;
  try {
    switch (weaponType) {
      case 'missile':
        playTone(280, 0.18, 0.18, 'sawtooth', 120);
        playNoise(0.14, 0.15, 2.5);
        break;
      case 'drone':
        playTone(440, 0.25, 0.08, 'sine');
        playTone(446, 0.25, 0.08, 'sine');
        break;
      case 'triple':
        playTone(900, 0.06, 0.12, 'square', 700);
        playTone(800, 0.05, 0.10, 'square', 650);
        playTone(700, 0.04, 0.08, 'square', 550);
        break;
      default: // bullet
        playTone(750, 0.07, 0.13, 'square', 500);
        break;
    }
  } catch { /* ignore */ }
}

/** Play an impact / hit sound. */
export function playHit() {
  if (_muted) return;
  try {
    playNoise(0.09, 0.28, 3.5);
    playTone(180, 0.07, 0.09, 'sawtooth', 100);
  } catch { /* ignore */ }
}

/** Play an explosion (robot destroyed). */
export function playExplosion() {
  if (_muted) return;
  try {
    playNoise(0.55, 0.55, 1.8);
    playTone(110, 0.35, 0.14, 'sawtooth', 40);
    playTone(65,  0.45, 0.10, 'square',   30);
  } catch { /* ignore */ }
}

/** Play a victory fanfare. */
export function playVictory() {
  if (_muted) return;
  try {
    const a = ac();
    if (!a) return;
    // Ascending arpeggio: C5, E5, G5, C6
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc  = a.createOscillator();
      const gain = a.createGain();
      const t    = a.currentTime + i * 0.13;
      osc.type   = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  } catch { /* ignore */ }
}
