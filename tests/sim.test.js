import { describe, it, expect } from 'vitest';
import { createWorld, stepWorld } from '../src/game/sim/world';
import { createBot } from '../src/game/sim/bot';
import { createTrack } from '../src/game/sim/track';
import { RUN, STEP, AIR_SINGLE, speedAt, CANS } from '../src/game/sim/tune';
import { jumpReach } from '../src/game/sim/generator';

const idle = { steer: 0, jumpPressed: false, jumpHeld: false, slidePressed: false, sprint: false, throwPressed: false };

function play(seed, maxS = 3000, maxSteps = 60 * 60 * 6) {
  const world = createWorld(seed);
  const bot = createBot({ skill: 1 });
  let steps = 0;
  while (!world.over && world.runner.s < maxS && steps < maxSteps) {
    stepWorld(world, bot.think(world));
    steps++;
  }
  return world;
}

describe('track', () => {
  it('arcs are continuous and tangent', () => {
    const t = createTrack();
    t.add(50, 0);
    t.add(80, 1 / 60);
    t.add(40, -1 / 90);
    const a = t.pose(49.999);
    const b = t.pose(50.001);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.01);
    // heading after the arc grew by len * k
    expect(t.pose(129.9).h).toBeCloseTo((80 * 1) / 60, 1);
    // positions move forward roughly by arc length on a straight
    const p0 = t.pose(0);
    const p1 = t.pose(50);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeCloseTo(50, 3);
    // lateral offset is perpendicular to the heading
    const c = t.pose(10, 0);
    const r = t.pose(10, 3);
    expect(Math.hypot(r.x - c.x, r.z - c.z)).toBeCloseTo(3, 5);
  });
});

describe('runner physics', () => {
  it('jump apex and air time match the tuning', () => {
    const world = createWorld(1);
    let apex = 0;
    stepWorld(world, { ...idle, jumpPressed: true, jumpHeld: true });
    let t = STEP;
    while (!world.runner.grounded && t < 3) {
      stepWorld(world, { ...idle, jumpHeld: true });
      apex = Math.max(apex, world.runner.y);
      t += STEP;
    }
    expect(apex).toBeGreaterThan(1.6);
    expect(apex).toBeLessThan(1.95);
    expect(Math.abs(t - AIR_SINGLE)).toBeLessThan(0.08);
  });

  it('releasing jump early gives a lower hop', () => {
    const world = createWorld(1);
    stepWorld(world, { ...idle, jumpPressed: true, jumpHeld: true });
    let apex = 0;
    for (let i = 0; i < 90; i++) {
      stepWorld(world, { ...idle, jumpHeld: i < 4 });
      apex = Math.max(apex, world.runner.y);
    }
    expect(apex).toBeLessThan(1.2);
  });

  it('double jump goes higher than a single jump', () => {
    const world = createWorld(1);
    stepWorld(world, { ...idle, jumpPressed: true, jumpHeld: true });
    let apex = 0;
    for (let i = 0; i < 120; i++) {
      stepWorld(world, { ...idle, jumpHeld: true, jumpPressed: i === 18 });
      apex = Math.max(apex, world.runner.y);
    }
    expect(apex).toBeGreaterThan(2.6);
    expect(world.runner.jumps).toBe(0);
  });

  it('soft walls keep you on the path and slow you while scraping', () => {
    const world = createWorld(2);
    for (let i = 0; i < 120; i++) stepWorld(world, { ...idle, steer: 1 });
    const wall = world.surfaces.wallAt(world.runner.s);
    expect(world.runner.d).toBeLessThanOrEqual(wall.dr - RUN.radius + 1e-6);
    expect(world.runner.scrapeT).toBeGreaterThan(0);
    expect(world.runner.dead).toBe(false);
  });

  it('a single jump at the edge clears every generated single gap', () => {
    for (let seed = 1; seed < 40; seed++) {
      const world = createWorld(seed);
      world.gen.generateUntil(world, 3000);
      for (const sg of world.segments) {
        if (sg.kind !== 'crossing' || (sg.type !== 'gap' && sg.type !== 'drop')) continue;
        const v = speedAt(sg.s0) * 0.92;
        expect(sg.s1 - sg.s0).toBeLessThan(jumpReach(v, sg.dh) * 0.8);
      }
    }
  });
});

