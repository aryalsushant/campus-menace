// Web Audio synth: every sound effect and the whole soundtrack are generated
// in the browser, so there is nothing to download. The context is created on
// the first user gesture (browsers block audio before that).

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let reverbIn = null;
let musicFilter = null;
let duck = null;
let noiseBuf = null;
let ambient = null;
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
  comp.threshold.value = -12;
  comp.knee.value = 8;
  comp.ratio.value = 3.5;
  master.connect(comp).connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // a generated room: decaying stereo noise as the impulse response
  const len = ctx.sampleRate * 2.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.32;
  reverbIn = ctx.createGain();
  reverbIn.connect(verb).connect(verbOut).connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.85;
  sfxBus.connect(master);

  // music: a filter that opens with intensity, and a ducking stage the kick pumps
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.36;
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 2400;
  musicFilter.Q.value = 0.7;
  duck = ctx.createGain();
  duck.connect(musicFilter).connect(musicBus).connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.35;
  musicBus.connect(send).connect(reverbIn);

  startAmbience();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

export function disposeAudio() {
  stopMusic();
  if (ctx) ctx.close();
  ctx = master = sfxBus = musicBus = noiseBuf = reverbIn = musicFilter = duck = ambient = null;
}

const now = () => ctx.currentTime;

function out(pan = 0, wet = 0) {
  // per-sound output: optional stereo pan and reverb send
  const g = ctx.createGain();
  let node = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    node = p;
  }
  node.connect(sfxBus);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    node.connect(s).connect(reverbIn);
  }
  return g;
}

function tone({ f = 440, f2, type = 'sine', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, curve = 'exp', pan = 0, wet = 0, dest }) {
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
  o.connect(g).connect(dest || out(pan, wet));
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise({ t = 0, dur = 0.2, vol = 0.3, type = 'bandpass', f = 1200, f2, q = 1, pan = 0, wet = 0, attack = 0.002, dest }) {
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
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(filt).connect(g).connect(dest || out(pan, wet));
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.03);
}

let pizzaStreak = 0;
let lastPizza = 0;
let lastStep = 0;

