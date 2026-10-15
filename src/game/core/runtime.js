import { createWorld, stepWorld, drainEvents } from '../sim/world';
import { createBot } from '../sim/bot';
import { randomSeed } from '../sim/rng';
import { STEP } from '../sim/tune';
import { emit } from './bus';
import { getGame, setGame } from './store';

// Mutable per-frame game state shared by the scene, input and audio.
export const runtime = {
  world: null,
  mode: 'attract', // 'attract' (bot plays behind the landing page) | 'play'
  bot: null,
  input: null, // () => input object, set by the input layer for 'play'
  acc: 0,
  alpha: 0,
  timeScale: 1,
  // previous-step snapshot for render interpolation
  prev: { s: 0, d: 0, y: 0 },
  prevRiders: new Map(),
  prevCans: new Map(),
  startedAt: 0,
  runId: null,
  nextWorld: null,
  nextTutorial: null, // a tutorial world built ahead for players who haven't done it
  tutorial: null, // the running tutorial controller, if any
  // floating origin: the scene is drawn relative to this point so float32
  // stays precise on long runs (the sim itself keeps absolute coordinates)
  origin: { x: 0, z: 0 },
};

// The origin moves in whole multiples of 3080 m, the common period of every
// world-space texture scale, so tiled surfaces don't visibly jump.
export const ORIGIN_STEP = 3080;
const ORIGIN_SLACK = 2000;
function setOrigin(x, z) {
  const o = runtime.origin;
  const dx = x - o.x;
  const dz = z - o.z;
  if (!dx && !dz) return;
  o.x = x;
  o.z = z;
  emit('originShift', { dx, dz });
}
function updateOrigin(w) {
  const p = w.track.pose(w.runner.s, 0, _pose);
  const o = runtime.origin;
  if (Math.abs(p.x - o.x) < ORIGIN_SLACK && Math.abs(p.z - o.z) < ORIGIN_SLACK) return;
  setOrigin(Math.round(p.x / ORIGIN_STEP) * ORIGIN_STEP, Math.round(p.z / ORIGIN_STEP) * ORIGIN_STEP);
}

// Make the next run's world ahead of time (its chunks are built in the
// background while the landing or game-over screen is showing).
export function prepareWorld(seed = randomSeed() & 0x7fffffff) {
  runtime.nextWorld = createWorld(seed);
  return runtime.nextWorld;
}

export function prepareTutorialWorld(seed = randomSeed() & 0x7fffffff) {
  runtime.nextTutorial = createWorld(seed, { tutorial: true });
  return runtime.nextTutorial;
}

export function startWorld(mode, seed, opts = {}) {
  const next = runtime.nextWorld;
  runtime.tutorial = null;
  if (opts.tutorial) {
    runtime.world = runtime.nextTutorial || createWorld(seed ?? randomSeed(), { tutorial: true });
    runtime.nextTutorial = null;
  } else if (mode === 'play' && next && (seed == null || seed === next.seed)) {
    runtime.world = next;
    runtime.nextWorld = null;
  } else runtime.world = createWorld(seed ?? randomSeed());
  setOrigin(0, 0);
  runtime.mode = mode;
  runtime.bot = mode === 'attract' ? createBot({ skill: 0.92, showOff: true }) : null;
  runtime.acc = 0;
  runtime.alpha = 0;
  runtime.timeScale = 1;
  runtime.prevRiders.clear();
  runtime.prevCans.clear();
  const r = runtime.world.runner;
  runtime.prev = { s: r.s, d: r.d, y: r.y };
  runtime.startedAt = performance.now();
  emit('worldReset', { mode });
  setGame({
    score: 0,
    cans: runtime.world.canCount,
    combo: 0,
    stage: 0,
    power: { ...runtime.world.power },
    shaken: false,
    segVersion: getGame().segVersion + 1,
    objVersion: getGame().objVersion + 1,
  });
  return runtime.world;
}

const blank = { steer: 0, jumpPressed: false, jumpHeld: false, slidePressed: false, sprint: false, throwPressed: false, throwTarget: null };

