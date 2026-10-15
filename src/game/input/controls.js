import * as THREE from 'three';
import { runtime, toWorld } from '../core/runtime';
import { getGame } from '../core/store';

// Keyboard (laptops) and touch (phones) feed one input object that the
// simulation reads every fixed step.
//
// Laptop: ←/→ (A/D) steer · ↑ (W) jump, again in the air to double jump
//         ↓ (S) slide · Space throw straight ahead (Enter works too) · Shift sprint
// Phone:  tilt to steer (or drag a thumb) · swipe up jump · swipe down slide
//         tap a rider to throw at them

const keys = new Set();
const st = {
  jumpPressed: false,
  slidePressed: false,
  throwPressed: false,
  throwTarget: null,
  steerTap: 0, // last ←/→ press, so even a tap shorter than a frame registers
  touchJumpHeld: 0,
  tilt: 0,
  tiltNeutral: null,
  tiltRaw: null,
  drag: 0,
};

const isTyping = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const JUMP = ['ArrowUp', 'KeyW'];
const THROW = ['Space', 'Enter', 'NumpadEnter'];
const SLIDE = ['ArrowDown', 'KeyS'];
const anyOf = list => list.some(k => keys.has(k));

export function readInput() {
  const g = getGame();
  let steer = (anyOf(RIGHT) ? 1 : 0) - (anyOf(LEFT) ? 1 : 0);
  if (g.touch) steer = g.steerMode === 'tilt' && st.tiltRaw != null ? st.tilt : st.drag;
  const inp = {
    steer,
    jumpPressed: st.jumpPressed,
    jumpHeld: anyOf(JUMP) || st.touchJumpHeld > 0,
    slidePressed: st.slidePressed,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    throwPressed: st.throwPressed,
    throwTarget: st.throwTarget,
    steerTap: st.steerTap,
  };
  st.steerTap = 0;
  st.jumpPressed = false;
  st.slidePressed = false;
  st.throwPressed = false;
  st.throwTarget = null;
  if (st.touchJumpHeld > 0) st.touchJumpHeld--;
  return inp;
}

export function clearInput() {
  keys.clear();
  st.jumpPressed = st.slidePressed = st.throwPressed = false;
  st.steerTap = 0;
  st.touchJumpHeld = 0;
  st.drag = 0;
}

// ---------------------------------------------------------------- keyboard
// `onAction(name)` receives UI actions: 'pause', 'mute', 'start', 'restart'
export function attachKeyboard(onAction) {
  const down = e => {
    if (isTyping(e.target)) return;
    const c = e.code;
    if (c === 'Escape' || c === 'KeyP') {
      onAction('pause');
      e.preventDefault();
      return;
    }
    if (c === 'KeyM' && !e.repeat) {
      onAction('mute');
      return;
    }
    const playing = getGame().phase === 'playing' && !getGame().paused;
    if ([...LEFT, ...RIGHT, ...JUMP, ...SLIDE, ...THROW].includes(c) && playing) e.preventDefault();
    if (!playing) {
      // let focused buttons handle Enter/Space; other keys can still start a run
      const onControl = e.target && e.target.closest && e.target.closest('button, a, input, select');
      if (!onControl || (c !== 'Enter' && c !== 'Space' && c !== 'Tab')) {
        if (!e.repeat && c !== 'Tab' && !c.startsWith('Shift') && !c.startsWith('Meta') && !c.startsWith('Alt') && !c.startsWith('Control')) onAction('start');
      }
      return;
    }
    keys.add(c);
    if (e.repeat) return;
    if (LEFT.includes(c)) st.steerTap = -1;
    if (RIGHT.includes(c)) st.steerTap = 1;
    if (JUMP.includes(c)) st.jumpPressed = true;
    if (SLIDE.includes(c)) st.slidePressed = true;
    if (THROW.includes(c)) st.throwPressed = true;
  };
  const up = e => keys.delete(e.code);
  const blur = () => clearInput();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}