export const sfx = {
  click: () => tone({ f: 900, f2: 1200, type: 'triangle', dur: 0.06, vol: 0.15 }),
  start: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'triangle', t: i * 0.06, dur: 0.3, vol: 0.16, wet: 0.4 }));
    noise({ dur: 0.6, vol: 0.12, type: 'highpass', f: 800, f2: 6000, attack: 0.4 });
  },
  step: pan => {
    const t = performance.now();
    if (t - lastStep < 120) return;
    lastStep = t;
    noise({ dur: 0.07, vol: 0.05, type: 'lowpass', f: 380 + Math.random() * 120, pan });
    tone({ f: 85 + Math.random() * 15, f2: 55, dur: 0.06, vol: 0.06, pan });
  },
  jump: () => {
    tone({ f: 240, f2: 560, type: 'square', dur: 0.12, vol: 0.05 });
    noise({ dur: 0.15, vol: 0.06, f: 900, f2: 2400, q: 0.8 });
  },
  doubleJump: () => {
    tone({ f: 420, f2: 1100, type: 'triangle', dur: 0.22, vol: 0.12, wet: 0.3 });
    noise({ dur: 0.35, vol: 0.1, f: 3000, f2: 700, q: 0.7, wet: 0.2 });
  },
  land: impact => {
    noise({ dur: 0.09 + Math.min(0.12, impact / 200), vol: 0.07 + Math.min(0.14, impact / 140), type: 'lowpass', f: 520 });
    tone({ f: 90, f2: 45, dur: 0.12, vol: Math.min(0.25, impact / 90) });
  },
  slide: () => noise({ dur: 0.5, vol: 0.12, f: 1600, f2: 450, q: 0.6 }),
  pizza: () => {
    const t = performance.now();
    pizzaStreak = t - lastPizza < 450 ? Math.min(pizzaStreak + 1, 14) : 0;
    lastPizza = t;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
    const f = 660 * Math.pow(2, scale[pizzaStreak] / 12);
    tone({ f, type: 'sine', dur: 0.14, vol: 0.12, wet: 0.25 });
    tone({ f: f * 2, type: 'triangle', dur: 0.08, vol: 0.04, t: 0.015 });
  },
  throw: () => noise({ dur: 0.2, vol: 0.14, f: 700, f2: 3200, q: 1.6 }),
  canHit: pan => {
    // metallic clank (inharmonic partials) + thump + fizz spray
    [1, 2.76, 5.4, 8.9].forEach((k, i) => tone({ f: 520 * k, type: 'sine', dur: 0.25 - i * 0.04, vol: 0.09 / (i + 1), pan }));
    tone({ f: 170, f2: 55, type: 'sine', dur: 0.25, vol: 0.5, pan });
    noise({ dur: 0.7, vol: 0.2, type: 'highpass', f: 5000, f2: 1800, q: 0.4, pan, wet: 0.25, attack: 0.02 });
  },
  canMiss: () => {
    tone({ f: 2300, f2: 1800, type: 'triangle', dur: 0.08, vol: 0.06 });
    tone({ f: 1500, type: 'sine', dur: 0.06, vol: 0.03, t: 0.09 });
  },
  takedown: pan => {
    noise({ dur: 0.4, vol: 0.2, type: 'lowpass', f: 1100, f2: 180, pan });
    tone({ f: 700, f2: 180, type: 'sawtooth', dur: 0.32, vol: 0.05, t: 0.04, pan });
    [0.12, 0.25].forEach(t => noise({ t, dur: 0.08, vol: 0.12, type: 'bandpass', f: 2500, q: 3, pan }));
  },
  whoosh: pan => noise({ dur: 0.45, vol: 0.18, f: 400, f2: 2800, q: 1.4, pan, attack: 0.15 }),
  closeCall: pan => {
    noise({ dur: 0.4, vol: 0.16, f: 500, f2: 3200, q: 1.2, pan, attack: 0.12 });
    tone({ f: 1320, type: 'sine', dur: 0.2, vol: 0.09, t: 0.1, wet: 0.3 });
    tone({ f: 1760, type: 'sine', dur: 0.2, vol: 0.06, t: 0.16, wet: 0.3 });
  },
  combo: n => [0, 4, 7, 12, 16].forEach((s, i) => tone({ f: 523 * Math.pow(2, (s + Math.min(n, 20)) / 12), type: 'triangle', t: i * 0.045, dur: 0.18, vol: 0.11, wet: 0.35 })),
  stumble: () => {
    tone({ f: 220, f2: 100, type: 'square', dur: 0.22, vol: 0.09 });
    noise({ dur: 0.22, vol: 0.18, type: 'lowpass', f: 600 });
  },
  scrape: () => noise({ dur: 0.2, vol: 0.07, f: 2600, q: 2 }),
  bonk: () => tone({ f: 140, f2: 60, type: 'square', dur: 0.16, vol: 0.12 }),
  honk: pan => {
    // goose: nasal formant-filtered saw, twice
    for (const t of [0, 0.22]) {
      const o = ctx && ctx.createOscillator();
      if (!o) return;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 3;
      const g = ctx.createGain();
      const t0 = now() + t;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(430, t0);
      o.frequency.linearRampToValueAtTime(330, t0 + 0.16);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
      o.connect(f).connect(g).connect(out(pan, 0.2));
      o.start(t0);
      o.stop(t0 + 0.2);
    }
  },
  death: () => {
    noise({ dur: 0.7, vol: 0.28, type: 'lowpass', f: 1400, f2: 120 });
    tone({ f: 120, f2: 40, dur: 0.5, vol: 0.4 });
    [392, 370, 349, 262].forEach((f, i) => tone({ f, f2: i === 3 ? 196 : f, type: 'sawtooth', t: 0.3 + i * 0.22, dur: i === 3 ? 0.7 : 0.2, vol: 0.05, curve: 'lin', wet: 0.3 }));
  },
  restock: () => {
    noise({ dur: 0.15, vol: 0.16, type: 'lowpass', f: 400 });
    [0, 1, 2, 3].forEach(i => tone({ f: 1046 * Math.pow(2, (i * 4) / 12), type: 'triangle', t: 0.12 + i * 0.05, dur: 0.12, vol: 0.09, wet: 0.3 }));
  },
  noCans: () => tone({ f: 200, type: 'square', dur: 0.1, vol: 0.06 }),
  powerup: () => {
    [0, 4, 7, 11, 14, 19].forEach((s, i) => tone({ f: 660 * Math.pow(2, s / 12), type: 'sine', t: i * 0.04, dur: 0.24, vol: 0.09, wet: 0.4 }));
    noise({ dur: 0.5, vol: 0.08, type: 'highpass', f: 3000, f2: 9000, attack: 0.2 });
  },
  golden: () => [0, 7, 12, 16, 19, 24].forEach((st, i) => tone({ f: 784 * Math.pow(2, st / 12), type: 'triangle', t: i * 0.035, dur: 0.3, vol: 0.09, wet: 0.45 })),
  record: () => [0, 4, 7, 12, 7, 12, 16].forEach((st, i) => tone({ f: 523 * Math.pow(2, st / 12), type: 'square', t: i * 0.09, dur: 0.2, vol: 0.06, wet: 0.35 })),
  shieldBreak: () => noise({ dur: 0.45, vol: 0.22, type: 'highpass', f: 2600, f2: 700, wet: 0.3 }),
  bell: pan => {
    tone({ f: 2093, type: 'sine', dur: 0.4, vol: 0.06, pan, wet: 0.25 });
    tone({ f: 2637, type: 'sine', dur: 0.32, vol: 0.035, t: 0.01, pan });
    tone({ f: 2093, type: 'sine', dur: 0.4, vol: 0.05, t: 0.16, pan, wet: 0.25 });
  },
  bounce: () => tone({ f: 160, f2: 820, type: 'sine', dur: 0.4, vol: 0.22, wet: 0.2 }),
  crumble: () => noise({ dur: 0.35, vol: 0.12, type: 'lowpass', f: 800, f2: 160 }),
  stage: () => {
    [0, 7, 12, 16, 19].forEach((s, i) => tone({ f: 392 * Math.pow(2, s / 12), type: 'triangle', t: i * 0.1, dur: 0.5, vol: 0.09, wet: 0.5 }));
    sweep();
  },
};