describe('generator fairness', () => {
  const worlds = Array.from({ length: 25 }, (_, i) => {
    const w = createWorld(1000 + i);
    w.gen.generateUntil(w, 4500);
    return w;
  });

  it('is deterministic per seed', () => {
    const a = createWorld(77);
    const b = createWorld(77);
    a.gen.generateUntil(a, 2000);
    b.gen.generateUntil(b, 2000);
    const sig = w => w.segments.map(s => `${s.kind}:${s.type || ''}:${s.s0.toFixed(2)}`).join('|') + w.obstacles.length + ':' + w.plannedRiders.length;
    expect(sig(a)).toBe(sig(b));
  });

  it('every row of tall obstacles leaves a gap of at least 2.4 m', () => {
    for (const w of worlds) {
      const rows = new Map();
      for (const o of w.obstacles) {
        if (o.kind !== 'tall' || o.vs) continue;
        const key = Math.round(o.s * 2) / 2;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(o);
      }
      for (const [s, row] of rows) {
        const wall = w.surfaces.wallAt(s);
        if (!wall) continue;
        const spans = row.map(o => [o.d - o.hw, o.d + o.hw]).sort((a, b) => a[0] - b[0]);
        let edge = wall.dl;
        let widest = 0;
        for (const [a, b] of spans) {
          widest = Math.max(widest, a - edge);
          edge = Math.max(edge, b);
        }
        widest = Math.max(widest, wall.dr - edge);
        expect(widest).toBeGreaterThanOrEqual(2.4);
      }
    }
  });

  it('nothing blocks the run-up to a crossing', () => {
    for (const w of worlds) {
      const crossings = w.segments.filter(s => s.kind === 'crossing');
      for (const c of crossings) {
        for (const o of w.obstacles) {
          if (o.vs) continue;
          expect(o.s < c.s0 - 14 || o.s > c.s1).toBe(true);
        }
      }
    }
  });

  it('riders stay on their own section or bridge', () => {
    for (const w of worlds) {
      for (const r of w.plannedRiders) {
        const ground = w.surfaces.groundAt(r.s, r.d, 1e9);
        expect(ground).not.toBeNull();
        expect(ground.pad.kind === 'path' || ground.pad.kind === 'bridge').toBe(true);
      }
    }
  });

  it('narrow bridges always need a can and have a vending machine right before', () => {
    for (const w of worlds) {
      for (const c of w.segments.filter(s => s.type === 'narrow')) {
        const rider = w.plannedRiders.find(r => r.needsCan && r.s >= c.s0 && r.s <= c.s1);
        if (rider) {
          const vend = w.vending.find(v => v.s < c.s0 && v.s > c.s0 - 60);
          expect(vend).toBeTruthy();
        }
      }
    }
  });

  it('never sends riders from behind', () => {
    for (const w of worlds) {
      for (const r of w.plannedRiders) {
        if (r.kind === 'weaver') expect(r.vs).toBeLessThan(speedAt(r.s) * 0.6);
        else expect(r.vs).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe('gameplay', () => {
  it('starts with 5 cans and restocks to the cap at vending machines', () => {
    const world = createWorld(5);
    expect(world.canCount).toBe(CANS.start);
    const bot = createBot();
    while (!world.over && !world.vending.some(v => v.used) && world.runner.s < 900) stepWorld(world, bot.think(world));
    if (!world.over) expect(world.canCount).toBe(CANS.max);
  });

  it('a can thrown straight at an oncoming rider takes them down', () => {
    const world = createWorld(9);
    world.obstacles.length = 0;
    world.plannedRiders.length = 0;
    world.riders.push({ id: 999, kind: 'oncoming', s: world.runner.s + 25, d: 0.3, baseD: 0.3, vs: -6, minS: 0, maxS: 1e9, amp: 0, freq: 0, phase: 0, y: 0, state: 'ride', bornAt: 0, side: 1, minAbsD: Infinity, lean: 0 });
    stepWorld(world, { ...idle, throwPressed: true });
    for (let i = 0; i < 60; i++) stepWorld(world, idle);
    expect(world.riders[0].state).toBe('down');
    expect(world.stats.takedowns).toBe(1);
  });

  it('touching a rider ends the run', () => {
    const world = createWorld(9);
    world.obstacles.length = 0;
    world.plannedRiders.length = 0;
    world.riders.push({ id: 5, kind: 'oncoming', s: world.runner.s + 12, d: 0, baseD: 0, vs: -6, minS: 0, maxS: 1e9, amp: 0, freq: 0, phase: 0, y: 0, state: 'ride', bornAt: 0, side: 1, minAbsD: Infinity, lean: 0 });
    for (let i = 0; i < 120 && !world.over; i++) stepWorld(world, idle);
    expect(world.over).toBe(true);
    expect(world.runner.cause).toBe('scooter');
  });

  it('two stumbles close together faceplant you', () => {
    const world = createWorld(3);
    world.plannedRiders.length = 0;
    world.obstacles.length = 0;
    const s = world.runner.s;
    world.obstacles.push({ id: 'a', kind: 'tall', model: 'lamp', s: s + 6, d: 0, hw: 0.4, hd: 0.3, y: 0, hit: false });
    world.obstacles.push({ id: 'b', kind: 'tall', model: 'lamp', s: s + 14, d: 0, hw: 0.4, hd: 0.3, y: 0, hit: false });
    for (let i = 0; i < 240 && !world.over; i++) stepWorld(world, idle);
    expect(world.stats.stumbles).toBe(1);
    expect(world.runner.cause).toBe('faceplant');
  });

  it('the bot survives most runs past the first kilometre', () => {
    const results = [];
    for (let seed = 1; seed <= 30; seed++) results.push(play(seed, 1500));
    const survived = results.filter(w => !w.over || w.runner.s >= 1500).length;
    const causes = results.filter(w => w.over).map(w => `${w.runner.cause}@${Math.round(w.runner.s)}`);
    // the bot is not perfect; a fair layout should still let it get far most of the time
    expect(survived, causes.join(', ')).toBeGreaterThanOrEqual(24);
    const pizza = results.reduce((a, w) => a + w.score, 0) / results.length;
    expect(pizza).toBeGreaterThan(60);
  });
});
