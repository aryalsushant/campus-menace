import { createTrack } from './track';
import { createSurfaces } from './surfaces';
import { createGenerator } from './generator';
import { createRunner, stepRunner, runnerHeight } from './runner';
import { STEP, RUN, CANS, RIDER, POWER, COMBO, speedAt, stageAt } from './tune';

const AHEAD = 320; // generate this far ahead of the runner
const BEHIND = 60; // keep this much behind for the camera

export function createWorld(seed) {
  const world = {
    seed,
    t: 0,
    track: createTrack(),
    surfaces: createSurfaces(),
    segments: [],
    obstacles: [],
    pickups: [],
    plannedRiders: [],
    riders: [],
    cans: [],
    vending: [],
    runner: createRunner(4),
    score: 0,
    canCount: CANS.start,
    canCd: 0,
    power: { magnet: 0, coffee: 0, hoodie: false, sixpack: 0 },
    combo: 0,
    comboT: 0,
    stage: 0,
    stats: { takedowns: 0, closeCalls: 0, thrown: 0, stumbles: 0, maxCombo: 0, pizza: 0 },
    over: false,
    events: [],
    slowmo: 0, // seconds of slow motion remaining (render uses it to scale time)
  };
  world.emit = (type, data = {}) => world.events.push({ type, t: world.t, ...data });
  world.gen = createGenerator(seed);
  world.gen.generateUntil(world, AHEAD);
  return world;
}

const blank = { steer: 0, jumpPressed: false, jumpHeld: false, slidePressed: false, sprint: false, throwPressed: false, throwTarget: null };

export function stepWorld(world, input = blank, dt = STEP) {
  if (world.over) return;
  world.t += dt;
  const r = world.runner;
  const P = world.power;

  P.magnet = Math.max(0, P.magnet - dt);
  P.coffee = Math.max(0, P.coffee - dt);
  P.sixpack = Math.max(0, P.sixpack - dt);
  world.canCd = Math.max(0, world.canCd - dt);
  world.slowmo = Math.max(0, world.slowmo - dt);
  world.comboT -= dt;
  if (world.comboT <= 0 && world.combo > 0) {
    world.combo = 0;
    world.emit('comboEnd');
  }

  world.surfaces.update(world.t);
  stepRunner(r, input, world, dt);

  const st = stageAt(r.s);
  if (st !== world.stage) {
    world.stage = st;
    world.emit('stage', { stage: st });
  }

  // generation + cleanup
  world.gen.generateUntil(world, r.s + AHEAD);
  prune(world, r.s - BEHIND);

  if (input.throwPressed) throwCan(world, input.throwTarget);
  updateObstacles(world, dt);
  updateRiders(world, dt);
  updateCans(world, dt);
  updatePickups(world, dt);
  updateVending(world);

  if (r.dead) {
    world.over = true;
    if (!world.events.some(e => e.type === 'death')) world.emit('death', { cause: r.cause });
  }
}

// ------------------------------------------------------------------ helpers
function addCombo(world, n = 1) {
  world.combo += n;
  world.comboT = COMBO.window;
  world.stats.maxCombo = Math.max(world.stats.maxCombo, world.combo);
  if (world.combo % COMBO.every === 0) {
    addScore(world, COMBO.bonus);
    world.emit('comboBonus', { combo: world.combo, bonus: COMBO.bonus });
  }
}

function addScore(world, n) {
  world.score += n;
  world.stats.pizza += Math.max(0, n);
}

function groundY(world, s, d, near) {
  const g = world.surfaces.groundAt(s, d, near + 3);
  return g ? g.h : near;
}

function prune(world, s) {
  world.track.prune(s - 40);
  world.surfaces.prune(s);
  const keep = x => x.s > s;
  world.obstacles = world.obstacles.filter(keep);
  world.pickups = world.pickups.filter(p => p.s > s && !(p.taken && world.t - p.takenAt > 1));
  world.vending = world.vending.filter(keep);
  world.riders = world.riders.filter(rd => rd.s > s - 20 && !(rd.state === 'down' && world.t - rd.downAt > 4));
  world.segments = world.segments.filter(sg => sg.s1 > s - 40);
}