// ------------------------------------------------------------- ambience
// wind that rises with speed, birdsong by day
function startAmbience() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 500;
  f.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master);
  src.start();
  ambient = { f, g, nextBird: 0 };
}

export function setAmbience({ speed = 0, day = 1, playing = false }) {
  if (!ctx || !ambient) return;
  const k = playing ? Math.min(1, Math.max(0, (speed - 8) / 18)) : 0.15;
  ambient.g.gain.setTargetAtTime(0.015 + k * 0.07, now(), 0.4);
  ambient.f.frequency.setTargetAtTime(350 + k * 900, now(), 0.4);
  if (day > 0.4 && now() > ambient.nextBird) {
    ambient.nextBird = now() + 2 + Math.random() * 5;
    const base = 2600 + Math.random() * 1400;
    const pan = Math.random() * 2 - 1;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone({ f: base, f2: base * (1.2 + Math.random() * 0.3), dur: 0.08, vol: 0.025 * day, t: i * 0.11, pan, wet: 0.4 });
  }
}

// ---------------------------------------------------------------- music
// 108 BPM, A minor. Layers come in as `intensity` (0..1) rises.
const BPM = 108;
const STEP16 = 60 / BPM / 4;
const CHORDS = [
  [57, 60, 64, 67], // Am7
  [53, 57, 60, 64], // Fmaj7
  [48, 52, 55, 59], // Cmaj7
  [55, 59, 62, 65], // G7
];
const BASS = [45, 41, 36, 43];
// a two-bar hook (step index → midi note), A minor pentatonic
const HOOK = { 0: 76, 3: 74, 6: 72, 8: 69, 10: 72, 14: 74, 16: 76, 19: 79, 22: 76, 24: 74, 26: 72, 28: 69 };
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
let timer = null;
let step = 0;
let nextT = 0;
let intensity = 0;
let musicOn = false;

