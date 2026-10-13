// Web Audio synth: every sound effect and the music are generated, so there
// is nothing to download. The context is created on the first user gesture.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

export function disposeAudio() {
  stopMusic();
  if (ctx) ctx.close();
  ctx = master = sfxBus = musicBus = noiseBuf = null;
}

const now = () => ctx.currentTime;

function tone({ f = 440, f2, type = 'sine', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, bus = sfxBus, curve = 'exp' }) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const t0 = now() + t;
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    else o.frequency.linearRampToValueAtTime(f2, t0 + dur);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(bus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ t = 0, dur = 0.2, vol = 0.3, type = 'bandpass', f = 1200, f2, q = 1, bus = sfxBus }) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  const g = ctx.createGain();
  const t0 = now() + t;
  filt.frequency.setValueAtTime(f, t0);
  if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(filt).connect(g).connect(bus);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

let pizzaStreak = 0;
let lastPizza = 0;

export const sfx = {
  click: () => tone({ f: 900, f2: 1200, type: 'triangle', dur: 0.06, vol: 0.15 }),
  start: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.07, dur: 0.22, vol: 0.2 }));
  },
  jump: () => tone({ f: 260, f2: 520, type: 'square', dur: 0.12, vol: 0.07 }),
  doubleJump: () => {
    tone({ f: 420, f2: 900, type: 'triangle', dur: 0.18, vol: 0.12 });
    noise({ dur: 0.25, vol: 0.08, f: 3000, f2: 800, q: 0.7 });
  },
  land: impact => noise({ dur: 0.08 + Math.min(0.1, impact / 200), vol: 0.06 + Math.min(0.12, impact / 150), type: 'lowpass', f: 600 }),
  slide: () => noise({ dur: 0.45, vol: 0.1, f: 1400, f2: 500, q: 0.6 }),
  pizza: () => {
    const t = performance.now();
    pizzaStreak = t - lastPizza < 450 ? Math.min(pizzaStreak + 1, 12) : 0;
    lastPizza = t;
    const f = 660 * Math.pow(2, (pizzaStreak % 13) / 12);
    tone({ f, type: 'sine', dur: 0.12, vol: 0.13 });
    tone({ f: f * 2, type: 'sine', dur: 0.08, vol: 0.05, t: 0.02 });
  },
  throw: () => noise({ dur: 0.18, vol: 0.12, f: 900, f2: 2600, q: 1.4 }),
  canHit: () => {
    tone({ f: 180, f2: 60, type: 'sine', dur: 0.22, vol: 0.45 });
    noise({ dur: 0.5, vol: 0.18, type: 'highpass', f: 4000, f2: 1500, q: 0.5 });
    tone({ f: 1800, f2: 1300, type: 'triangle', dur: 0.08, vol: 0.06, t: 0.01 });
  },
  canMiss: () => tone({ f: 2200, f2: 1700, type: 'triangle', dur: 0.08, vol: 0.06 }),
  takedown: () => {
    noise({ dur: 0.35, vol: 0.18, type: 'lowpass', f: 900, f2: 200 });
    tone({ f: 900, f2: 300, type: 'sawtooth', dur: 0.3, vol: 0.05, t: 0.05 });
  },
  closeCall: () => {
    noise({ dur: 0.3, vol: 0.12, f: 600, f2: 3000, q: 1.2 });
    tone({ f: 1320, type: 'sine', dur: 0.18, vol: 0.1, t: 0.08 });
  },
  combo: n => [0, 4, 7, 12].forEach((s, i) => tone({ f: 523 * Math.pow(2, (s + Math.min(n, 20)) / 12), type: 'triangle', t: i * 0.05, dur: 0.16, vol: 0.12 })),
  stumble: () => {
    tone({ f: 220, f2: 110, type: 'square', dur: 0.2, vol: 0.1 });
    noise({ dur: 0.2, vol: 0.15, type: 'lowpass', f: 500 });
  },
  scrape: () => noise({ dur: 0.18, vol: 0.06, f: 2500, q: 2 }),
  bonk: () => tone({ f: 140, f2: 70, type: 'square', dur: 0.15, vol: 0.12 }),
  death: () => {
    noise({ dur: 0.6, vol: 0.25, type: 'lowpass', f: 1200, f2: 150 });
    [392, 370, 349, 262].forEach((f, i) => tone({ f, f2: i === 3 ? 200 : f, type: 'sawtooth', t: 0.25 + i * 0.22, dur: i === 3 ? 0.6 : 0.2, vol: 0.06, curve: 'lin' }));
  },
  restock: () => {
    noise({ dur: 0.15, vol: 0.15, type: 'lowpass', f: 400 });
    [0, 1, 2].forEach(i => tone({ f: 1046 + i * 262, type: 'triangle', t: 0.12 + i * 0.06, dur: 0.1, vol: 0.1 }));
  },
  noCans: () => tone({ f: 200, type: 'square', dur: 0.1, vol: 0.06 }),
  powerup: () => [0, 4, 7, 11, 14].forEach((s, i) => tone({ f: 660 * Math.pow(2, s / 12), type: 'sine', t: i * 0.04, dur: 0.2, vol: 0.1 })),
  shieldBreak: () => noise({ dur: 0.4, vol: 0.2, type: 'highpass', f: 2500, f2: 800 }),
  bell: () => {
    tone({ f: 2093, type: 'sine', dur: 0.35, vol: 0.06 });
    tone({ f: 2637, type: 'sine', dur: 0.3, vol: 0.04, t: 0.01 });
    tone({ f: 2093, type: 'sine', dur: 0.35, vol: 0.05, t: 0.16 });
  },
  bounce: () => tone({ f: 180, f2: 720, type: 'sine', dur: 0.35, vol: 0.2 }),
  crumble: () => noise({ dur: 0.3, vol: 0.1, type: 'lowpass', f: 700, f2: 200 }),
  stage: () => [0, 7, 12, 16].forEach((s, i) => tone({ f: 392 * Math.pow(2, s / 12), type: 'triangle', t: i * 0.1, dur: 0.4, vol: 0.1 })),
};

