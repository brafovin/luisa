'use strict';

/* ------------------------------------------------------------------ *
 *  Kleine Helfer: Mathe, Zufall, Eingabe, Sound
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Winkeldifferenz auf [-PI, PI] normalisieren. */
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Deterministischer PRNG (mulberry32) - gleiche Stadt bei jedem Start. */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Achsenparallele Box-Überschneidung. */
function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* ---------------------------- Eingabe ---------------------------- */

const Input = {
  down: Object.create(null),
  pressed: Object.create(null),
  init() {
    addEventListener('keydown', e => {
      if (e.repeat) { e.preventDefault(); return; }
      const k = e.code;
      this.down[k] = true;
      this.pressed[k] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => { this.down[e.code] = false; });
    addEventListener('blur', () => { this.down = Object.create(null); });
  },
  /** true, solange die Taste gehalten wird. */
  held(...codes) { return codes.some(c => this.down[c]); },
  /** true genau einmal pro Anschlag - der Druck wird dabei verbraucht. */
  hit(...codes) {
    for (const c of codes) if (this.pressed[c]) { delete this.pressed[c]; return true; }
    return false;
  },
  endFrame() { this.pressed = Object.create(null); }
};

/* ----------------------------- Sound ----------------------------- */

const Sfx = {
  ctx: null,
  master: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  /** Kurzer Ton mit Frequenz-Rampe. */
  tone(f0, f1, dur, type = 'square', vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  /** Rauschimpuls - für Crash, Landung, Schritte. */
  noise(dur = 0.2, vol = 0.4, hp = 400) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  jump()    { this.tone(320, 720, 0.16, 'square', 0.28); },
  land()    { this.noise(0.12, 0.3, 250); },
  pickup()  { this.tone(660, 1320, 0.14, 'triangle', 0.4); },
  deliver() { this.tone(520, 780, 0.1, 'triangle', 0.4); setTimeout(() => this.tone(780, 1180, 0.22, 'triangle', 0.4), 110); },
  crash()   { this.noise(0.35, 0.55, 120); this.tone(180, 60, 0.3, 'sawtooth', 0.25); },
  horn()    { this.tone(400, 400, 0.28, 'sawtooth', 0.3); },
  siren()   { this.tone(880, 1250, 0.22, 'sine', 0.22); setTimeout(() => this.tone(1250, 880, 0.22, 'sine', 0.22), 230); },
  wanted()  { this.tone(240, 120, 0.5, 'sawtooth', 0.3); },
  hurt()    { this.tone(200, 90, 0.18, 'square', 0.3); },
  shot()    { this.tone(950, 180, 0.07, 'square', 0.22); this.noise(0.07, 0.3, 900); },
  copshot() { this.tone(700, 150, 0.08, 'sawtooth', 0.16); },
  ricochet(){ this.tone(1600, 500, 0.05, 'triangle', 0.12); },
  explode() { this.noise(0.55, 0.7, 60); this.tone(140, 35, 0.55, 'sawtooth', 0.35); }
};