export function setIntensity(v) {
  intensity = Math.max(0, Math.min(1, v));
  if (musicFilter) musicFilter.frequency.setTargetAtTime(1600 + intensity * 7000, now(), 1.5);
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

// filter sweep riser for stage changes
function sweep() {
  if (!musicFilter) return;
  const t = now();
  musicFilter.frequency.cancelScheduledValues(t);
  musicFilter.frequency.setValueAtTime(400, t);
  musicFilter.frequency.exponentialRampToValueAtTime(9000, t + 2.2);
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(155, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.36);
  // click
  hit(t, 3500, 0.012, 0.18, 'highpass', musicBus);
  // pump everything else
  duck.gain.cancelScheduledValues(t);
  duck.gain.setValueAtTime(0.35, t);
  duck.gain.linearRampToValueAtTime(1, t + 0.22);
}
function hit(t, f, dur, vol, type = 'highpass', dest = duck) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(fl).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}
function snare(t) {
  hit(t, 1900, 0.2, 0.28, 'bandpass', musicBus);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.14);
}
function clap(t) {
  for (const d of [0, 0.012, 0.024]) hit(t + d, 1400, 0.09, 0.14, 'bandpass', musicBus);
}
function note(t, f, dur, vol, type = 'triangle', cutoff = 1800, detune = 8) {
  const o = ctx.createOscillator();
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = cutoff;
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = (Math.random() - 0.5) * detune;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(fl).connect(g).connect(duck);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function pad(t, chord, dur) {
  for (const n of chord) {
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = 900 + intensity * 900;
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      o.detune.value = det;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.4);
      g.gain.setValueAtTime(0.012, t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(fl).connect(g).connect(duck);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}
function pluck(t, f) {
  // pluck with a dotted-eighth echo
  for (const [d, v] of [
    [0, 0.07],
    [STEP16 * 3, 0.03],
    [STEP16 * 6, 0.014],
  ]) note(t + d, f, 0.28, v, 'triangle', 3400, 4);
}

function schedule() {
  if (!ctx || !musicOn) return;
  while (nextT < now() + 0.12) {
    const t = nextT;
    const s16 = step % 16;
    const s32 = step % 32;
    const bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar];
    const swing = s16 % 2 ? STEP16 * 0.14 : 0;
    const I = intensity;
    if (s16 === 0) pad(t, chord, STEP16 * 16);
    // electric piano stabs
    if (s16 === 0 || s16 === 6 || s16 === 10) chord.forEach(n => note(t, midi(n + 12), 0.5, 0.022, 'sine', 2600));
    // drums
    if (s16 % 2 === 0 || I > 0.45) hit(t + swing, 8000, 0.035, s16 % 4 === 2 ? 0.07 : 0.04);
    if (I > 0.1 && (s16 === 0 || s16 === 8 || (I > 0.5 && s16 === 10) || (I > 0.75 && s16 === 14))) kick(t);
    if (I > 0.25 && (s16 === 4 || s16 === 12)) snare(t);
    if (I > 0.6 && s16 === 12) clap(t);
    if (I > 0.8 && bar === 3 && s16 >= 12) snare(t + STEP16 * 0.5);
    // bass
    if (I > 0.3 && (s16 === 0 || s16 === 3 || s16 === 8 || s16 === 11 || (I > 0.7 && s16 === 14)))
      note(t, midi(BASS[bar] + (s16 === 11 ? 12 : 0)), 0.32, 0.16, 'sawtooth', 420 + I * 400, 0);
    // the hook
    if (I > 0.5 && HOOK[s32] !== undefined) pluck(t, midi(HOOK[s32]));
    // arpeggio on top
    if (I > 0.78 && s16 % 2 === 0) note(t + swing, midi(chord[(s16 / 2) % 4] + 24), 0.12, 0.018, 'square', 3800);
    nextT += STEP16;
    step++;
  }
}
