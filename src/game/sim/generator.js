import { createRng } from './rng';
import { RUN, RIDER, speedAt, difficultyAt, stageAt, AIR_SINGLE, AIR_DOUBLE } from './tune';

// Builds the run ahead of the player as alternating sections (open campus
// areas full of action) and crossings (bridges, gaps, stones…).
//
// Everything the simulation needs goes into `world`: track pieces, pads,
// walls, obstacles, pickups, planned riders and vending machines. `segments`
// describes each piece for the renderer.

// distance at which each beat / crossing type first appears
const BEAT_UNLOCK = {
  pizzaLine: 0,
  low1: 20,
  oncoming: 35,
  tallPair: 60,
  lowWall: 95,
  weaver: 140,
  banner: 160,
  oncoming2: 220,
  slalom: 250,
  drifter: 300,
  goose: 380,
  queue: 430,
  pack: 500,
  robot: 580,
  combo: 650,
  tour: 720,
};
const CROSS_UNLOCK = {
  bridge: 0,
  gap: 140,
  stones: 340,
  narrow: 520,
  doubleGap: 600,
  broken: 850,
  drop: 950,
  collapse: 1050,
  bounce: 2700,
};

// how much path each beat needs, so nothing spills into the run-up before a crossing
const BEAT_LEN = { pizzaLine: 8, low1: 6, lowWall: 7, banner: 8, tallPair: 7, slalom: 30, queue: 7, tour: 16, goose: 14, robot: 10, oncoming: 10, oncoming2: 24, weaver: 24, drifter: 14, pack: 16, combo: 22 };

const OBSTACLE_BEATS = new Set(['low1', 'lowWall', 'banner', 'tallPair', 'queue', 'goose', 'robot', 'pizzaLine']);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// distance covered by a single jump that lands `dh` higher (negative = lower)
function jumpReach(v, dh) {
  const g = RUN.gravity;
  const vj = RUN.jumpV;
  const disc = vj * vj - 2 * g * dh;
  if (disc < 0) return 0;
  return v * ((vj + Math.sqrt(disc)) / g);
}

