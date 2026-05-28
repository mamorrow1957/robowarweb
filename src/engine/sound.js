/**
 * Procedural sound effects for RoboWar battles.
 * Uses Web Audio API — all synthesis is done in-browser, no audio files.
 */

let _ctx = null;
let _muted = false;

try {
  _muted = localStorage.getItem('robowar_muted') === 'true';
} catch { /* ignore */ }

function ctx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume();
  }
  return _ctx;
}

export function getMuted() {
  return _muted;
}

export function setMuted(v) {
  _muted = v;
  try { localStorage.setItem('robowar_muted', String(v)); } catch { /* ignore */ }
}

/** Short noise burst. */
function playNoise(duration, gainPeak, decay) {
  const ac = ctx();
  const bufSize = Math.floor(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, decay);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(gainPeak, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(gain);
  gain.connect(ac.destination);
  src.start();
}

/** Pitched tone with frequency glide. */
function playTone(freq, duration, gainPeak, type = 'square', freqEnd = null) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + duration);
  }
  gain.gain.setValueAtTime(gainPeak, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.01);
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
        playTone(446, 0.25, 0.08, 'sine'); // slight chorus
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
  } catch { /* ignore AudioContext errors */ }
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
    playTone(65, 0.45, 0.10, 'square', 30);
  } catch { /* ignore */ }
}

/** Play a victory fanfare. */
export function playVictory() {
  if (_muted) return;
  try {
    const ac = ctx();
    // Ascending arpeggio: C5, E5, G5, C6
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const t = ac.currentTime + i * 0.13;
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.13, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  } catch { /* ignore */ }
}