// Advance the simulation by real time `dt` (seconds). Called once per frame.
export function tick(dt) {
  const w = runtime.world;
  if (!w) return;
  const g = getGame();
  if (g.paused) return;
  // the tutorial freezes the game until the player makes the move it asks for
  const tut = runtime.mode === 'play' ? runtime.tutorial : null;
  if (tut && tut.hold) {
    tut.poll(runtime.input ? runtime.input() : blank);
    if (tut.hold) {
      runtime.timeScale = 0;
      runtime.acc = 0;
      return;
    }
    runtime.timeScale = 1;
  }
  // slow motion after takedowns, eased back
  const target = w.slowmo > 0 ? 0.32 : 1;
  runtime.timeScale += (target - runtime.timeScale) * Math.min(1, dt * (target < runtime.timeScale ? 30 : 6));
  runtime.acc += Math.min(dt, 0.1) * runtime.timeScale;
  let steps = 0;
  while (runtime.acc >= STEP && steps < 6) {
    snapshot(w);
    let inp = w.over ? blank : runtime.mode === 'attract' ? runtime.bot.think(w) : runtime.input ? runtime.input() : blank;
    if (tut) inp = tut.filter(inp, w);
    const segCount = w.segments.length;
    const firstSeg = w.segments[0] && w.segments[0].id;
    const objCount = w.obstacles.length + w.vending.length;
    stepWorld(w, inp);
    if (tut) tut.update(w);
    runtime.acc -= STEP;
    steps++;
    if (w.segments.length !== segCount || (w.segments[0] && w.segments[0].id) !== firstSeg) setGame({ segVersion: getGame().segVersion + 1 });
    if (w.obstacles.length + w.vending.length !== objCount) setGame({ objVersion: getGame().objVersion + 1 });
    for (const e of drainEvents(w)) emit(e.type, e);
    if (w.over || (tut && tut.hold)) break;
  }
  if (steps === 6) runtime.acc = 0;
  runtime.alpha = runtime.acc / STEP;
  mirror(w);
  updateOrigin(w);
}

function snapshot(w) {
  const r = w.runner;
  runtime.prev.s = r.s;
  runtime.prev.d = r.d;
  runtime.prev.y = r.y;
  for (const rd of w.riders) {
    let p = runtime.prevRiders.get(rd.id);
    if (!p) runtime.prevRiders.set(rd.id, (p = {}));
    p.s = rd.s;
    p.d = rd.d;
    p.y = rd.y;
  }
  for (const c of w.cans) {
    let p = runtime.prevCans.get(c.id);
    if (!p) runtime.prevCans.set(c.id, (p = {}));
    p.s = c.s;
    p.d = c.d;
    p.y = c.y;
  }
}

// Mirror the handful of values the HUD shows, only when they change.
function mirror(w) {
  const g = getGame();
  const patch = {};
  if (g.score !== w.score) patch.score = w.score;
  if (g.cans !== w.canCount) patch.cans = w.canCount;
  if (g.combo !== w.combo) patch.combo = w.combo;
  if (g.stage !== w.stage) patch.stage = w.stage;
  // the distance counter is written straight to the DOM, no React render
  const dist = Math.floor(w.runner.s);
  if (runtime.distEl && runtime.distShown !== dist) {
    runtime.distShown = dist;
    runtime.distEl.textContent = `${dist} m`;
  }
  const shaken = w.runner.shakenT > 0;
  if (g.shaken !== shaken) patch.shaken = shaken;
  const P = w.power;
  const gp = g.power;
  if (
    gp.hoodie !== P.hoodie ||
    Math.ceil(gp.magnet) !== Math.ceil(P.magnet) ||
    Math.ceil(gp.coffee) !== Math.ceil(P.coffee) ||
    Math.ceil(gp.sixpack) !== Math.ceil(P.sixpack)
  )
    patch.power = { ...P };
  if (Object.keys(patch).length) setGame(patch);
}

// interpolated runner position
export function runnerLerp(out = {}) {
  const r = runtime.world.runner;
  const a = runtime.alpha;
  out.s = runtime.prev.s + (r.s - runtime.prev.s) * a;
  out.d = runtime.prev.d + (r.d - runtime.prev.d) * a;
  out.y = runtime.prev.y + (r.y - runtime.prev.y) * a;
  return out;
}

export function lerpEntity(e, prevMap, out = {}) {
  const p = prevMap.get(e.id);
  const a = runtime.alpha;
  if (!p) {
    out.s = e.s;
    out.d = e.d;
    out.y = e.y ?? 0;
    return out;
  }
  out.s = p.s + (e.s - p.s) * a;
  out.d = p.d + (e.d - p.d) * a;
  out.y = (p.y ?? 0) + ((e.y ?? 0) - (p.y ?? 0)) * a;
  return out;
}

// track space → world space
export function toWorld(s, d, y, out) {
  const p = runtime.world.track.pose(s, d, _pose);
  out.x = p.x - runtime.origin.x;
  out.y = y;
  out.z = p.z - runtime.origin.z;
  return p.h;
}
const _pose = {};

// dev helper: let the bot play until distance `toS` (headless testing)
export function fastForward(toS) {
  const w = runtime.world;
  const bot = createBot({ skill: 1 });
  while (!w.over && w.runner.s < toS) {
    snapshot(w);
    stepWorld(w, bot.think(w));
    drainEvents(w);
  }
  snapshot(w);
  updateOrigin(w);
  setGame({ segVersion: getGame().segVersion + 1, objVersion: getGame().objVersion + 1 });
}