export function createGenerator(seed) {
  const rng = createRng(seed);
  let segId = 1;
  let objId = 1;
  const seenBeats = new Set();
  const seenCross = new Set();
  const state = {
    genS: 0,
    y: 0,
    nextVend: 380,
    lastCross: null,
    sections: 0,
  };
  // the section currently being filled; riders are kept inside it
  let cur = { s0: 0, s1: 0 };

  function generateUntil(world, target) {
    while (state.genS < target) {
      section(world);
      crossing(world);
    }
  }

  // ------------------------------------------------------------------ pizza
  function pizzaLine(world, s0, s1, dAt, yAt = () => 1, spacing = 2.4) {
    for (let s = s0; s <= s1; s += spacing) {
      world.pickups.push({ id: objId++, kind: 'pizza', s, d: dAt(s), y: yAt(s), taken: false });
    }
  }

  function powerUp(world, s, d, y) {
    const kind = rng.weighted([
      ['magnet', 3],
      ['coffee', 2],
      ['hoodie', 2],
      ['sixpack', 2],
    ]);
    world.pickups.push({ id: objId++, kind, s, d, y: y + 1.1, taken: false });
  }

  // ---------------------------------------------------------------- section
  function section(world) {
    const s0 = state.genS;
    const first = state.sections === 0;
    const stage = stageAt(s0);
    const D = difficultyAt(s0);
    const plaza = stage === 0 && !first && rng.chance(0.18);
    const w = first ? 5.4 : plaza ? rng.range(6.6, 7.4) : [rng.range(5, 5.8), rng.range(4.4, 5.2), rng.range(3.9, 4.7)][stage];
    const len = first ? 120 : Math.round(rng.range(lerp(110, 80, D), lerp(150, 120, D)));
    const s1 = s0 + len;
    cur = { s0, s1 };

    // centreline: 2-3 pieces, gentle curves biased back toward the start heading
    const nPieces = first ? 1 : rng.int(2, 3);
    let left = len;
    for (let i = 0; i < nPieces; i++) {
      const pl = i === nPieces - 1 ? left : Math.round(left * rng.range(0.3, 0.55));
      left -= pl;
      let k = 0;
      if (!first && rng.chance(0.65)) {
        const h = world.track.end.h;
        const sign = Math.abs(h) > 0.55 ? -Math.sign(h) : rng.sign();
        k = sign * rng.range(1 / 190, 1 / 75);
      }
      world.track.add(pl, k);
    }

    // elevation: flat, or with a ramp (stairs) in the middle
    const y0 = state.y;
    const parts = [];
    const ramp = !first && rng.chance(stage === 0 ? 0.28 : 0.35) && len > 90;
    if (ramp) {
      const r0 = s0 + Math.round(len * rng.range(0.3, 0.45));
      const rl = 12;
      let dy = rng.sign() * rng.range(1.6, 2.6);
      if (state.y + dy < -14) dy = Math.abs(dy);
      if (state.y + dy > 14) dy = -Math.abs(dy);
      parts.push({ s0, s1: r0, y0, y1: y0 });
      parts.push({ s0: r0, s1: r0 + rl, y0, y1: y0 + dy, ramp: true });
      parts.push({ s0: r0 + rl, s1, y0: y0 + dy, y1: y0 + dy });
      state.y = y0 + dy;
    } else parts.push({ s0, s1, y0, y1: y0 });

    const padIds = parts.map(p => world.surfaces.addPad({ s0: p.s0, s1: p.s1, dl: -w, dr: w, y0: p.y0, y1: p.y1, kind: 'path' }).id);
    world.surfaces.addWall({ s0, s1, dl: -w, dr: w });

    const seg = { id: segId++, kind: 'section', s0, s1, stage, w, plaza, parts, padIds, seed: rng.int(1, 1e9) };
    world.segments.push(seg);
    const yAtS = s => {
      for (const p of parts) if (s >= p.s0 && s <= p.s1) return p.y0 + (p.y1 - p.y0) * ((s - p.s0) / Math.max(1e-6, p.s1 - p.s0));
      return state.y;
    };

    // vending machine checkpoints
    if (s0 + 8 >= state.nextVend) {
      world.vending.push({ id: objId++, s: s0 + 8, side: rng.sign(), w, y: yAtS(s0 + 8), used: false });
      state.nextVend = s0 + lerp(420, 720, D);
    }

    // beats
    const clearStart = first ? 16 : 10;
    const runway = 20;
    let s = s0 + clearStart;
    const end = s1 - runway;
    while (s < end - 6) {
      const v = speedAt(s);
      const gap = v * lerp(1.45, 0.72, difficultyAt(s));
      const span = beat(world, s, end, w, yAtS, stage, ramp ? parts[1] : null);
      s += span + gap;
    }

    // background scooter traffic between the beats, never stacked on another rider
    if (!first) {
      const D0 = difficultyAt(s0);
      const spacing = lerp(48, 26, D0);
      for (let t = s0 + 24 + rng.range(0, spacing); t < s1 - runway - 4; t += spacing * rng.range(0.8, 1.25)) {
        const busy = world.plannedRiders.some(r => Math.abs((r.meet ?? r.s) - t) < 10);
        const blocked = world.obstacles.some(o => Math.abs(o.s - t) < 6);
        if (busy || blocked) continue;
        if (t > BEAT_UNLOCK.weaver && rng.chance(0.25)) {
          const vs = speedAt(t) * rng.range(0.38, 0.48);
          addRider(world, { kind: 'weaver', meet: t, s: t + 14, d: 0, vs, minS: t, maxS: s1 - runway, amp: Math.min(w - 1, rng.range(1.4, 2.4)), freq: rng.range(0.9, 1.4) });
        } else oncoming(world, t, rng.range(-w + 0.8, w - 0.8));
      }
    }

    state.genS = s1;
    state.sections++;
    seg.yEnd = state.y;
  }

  function availableBeats(s, stage) {
    const out = [];
    const D = difficultyAt(s);
    const W = {
      pizzaLine: lerp(0.7, 0.25, D),
      low1: 2,
      tallPair: 2,
      oncoming: 6.8,
      lowWall: 1.7,
      banner: 1.6,
      slalom: 1.4,
      weaver: 3.8,
      goose: stage === 0 ? 1.2 : 0.6,
      queue: stage === 0 ? 1.2 : 0.5,
      drifter: 3.4,
      oncoming2: 5.2,
      robot: 1.1,
      tour: stage === 0 ? 1 : 0.4,
      pack: 3.4,
      combo: 1.6 + 3 * D,
    };
    for (const k in W) if (s >= BEAT_UNLOCK[k]) out.push([k, W[k]]);
    return out;
  }

  // places one beat starting at s, returns its length along the path
  function beat(world, s, end, w, yAtS, stage, ramp) {
    let type = rng.weighted(availableBeats(s, stage));
    // brand-new types appear on their own with extra room
    let alone = false;
    if (!seenBeats.has(type)) {
      seenBeats.add(type);
      alone = true;
    }
    // nothing but pizza on stairs
    if (ramp && s + 30 > ramp.s0 && s < ramp.s1 + 4) type = 'pizzaLine';
    const room = end - s;
    if ((BEAT_LEN[type] || 6) > room) type = 'pizzaLine';
    const make = BEATS[type];
    let len = make(world, s, Math.max(8, room), w, yAtS, stage);
    // past the opening, obstacles often come with a rider behind them
    const D = difficultyAt(s);
    if (!alone && OBSTACLE_BEATS.has(type) && s > 110 && room > len + 20 && rng.chance(0.6 + 0.4 * D)) {
      oncoming(world, s + len + rng.range(9, 15), rng.range(-w + 0.8, w - 0.8));
      len += 10;
    }
    return alone ? len + speedAt(s) * 0.9 : len;
  }

  const OBST = {
    0: { low: ['wetfloor', 'backpacks', 'skateboard'], lowWall: 'hedgeRow', banner: 'clubBanner', tall: ['lamp', 'bikeRack', 'trashcan', 'sign'] },
    1: { low: ['cone', 'backpacks', 'barrier'], lowWall: 'barrierRow', banner: 'beam', tall: ['lamp', 'portapotty', 'crates', 'sign'] },
    2: { low: ['wetfloor', 'crates', 'cone'], lowWall: 'planterRow', banner: 'clubBanner', tall: ['lamp', 'crates', 'trashcan', 'bikeRack'] },
  };

  const addObstacle = (world, o) => {
    world.obstacles.push({ id: objId++, hit: false, vs: 0, vd: 0, ...o });
  };

  const addRider = (world, r) => {
    world.plannedRiders.push({ id: objId++, amp: 0, freq: 0, phase: rng.range(0, 6.28), needsCan: false, ...r });
  };

  // oncoming rider meeting the runner around `meet`
  function oncoming(world, meet, d, opts = {}) {
    const vr = opts.vr ?? rng.range(lerp(6, 9.5, difficultyAt(meet)), lerp(8, 12, difficultyAt(meet)));
    const spawn = Math.min(meet + vr * RIDER.leadTime, opts.maxSpawn ?? cur.s1 - 6);
    addRider(world, { kind: 'oncoming', meet, s: spawn, d, vs: -vr, minS: opts.minS ?? Math.max(cur.s0 + 2, meet - 60), maxS: spawn + 1, amp: opts.amp ?? rng.range(0.1, 0.35), freq: rng.range(0.8, 1.6), ...opts.extra });
  }

  const BEATS = {
    pizzaLine(world, s, room, w, yAtS) {
      const len = Math.min(room, rng.range(22, 34));
      const d0 = rng.range(-w + 1, w - 1);
      const amp = rng.chance(0.5) ? rng.range(1, Math.min(2.6, w - 1)) : 0;
      const f = rng.range(0.06, 0.12);
      pizzaLine(world, s, s + len, x => clamp(d0 + amp * Math.sin((x - s) * f), -w + 0.8, w - 0.8), x => yAtS(x) + 1);
      if (s > 220 && rng.chance(0.18)) powerUp(world, s + len * 0.6, clamp(d0, -w + 1, w - 1), yAtS(s + len * 0.6));
      return len;
    },
    low1(world, s, room, w, yAtS, stage) {
      const half = rng.range(0.85, 1.35);
      const d = rng.range(-w + half + 0.4, w - half - 0.4);
      addObstacle(world, { kind: 'low', model: rng.pick(OBST[stage].low), s, d, hw: half, hd: 0.45, h: 0.75, y: yAtS(s) });
      // pizza arc over it
      arcOver(world, s, d, yAtS);
      return 4;
    },
    lowWall(world, s, room, w, yAtS, stage) {
      addObstacle(world, { kind: 'low', model: OBST[stage].lowWall, s, d: 0, hw: w, hd: 0.5, h: 0.85, y: yAtS(s) });
      arcOver(world, s, rng.range(-w + 1.2, w - 1.2), yAtS);
      return 5;
    },
    banner(world, s, room, w, yAtS, stage) {
      addObstacle(world, { kind: 'high', model: OBST[stage].banner, s, d: 0, hw: w, hd: 0.35, clear: 1.05, top: 2.6, y: yAtS(s) });
      const d = rng.range(-w + 1.2, w - 1.2);
      pizzaLine(world, s - 6, s + 4, () => d, x => yAtS(x) + 0.45, 2);
      return 6;
    },
    tallPair(world, s, room, w, yAtS, stage) {
      const gapW = rng.range(2.8, 3.6);
      const gc = rng.range(-w + gapW / 2 + 0.2, w - gapW / 2 - 0.2);
      const lEdge = gc - gapW / 2;
      const rEdge = gc + gapW / 2;
      const model = rng.pick(OBST[stage].tall);
      if (lEdge + w > 0.9) fillTall(world, s, -w, lEdge, model, yAtS(s));
      if (w - rEdge > 0.9) fillTall(world, s, rEdge, w, model, yAtS(s));
      pizzaLine(world, s - 8, s + 6, () => gc, x => yAtS(x) + 1, 2.2);
      return 5;
    },
    slalom(world, s, room, w, yAtS, stage) {
      const n = 3;
      const step = rng.range(10, 13);
      let side = rng.sign();
      const model = rng.pick(OBST[stage].tall);
      for (let i = 0; i < n; i++) {
        const ss = s + i * step;
        const block = w * rng.range(0.95, 1.15);
        // blocks one side up to past the centre, leaving > 2.8 m on the other
        if (side < 0) fillTall(world, ss, -w, -w + block, model, yAtS(ss));
        else fillTall(world, ss, w - block, w, model, yAtS(ss));
        const free = side < 0 ? (-w + block + w) / 2 : (-w + w - block) / 2;
        pizzaLine(world, ss - 3, ss + 3, () => free, x => yAtS(x) + 1, 2);
        side = -side;
      }
      return (n - 1) * step + 4;
    },
    queue(world, s, room, w, yAtS) {
      // food truck queue: a line of students across part of the path
      const side = rng.sign();
      const cover = w * 2 * rng.range(0.5, 0.65);
      const from = side < 0 ? -w : w - cover;
      const n = Math.max(2, Math.floor(cover / 0.75));
      for (let i = 0; i < n; i++) {
        const d = from + 0.4 + i * (cover - 0.8) / Math.max(1, n - 1);
        addObstacle(world, { kind: 'tall', model: 'student', s: s + rng.range(-0.3, 0.3), d, hw: 0.32, hd: 0.32, y: yAtS(s), seed: rng.int(1, 1e6) });
      }
      const free = side < 0 ? (from + cover + w) / 2 : (-w + from) / 2;
      pizzaLine(world, s - 7, s + 5, () => free, x => yAtS(x) + 1, 2.2);
      return 5;
    },
    tour(world, s, room, w, yAtS) {
      // tour group walking toward you, guide walking backwards
      const gc = rng.range(-w + 1.6, w - 1.6);
      const members = [[0, 0], [-0.8, 1], [0.8, 1], [0, 1.9], [-0.5, 2.8]];
      for (const [dd, ds] of members) {
        addObstacle(world, { kind: 'tall', model: 'tourist', s: s + 8 + ds, d: clamp(gc + dd, -w + 0.4, w - 0.4), hw: 0.32, hd: 0.32, vs: -1.3, y: yAtS(s), seed: rng.int(1, 1e6) });
      }
      const free = gc > 0 ? (-w + gc - 1.3) / 2 : (gc + 1.3 + w) / 2;
      pizzaLine(world, s, s + 12, () => free, x => yAtS(x) + 1, 2.4);
      return 14;
    },
    goose(world, s, room, w, yAtS) {
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        addObstacle(world, { kind: 'low', model: 'goose', s: s + i * 2.5, d: rng.range(-w + 0.8, w - 0.8), hw: 0.38, hd: 0.4, h: 0.7, y: yAtS(s), chase: 1.5 + i * 0.3 });
      }
      return 6 + n * 2.5;
    },
    robot(world, s, room, w, yAtS) {
      const dir = rng.sign();
      addObstacle(world, { kind: 'low', model: 'robot', s: s + 4, d: -dir * (w - 0.6), hw: 0.38, hd: 0.45, h: 0.72, vd: dir * 1.8, y: yAtS(s), minD: -w + 0.5, maxD: w - 0.5 });
      return 8;
    },
    oncoming(world, s, room, w) {
      oncoming(world, s + 4, rng.range(-w + 0.8, w - 0.8));
      return 8;
    },
    oncoming2(world, s, room, w) {
      const a = rng.range(-w + 0.8, -0.6);
      const b = rng.range(0.6, w - 0.8);
      const first = rng.chance(0.5);
      oncoming(world, s + 4, first ? a : b);
      oncoming(world, s + 4 + rng.range(9, 14), first ? b : a);
      return 20;
    },
    weaver(world, s, room, w) {
      const vs = speedAt(s) * rng.range(0.38, 0.48);
      addRider(world, { kind: 'weaver', s: s + 22, d: 0, vs, minS: s, maxS: s + Math.min(room, 140), amp: Math.min(w - 1, rng.range(1.6, 2.6)), freq: rng.range(0.9, 1.4) });
      return 20;
    },
    drifter(world, s, room, w) {
      const from = rng.sign() * (w - 0.7);
      addRider(world, { kind: 'drifter', s: s + 10, d: from, vs: -rng.range(2, 3.5), minS: Math.max(cur.s0 + 2, s - 40), maxS: s + 12, drift: { to: -from, speed: rng.range(3.4, 4.6) } });
      return 12;
    },
    pack(world, s, room, w) {
      const n = w > 4.6 ? 4 : 3;
      const slots = [];
      for (let i = 0; i < n + 1; i++) slots.push(-w + 0.8 + (i * (2 * w - 1.6)) / n);
      const gap = rng.int(0, n);
      const vr = rng.range(lerp(6, 9, difficultyAt(s)), lerp(7, 10, difficultyAt(s)));
      slots.forEach((d, i) => {
        if (i === gap) return;
        oncoming(world, s + 6 + rng.range(-0.6, 0.6), d, { vr, amp: 0.05 });
      });
      return 14;
    },
    combo(world, s, room, w, yAtS, stage) {
      // a wall to jump with a rider right behind it
      BEATS.lowWall(world, s, room, w, yAtS, stage);
      oncoming(world, s + 14, rng.range(-w + 0.8, w - 0.8));
      return 18;
    },
  };

  function fillTall(world, s, from, to, model, y) {
    const n = Math.max(1, Math.round((to - from) / 1.3));
    const step = (to - from) / n;
    for (let i = 0; i < n; i++) {
      const c = from + step * (i + 0.5);
      addObstacle(world, { kind: 'tall', model, s, d: c, hw: step / 2, hd: 0.35, y });
    }
  }

  function arcOver(world, s, d, yAtS) {
    const v = speedAt(s);
    const reach = v * AIR_SINGLE;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const ss = s - reach * 0.5 + reach * t;
      const k = 4 * t * (1 - t);
      world.pickups.push({ id: objId++, kind: 'pizza', s: ss, d, y: yAtS(s) + 0.9 + k * 1.5, taken: false });
    }
  }

  // --------------------------------------------------------------- crossing
  function availableCross(s, stage) {
    const W = [
      ['bridge', [3, 1, 1][stage]],
      ['gap', [2, 2, 2][stage]],
      ['stones', [2, 1, 1.5][stage]],
      ['doubleGap', [0.8, 1.5, 1.5][stage]],
      ['narrow', [1, 1.5, 1.2][stage]],
      ['broken', [0, 2, 1.2][stage]],
      ['drop', [0, 2, 1.4][stage]],
      ['collapse', [0, 2, 1.6][stage]],
      ['bounce', [0, 0, 2.2][stage]],
    ];
    return W.filter(([k]) => s >= CROSS_UNLOCK[k]);
  }

  function crossing(world) {
    const s0 = state.genS;
    const stage = stageAt(s0);
    let type = state.sections === 1 ? 'bridge' : rng.weighted(availableCross(s0, stage));
    // keep heights in a sensible band
    if (type === 'drop' && state.y < -10) type = stage === 2 ? 'bounce' : 'gap';
    seenCross.add(type);
    const v = speedAt(s0) * 0.92;
    const prevW = world.segments[world.segments.length - 1].w;
    const y0 = state.y;
    const seg = { id: segId++, kind: 'crossing', type, s0, stage, y0, padIds: [], seed: rng.int(1, 1e9) };
    const pad = p => {
      const created = world.surfaces.addPad(p);
      seg.padIds.push(created.id);
      return created;
    };
    let len;
    let y1 = y0;

    switch (type) {
      case 'bridge':
      case 'narrow': {
        const narrow = type === 'narrow';
        len = Math.round(rng.range(22, narrow ? 34 : 44));
        const hw = narrow ? 1.25 : rng.range(2.1, 2.6);
        const slope = narrow ? 0 : rng.chance(0.4) ? rng.range(-1.2, 1.2) : 0;
        y1 = y0 + slope;
        pad({ s0, s1: s0 + len, dl: -hw, dr: hw, y0, y1, kind: 'bridge' });
        world.surfaces.addWall({ s0, s1: s0 + len, dl: -hw, dr: hw });
        seg.w = hw;
        if (narrow) {
          // a vending machine just before guarantees cans; the rider only spawns if you have one
          world.vending.push({ id: objId++, s: s0 - 34, side: rng.sign(), w: prevW, y: y0, used: false });
          oncoming(world, s0 + len * 0.45, 0, { vr: rng.range(5, 7), amp: 0, minS: s0 - 30, maxSpawn: s0 + len - 2, extra: { needsCan: true } });
          // pizza down the middle
          pizzaLine(world, s0 + 2, s0 + len - 2, () => 0, x => y0 + 1, 2.6);
        } else {
          pizzaLine(world, s0 + 3, s0 + len - 3, x => Math.sin(x * 0.2) * (hw - 0.7), x => y0 + (y1 - y0) * ((x - s0) / len) + 1, 2.4);
        }
        break;
      }
      case 'gap':
      case 'doubleGap':
      case 'drop': {
        const dh = type === 'drop' ? -rng.range(4.5, 8) : type === 'doubleGap' ? rng.range(-1.5, 0.3) : rng.range(-1.6, 0.6);
        const single = jumpReach(v, dh);
        let gl;
        if (type === 'doubleGap') gl = clamp(single * rng.range(1.15, 1.3), single + 1.5, v * AIR_DOUBLE * 0.72);
        else gl = Math.max(2.6, single * rng.range(0.42, 0.62));
        len = Math.round(gl * 10) / 10;
        y1 = y0 + dh;
        seg.dh = dh;
        seg.w = prevW;
        // pizza arc across
        const n = Math.max(4, Math.round(len / 1.6));
        const d = rng.range(-1.5, 1.5);
        for (let i = 1; i < n; i++) {
          const t = i / n;
          world.pickups.push({ id: objId++, kind: 'pizza', s: s0 + len * t, d, y: y0 + (y1 - y0) * t + 1.2 + 4 * t * (1 - t) * (type === 'doubleGap' ? 2.6 : 1.4), taken: false });
        }
        break;
      }
      case 'stones': {
        // one full jump per stone: pitch ≈ jump reach, stones long enough to land on
        // any take-off in the back two thirds of a stone lands on the next one
        const n = rng.int(3, 4);
        const R = jumpReach(v, 0);
        const stoneL = Math.max(3.6, R * 0.75);
        const gapL = Math.max(2.2, R * 0.35);
        let s = s0;
        let d = 0;
        seg.stones = [];
        for (let i = 0; i < n; i++) {
          s += gapL;
          d = clamp(d + rng.range(-1, 1), -1.5, 1.5);
          pad({ s0: s, s1: s + stoneL, dl: d - 1.4, dr: d + 1.4, y0, y1: y0, kind: 'stone' });
          seg.stones.push({ s0: s, s1: s + stoneL, d });
          world.pickups.push({ id: objId++, kind: 'pizza', s: s + stoneL * 0.4, d, y: y0 + 1, taken: false });
          s += stoneL;
        }
        s += gapL;
        len = s - s0;
        seg.w = 2.5;
        break;
      }
      case 'broken': {
        len = Math.round(rng.range(30, 42));
        const hw = rng.range(1.9, 2.4);
        const holes = rng.int(1, 2);
        let s = s0;
        const holeL = clamp(jumpReach(v, 0) * 0.4, 2.2, 6);
        const plank = (len - holes * holeL) / (holes + 1);
        seg.holes = [];
        for (let i = 0; i <= holes; i++) {
          pad({ s0: s, s1: s + plank, dl: -hw, dr: hw, y0, y1: y0, kind: 'bridge' });
          s += plank;
          if (i < holes) {
            seg.holes.push({ s0: s, s1: s + holeL });
            arcOverGap(world, s, holeL, y0);
            s += holeL;
          }
        }
        world.surfaces.addWall({ s0, s1: s0 + len, dl: -hw, dr: hw });
        seg.w = hw;
        break;
      }
      case 'collapse': {
        len = Math.round(rng.range(26, 38));
        const hw = rng.range(1.9, 2.3);
        const plank = 3.2;
        for (let s = s0; s < s0 + len - 0.01; s += plank) {
          pad({ s0: s, s1: Math.min(s0 + len, s + plank), dl: -hw, dr: hw, y0, y1: y0, kind: 'collapse', delay: 0.42 });
        }
        world.surfaces.addWall({ s0, s1: s0 + len, dl: -hw, dr: hw });
        pizzaLine(world, s0 + 2, s0 + len - 2, () => 0, () => y0 + 1, 2.2);
        seg.w = hw;
        break;
      }
      case 'bounce': {
        // last 3 m of the previous section become a launch strip
        const dh = state.y < -6 ? rng.range(2, 5) : rng.range(-1, 4);
        const gl = rng.range(16, 24);
        const T = gl / v + 0.15;
        const launch = (RUN.gravity * T) / 2 + dh / T;
        pad({ s0: s0 - 3, s1: s0, dl: -prevW, dr: prevW, y0, y1: y0, kind: 'bounce', launch });
        len = Math.round(gl);
        y1 = y0 + dh;
        seg.dh = dh;
        seg.w = prevW;
        const n = 9;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const vy = launch;
          const tt = t * T;
          world.pickups.push({ id: objId++, kind: 'pizza', s: s0 + len * t, d: 0, y: y0 + vy * tt - 0.5 * RUN.gravity * tt * tt + 0.9, taken: false });
        }
        break;
      }
      default:
        len = 10;
    }

    seg.s1 = s0 + len;
    seg.y1 = y1;
    world.segments.push(seg);
    world.track.add(len, 0);
    state.y = y1;
    state.genS = s0 + len;
    state.lastCross = type;
  }

  function arcOverGap(world, s, len, y) {
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      world.pickups.push({ id: objId++, kind: 'pizza', s: s + len * t, d: 0, y: y + 1.2 + 4 * t * (1 - t) * 1.2, taken: false });
    }
  }

  return { generateUntil, state };
}

export { BEAT_UNLOCK, CROSS_UNLOCK, jumpReach };