// ---------------------------------------------------------------- stumbling
function hurt(world, cause, src) {
  const r = world.runner;
  if (r.invT > 0 || world.power.coffee > 0) return 'ignored';
  if (world.power.hoodie) {
    world.power.hoodie = false;
    r.invT = RUN.invulnAfterShield;
    world.emit('shieldBreak', { cause });
    return 'shield';
  }
  if (cause === 'scooter') {
    r.dead = true;
    r.cause = 'scooter';
    world.emit('death', { cause: 'scooter', riderId: src && src.id });
    return 'dead';
  }
  if (r.shakenT > 0) {
    r.dead = true;
    r.cause = 'faceplant';
    world.emit('death', { cause: 'faceplant', model: src && src.model });
    return 'dead';
  }
  r.stumbleT = RUN.stumbleTime;
  r.shakenT = RUN.shakenTime;
  r.graceT = 0.6; // plough through whatever else you touch while stumbling
  r.slideT = 0;
  world.stats.stumbles++;
  if (world.combo > 0) {
    world.combo = 0;
    world.emit('comboEnd');
  }
  // drop slices ahead: grab them back if you're quick
  const n = Math.min(3, world.score);
  world.score -= n;
  for (let i = 0; i < n; i++) {
    world.pickups.push({
      id: `drop-${world.t}-${i}`,
      kind: 'pizza',
      s: r.s + 4 + i * 2.2,
      d: r.d + (i - 1) * 0.9,
      y: r.y + 0.9,
      taken: false,
      dropped: true,
      bornAt: world.t,
    });
  }
  world.emit('stumble', { model: src && src.model, dropped: n });
  return 'stumble';
}

// ---------------------------------------------------------------- obstacles
function updateObstacles(world, dt) {
  const r = world.runner;
  const h = runnerHeight(r);
  for (const o of world.obstacles) {
    if (o.vs) o.s += o.vs * dt;
    if (o.vd) {
      o.d += o.vd * dt;
      if (o.d < o.minD || o.d > o.maxD) o.vd = -o.vd;
    }
    if (o.chase && !o.hit) {
      const ds = o.s - r.s;
      if (ds > 0 && ds < 26) {
        const dir = Math.sign(r.d - o.d);
        o.d += dir * Math.min(Math.abs(r.d - o.d), o.chase * dt);
        o.chasing = true;
      }
    }
    if (o.hit) continue;
    if (Math.abs(o.s - r.s) > o.hd + RUN.radius) continue;
    if (Math.abs(o.d - r.d) > o.hw + RUN.radius) continue;
    const feet = r.y - o.y;
    let blocked = false;
    if (o.kind === 'low') blocked = feet < o.h - 0.06;
    else if (o.kind === 'high') blocked = feet + h > o.clear && feet < o.top;
    else blocked = feet < 2.4;
    if (!blocked) continue;
    o.hit = true;
    o.hitAt = world.t;
    const res = r.graceT > 0 ? 'ignored' : hurt(world, 'obstacle', o);
    world.emit('obstacleHit', { id: o.id, model: o.model, result: res, s: o.s, d: o.d });
  }
}

// ------------------------------------------------------------------- riders
function activateRiders(world) {
  const r = world.runner;
  for (let i = world.plannedRiders.length - 1; i >= 0; i--) {
    const p = world.plannedRiders[i];
    let ahead;
    if (p.kind === 'oncoming') ahead = (r.speed - p.vs) * RIDER.leadTime;
    else if (p.kind === 'drifter') ahead = r.speed * 2.6;
    else ahead = 75;
    if (p.s - r.s > ahead) continue;
    world.plannedRiders.splice(i, 1);
    if (p.s < r.s + 6) continue; // already too close: skip rather than pop in
    if (p.needsCan && world.canCount <= 0 && world.power.sixpack <= 0) continue;
    const g = world.surfaces.groundAt(p.s, p.d, 1e9);
    world.riders.push({ ...p, baseD: p.d, y: g ? g.h : r.y, state: 'ride', bornAt: world.t, side: Math.sign(p.s - r.s), minAbsD: Infinity, lean: 0 });
    world.emit('riderSpawn', { id: p.id, kind: p.kind });
  }
}