// ------------------------------------------------------------------- tilt
function screenAngle() {
  const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

function onOrientation(e) {
  if (e.gamma == null) return;
  const a = screenAngle();
  // left/right tilt relative to the screen, whichever way the phone is held
  let v = e.gamma;
  if (a === 90) v = e.beta;
  else if (a === 270) v = -e.beta;
  else if (a === 180) v = -e.gamma;
  st.tiltRaw = v;
  if (st.tiltNeutral == null) st.tiltNeutral = v;
  const sens = getGame().tiltSensitivity || 1;
  let x = v - st.tiltNeutral;
  const dead = 2.5;
  x = Math.abs(x) < dead ? 0 : x - Math.sign(x) * dead;
  st.tilt = Math.max(-1, Math.min(1, (x * sens) / 16));
}

// must be called from a user gesture (iOS asks for permission)
export async function enableTilt() {
  try {
    const D = window.DeviceOrientationEvent;
    if (!D) return false;
    if (typeof D.requestPermission === 'function') {
      const res = await D.requestPermission();
      if (res !== 'granted') return false;
    }
    window.removeEventListener('deviceorientation', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    return true;
  } catch {
    return false;
  }
}

// the angle you hold the phone at when a run starts counts as straight
export function calibrateTilt() {
  st.tiltNeutral = st.tiltRaw;
  st.tilt = 0;
}

export const tiltAvailable = () => st.tiltRaw != null;

// ------------------------------------------------------------------- touch
const _v = new THREE.Vector3();
function riderAtScreen(x, y) {
  const w = runtime.world;
  const cam = runtime.camera;
  if (!w || !cam) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const p = {};
  let best = null;
  let bestD = Infinity;
  for (const rd of w.riders) {
    if (rd.state !== 'ride') continue;
    const ds = rd.s - w.runner.s;
    if (ds < 1.5 || ds > 55) continue;
    toWorld(rd.s, rd.d, (rd.y ?? 0) + 1.1, p);
    _v.set(p.x, p.y, p.z).project(cam);
    if (_v.z > 1) continue;
    const sx = ((_v.x + 1) / 2) * W;
    const sy = ((1 - _v.y) / 2) * H;
    // generous: riders are small and fast
    const radius = Math.max(70, 2200 / Math.max(4, ds));
    const d = Math.hypot(sx - x, sy - y);
    if (d < radius && d < bestD) {
      bestD = d;
      best = rd;
    }
  }
  return best;
}

export function attachTouch(el) {
  let t0 = null;
  // taps on buttons (pause, tutorial) are not throws
  const onUi = e => e.target && e.target.closest && e.target.closest('button, a, input, select, label');
  const start = e => {
    if (getGame().phase !== 'playing' || getGame().paused || onUi(e)) return;
    const t = e.changedTouches[0];
    t0 = { id: t.identifier, x: t.clientX, y: t.clientY, time: performance.now(), swiped: false, lastX: t.clientX };
  };
  const move = e => {
    if (!t0) return;
    const t = [...e.changedTouches].find(c => c.identifier === t0.id);
    if (!t) return;
    e.preventDefault();
    const dx = t.clientX - t0.x;
    const dy = t.clientY - t0.y;
    if (getGame().steerMode === 'drag' || !tiltAvailable()) {
      st.drag = Math.max(-1, Math.min(1, dx / (window.innerWidth * 0.16)));
    }
    if (!t0.swiped && Math.abs(dy) > 38 && Math.abs(dy) > Math.abs(dx) * 1.1 && performance.now() - t0.time < 420) {
      t0.swiped = true;
      if (dy < 0) {
        st.jumpPressed = true;
        st.touchJumpHeld = 20;
      } else st.slidePressed = true;
    }
  };
  const end = e => {
    if (!t0) return;
    const t = [...e.changedTouches].find(c => c.identifier === t0.id);
    if (!t) return;
    const dx = t.clientX - t0.x;
    const dy = t.clientY - t0.y;
    const quick = performance.now() - t0.time < 300;
    if (!t0.swiped && quick && Math.hypot(dx, dy) < 14) {
      const rd = riderAtScreen(t.clientX, t.clientY);
      st.throwPressed = true;
      st.throwTarget = rd ? rd.id : null;
    }
    st.drag = 0;
    t0 = null;
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  // a mouse click on a rider also throws at it
  const click = e => {
    if (getGame().phase !== 'playing' || getGame().paused || getGame().touch || onUi(e)) return;
    const rd = riderAtScreen(e.clientX, e.clientY);
    if (rd) {
      st.throwPressed = true;
      st.throwTarget = rd.id;
    }
  };
  el.addEventListener('mousedown', click);
  return () => {
    el.removeEventListener('touchstart', start);
    el.removeEventListener('touchmove', move);
    el.removeEventListener('touchend', end);
    el.removeEventListener('touchcancel', end);
    el.removeEventListener('mousedown', click);
  };
}