// --------------------------------------------------------------- music
// Lo-fi loop at 90 BPM. Layers come in as `intensity` (0..1) rises.
const BPM = 90;
const STEP16 = 60 / BPM / 4;
const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 65], // G7
];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
let timer = null;
let step = 0;
let nextT = 0;
let intensity = 0;
let musicOn = false;

export function setIntensity(v) {
  intensity = Math.max(0, Math.min(1, v));
}

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  step = 0;
  nextT = now() + 0.1;
  timer = setInterval(schedule, 25);
}

export function stopMusic() {
  musicOn = false;
  if (timer) clearInterval(timer);
  timer = null;
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.32);
}
function hit(t, f, dur, vol, type = 'highpass') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl).connect(g).connect(musicBus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}
function note(t, f, dur, vol, type = 'triangle', cutoff = 1800) {
  const o = ctx.createOscillator();
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = cutoff;
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = (Math.random() - 0.5) * 12;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(fl).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function schedule() {
  if (!ctx || !musicOn) return;
  while (nextT < now() + 0.12) {
    const t = nextT;
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar];
    const swing = s16 % 2 ? STEP16 * 0.18 : 0;
    // chords: soft rhodes stabs
    if (s16 === 0 || s16 === 10) chord.forEach(n => note(t, midi(n), 1.2, 0.035, 'sine', 1400));
    // hats always (quiet), busier with intensity
    if (s16 % 2 === 0 || (intensity > 0.5 && s16 % 2)) hit(t + swing, 7000, 0.04, s16 % 4 === 2 ? 0.05 : 0.03);
    if (intensity > 0.15 && (s16 === 0 || s16 === 7 || s16 === 10)) kick(t);
    if (intensity > 0.3 && (s16 === 4 || s16 === 12)) hit(t, 1800, 0.18, 0.16, 'bandpass');
    if (intensity > 0.45 && (s16 === 0 || s16 === 6 || s16 === 10)) note(t, midi(chord[0] - 24), 0.35, 0.12, 'sawtooth', 500);
    if (intensity > 0.7 && s16 % 2 === 0) note(t + swing, midi(chord[(s16 / 2) % 4] + 12), 0.14, 0.03, 'square', 2600);
    nextT += STEP16;
    step++;
  }
}