function updateRiders(world, dt) {
  activateRiders(world);
  const r = world.runner;
  for (const rd of world.riders) {
    if (rd.state === 'down') {
      continue;
    }
    // movement
    rd.s += rd.vs * dt;
    if (rd.s < rd.minS) rd.s = rd.minS;
    if (rd.s > rd.maxS) rd.s = rd.maxS;
    const age = world.t - rd.bornAt;
    let target = rd.baseD;
    if (rd.kind === 'weaver') target = rd.baseD + Math.sin(age * rd.freq + rd.phase) * rd.amp;
    else if (rd.kind === 'drifter') {
      const dir = Math.sign(rd.drift.to - rd.baseD);
      rd.baseD += dir * rd.drift.speed * dt;
      if ((dir > 0 && rd.baseD > rd.drift.to) || (dir < 0 && rd.baseD < rd.drift.to)) rd.baseD = rd.drift.to;
      target = rd.baseD;
    } else target = rd.baseD + Math.sin(age * rd.freq + rd.phase) * rd.amp;

    // steer around obstacles in the rider's way
    const dir = Math.sign(rd.vs) || -1;
    for (const o of world.obstacles) {
      if (o.hit) continue;
      const ahead = (o.s - rd.s) * dir;
      if (ahead < 0 || ahead > 7) continue;
      if (Math.abs(o.d - target) < o.hw + 0.7) {
        const wall = world.surfaces.wallAt(rd.s);
        const lo = wall ? wall.dl + 0.5 : -4;
        const hi = wall ? wall.dr - 0.5 : 4;
        const left = o.d - o.hw - 0.75;
        const right = o.d + o.hw + 0.75;
        target = left >= lo && (Math.abs(left - rd.d) < Math.abs(right - rd.d) || right > hi) ? left : Math.min(right, hi);
      }
    }
    const prevD = rd.d;
    rd.d += Math.max(-3.5 * dt, Math.min(3.5 * dt, target - rd.d));
    rd.lean = (rd.d - prevD) / dt;
    rd.y = groundY(world, rd.s, rd.d, rd.y);

    // collision with the runner
    const ds = rd.s - r.s;
    const dd = Math.abs(rd.d - r.d);
    if (Math.abs(ds) < RIDER.halfDepth + RUN.radius && dd < RIDER.halfWidth + RUN.radius && r.y - rd.y < 3.6) {
      const res = hurt(world, 'scooter', rd);
      if (res !== 'dead') knockDown(world, rd, res === 'shield' ? 'shield' : 'bowled');
      continue;
    }
    // close calls: passing within RIDER.closeCall metres
    if (Math.abs(ds) < 2) rd.minAbsD = Math.min(rd.minAbsD, dd);
    const side = Math.sign(ds);
    if (side !== rd.side && side !== 0) {
      if (rd.side > 0 && rd.minAbsD < RIDER.closeCall && !rd.closeCalled) {
        rd.closeCalled = true;
        world.stats.closeCalls++;
        addScore(world, 1);
        addCombo(world);
        world.emit('closeCall', { id: rd.id, s: rd.s, d: rd.d });
      }
      rd.side = side;
    }
  }
}

function knockDown(world, rd, how) {
  rd.state = 'down';
  rd.downAt = world.t;
  rd.how = how;
  world.stats.takedowns++;
  addCombo(world);
  // drops 3 slices that spill toward the runner
  for (let i = 0; i < 3; i++) {
    world.pickups.push({
      id: `rd-${rd.id}-${i}`,
      kind: 'pizza',
      s: rd.s - 2 - i * 1.6,
      d: rd.d + (i - 1) * 0.8,
      y: (rd.y ?? 0) + 1,
      taken: false,
      dropped: true,
      bornAt: world.t,
    });
  }
  world.emit('takedown', { id: rd.id, how, s: rd.s, d: rd.d, kind: rd.kind, combo: world.combo });
}

// --------------------------------------------------------------------- cans
function throwCan(world, targetId) {
  const r = world.runner;
  if (world.canCd > 0) return;
  const unlimited = world.power.sixpack > 0;
  if (!unlimited && world.canCount <= 0) {
    world.emit('noCans');
    return;
  }
  world.canCd = CANS.cooldown;
  if (!unlimited) world.canCount--;
  world.stats.thrown++;

  const s0 = r.s + 0.5;
  const d0 = r.d + 0.25;
  const y0 = r.y + 1.35;
  const vs = r.speed + CANS.speed;
  const can = { id: `can-${world.t}`, s: s0, d: d0, y: y0, vs, vd: 0, vy: 2.2, born: world.t, alive: true, target: null };

  // pick a target: explicit (tap) or the rider most directly ahead (Enter)
  let best = null;
  let bestScore = Infinity;
  for (const rd of world.riders) {
    if (rd.state !== 'ride') continue;
    const ds = rd.s - s0;
    if (ds < 1.5 || ds > 55) continue;
    if (targetId != null) {
      if (rd.id === targetId) best = rd;
      continue;
    }
    const assist = 0.75 + ds * 0.04;
    const dd = Math.abs(rd.d - d0);
    if (dd > assist) continue;
    const sc = dd / assist + ds / 55;
    if (sc < bestScore) {
      bestScore = sc;
      best = rd;
    }
  }
  if (best) {
    // lead the target: solve for flight time with the closing speed
    const closing = vs - best.vs;
    const t = Math.max(0.05, (best.s - s0) / closing);
    const futureD = best.d + (best.lean || 0) * t * 0.6;
    can.vd = (futureD - d0) / t;
    const yTarget = (best.y ?? r.y) + 1.15;
    can.vy = (yTarget - y0 + 0.5 * CANS.gravity * t * t) / t;
    can.target = best.id;
  }
  world.cans.push(can);
  world.emit('throw', { id: can.id, target: can.target });
}

function updateCans(world, dt) {
  for (const c of world.cans) {
    if (!c.alive) continue;
    c.s += c.vs * dt;
    c.d += c.vd * dt;
    c.vy -= CANS.gravity * dt;
    c.y += c.vy * dt;
    for (const rd of world.riders) {
      if (rd.state !== 'ride') continue;
      if (Math.abs(rd.s - c.s) < 0.9 && Math.abs(rd.d - c.d) < 0.65) {
        const ry = rd.y ?? 0;
        if (c.y > ry + 0.2 && c.y < ry + 2.2) {
          c.alive = false;
          world.emit('canHit', { id: c.id, riderId: rd.id, s: c.s, d: c.d, y: c.y });
          knockDown(world, rd, 'can');
          break;
        }
      }
    }
    if (!c.alive) continue;
    const g = world.surfaces.groundAt(c.s, c.d, c.y + 0.1);
    if ((g && c.y <= g.h + 0.05) || world.t - c.born > CANS.life) {
      c.alive = false;
      world.emit('canMiss', { id: c.id, s: c.s, d: c.d, y: g ? g.h : c.y });
    }
  }
  world.cans = world.cans.filter(c => c.alive);
}

// ------------------------------------------------------------------ pickups
function updatePickups(world, dt) {
  const r = world.runner;
  const P = world.power;
  const cy = r.y + 0.9;
  for (const p of world.pickups) {
    if (p.taken) continue;
    if (p.dropped && world.t - p.bornAt < 0.25) continue;
    let ds = p.s - r.s;
    if (ds > 12 || ds < -2) continue;
    if (P.magnet > 0 && (p.kind === 'pizza' || p.kind === 'golden')) {
      const dd = p.d - r.d;
      const dy = p.y - cy;
      const dist = Math.hypot(ds, dd, dy);
      if (dist < POWER.magnetRadius) {
        const k = Math.min(1, (18 * dt) / Math.max(0.3, dist));
        p.s -= ds * k;
        p.d -= dd * k;
        p.y -= dy * k;
        ds = p.s - r.s;
      }
    }
    if (Math.abs(ds) < 0.95 && Math.abs(p.d - r.d) < 0.95 && Math.abs(p.y - cy) < 1.35) {
      p.taken = true;
      p.takenAt = world.t;
      if (p.kind === 'pizza') {
        addScore(world, 1);
        world.emit('pizza', { id: p.id, s: p.s, d: p.d, y: p.y, score: world.score });
      } else if (p.kind === 'golden') {
        addScore(world, 5);
        world.emit('golden', { id: p.id, s: p.s, d: p.d, y: p.y, score: world.score });
      } else {
        if (p.kind === 'magnet') P.magnet = POWER.magnet;
        else if (p.kind === 'coffee') P.coffee = POWER.coffee;
        else if (p.kind === 'hoodie') P.hoodie = true;
        else if (p.kind === 'sixpack') P.sixpack = POWER.sixpack;
        world.emit('powerup', { kind: p.kind, s: p.s, d: p.d, y: p.y });
      }
    }
  }
}

function updateVending(world) {
  const r = world.runner;
  for (const v of world.vending) {
    if (v.used || r.s < v.s) continue;
    v.used = true;
    const before = world.canCount;
    world.canCount = Math.max(world.canCount, CANS.max);
    world.emit('restock', { id: v.id, added: world.canCount - before, cans: world.canCount });
  }
}

export function drainEvents(world) {
  const out = world.events;
  world.events = [];
  return out;
}

export { speedAt };
