import { RUN } from './tune';
import { runnerHeight } from './runner';

// A rule-based player. Reads the simulation directly and produces the same
// input object the keyboard / touch controls do. Used for the attract-mode
// run behind the sign-in screen and by the fairness tests.
//
// `skill` 0..1 adds reaction noise and occasional misses so the attract run
// looks human; tests use skill 1.

export function createBot({ skill = 1, rng = Math.random, showOff = false } = {}) {
  let jumpHeld = false;
  let lastThrow = -10;

  function predictLanding(world) {
    // integrate the current arc and see if it lands on anything
    const r = world.runner;
    let s = r.s;
    let d = r.d;
    let y = r.y;
    let vy = r.vy;
    const dt = 1 / 30;
    for (let i = 0; i < 90; i++) {
      s += r.speed * dt;
      d += r.vd * dt * 0.4;
      vy -= RUN.gravity * dt;
      const ny = y + vy * dt;
      if (vy <= 0) {
        const g = world.surfaces.groundAt(s, d, Math.max(y, ny) + 0.05);
        if (g && ny <= g.h) return { landed: true, s, h: g.h };
      }
      y = ny;
      if (y < r.y - 12) break;
    }
    return { landed: false };
  }

  function corridorAt(world, s) {
    const w = world.surfaces.wallAt(s);
    if (w) return [w.dl + 0.45, w.dr - 0.45];
    // no walls (gaps, stones): use the next pad ahead
    const p = nextPad(world, s);
    return p ? [p.dl + 0.5, p.dr - 0.5] : [-2, 2];
  }

  function nextPad(world, s) {
    let best = null;
    for (const p of world.surfaces.pads) {
      if (p.gone || p.s1 < s) continue;
      if (!best || p.s0 < best.s0) best = p;
    }
    return best;
  }

  function think(world) {
    const r = world.runner;
    const inp = { steer: 0, jumpPressed: false, jumpHeld: false, slidePressed: false, sprint: false, throwPressed: false, throwTarget: null };
    if (r.dead) return inp;
    const v = r.speed;
    const look = v * 1.7 + 10;
    const [lo, hi] = corridorAt(world, r.s + Math.min(8, v * 0.4));

    // ---- choose a lateral line
    let best = r.d;
    let bestCost = Infinity;
    let riderPressure = 0;
    for (let d = lo; d <= hi + 1e-6; d += 0.3) {
      let cost = Math.abs(d - r.d) * 0.12;
      for (const o of world.obstacles) {
        if (o.hit) continue;
        const ds = o.s - r.s;
        if (ds < -0.5 || ds > look) continue;
        const near = Math.abs(d - o.d) < o.hw + 0.6;
        if (!near) continue;
        const wgt = ds < v * 0.6 ? 2 : 1;
        if (o.kind === 'tall') cost += 60 * wgt;
        else if (o.kind === 'low' && o.hw < 2) cost += 4;
      }
      for (const rd of world.riders) {
        if (rd.state !== 'ride') continue;
        const ds = rd.s - r.s;
        if (ds < -1 || ds > v * 4) continue;
        const closing = v - rd.vs;
        const tm = closing > 0.1 ? ds / closing : 9;
        let pd = rd.d;
        let band = 1.25;
        if (rd.kind === 'weaver') {
          pd = rd.baseD;
          band = rd.amp + 1.1;
        } else if (rd.kind === 'drifter') {
          pd = rd.d + Math.sign(rd.drift.to - rd.d) * Math.min(Math.abs(rd.drift.to - rd.d), rd.drift.speed * tm);
          band = 1.4;
        }
        if (Math.abs(d - pd) < band) {
          const c = tm < 2.8 ? 90 : 25;
          cost += c;
          if (Math.abs(r.d - pd) < band) riderPressure = Math.max(riderPressure, c);
        }
      }
      for (const p of world.pickups) {
        if (p.taken) continue;
        const ds = p.s - r.s;
        if (ds < 0 || ds > v * 1.3) continue;
        if (Math.abs(d - p.d) < 0.55) cost -= p.kind === 'pizza' ? 1.4 : 4;
      }
      // stay over something you can land on
      const ahead = r.s + Math.max(3, v * 0.35);
      const support = world.surfaces.groundAt(ahead, d, r.y + 1.5);
      if (!support) {
        const np = nextPad(world, ahead);
        if (np && (d < np.dl + 0.3 || d > np.dr - 0.3)) cost += 30;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = d;
      }
    }
    const noise = skill < 1 ? (rng() - 0.5) * (1 - skill) * 0.8 : 0;
    inp.steer = Math.max(-1, Math.min(1, (best + noise - r.d) * 2));

    // ---- throw at a rider we can't comfortably get around
    const unlimited = world.power.sixpack > 0;
    if ((world.canCount > 0 || unlimited) && world.t - lastThrow > 0.5) {
      for (const rd of world.riders) {
        if (rd.state !== 'ride') continue;
        const ds = rd.s - r.s;
        if (ds < 10 || ds > 40) continue;
        const lined = Math.abs(rd.d - r.d) < 0.75 + ds * 0.04;
        const blocked = riderPressure >= 90 || bestCost > 40;
        if (lined && (blocked || (showOff && rng() < 0.02) || unlimited)) {
          inp.throwPressed = true;
          lastThrow = world.t;
          break;
        }
        // boxed in by a rider off to the side: aim at them directly, like a tap
        if (blocked && Math.abs(rd.d - r.d) < 3.5) {
          inp.throwPressed = true;
          inp.throwTarget = rd.id;
          lastThrow = world.t;
          break;
        }
      }
    }

    // ---- jumping
    if (r.grounded) {
      let jump = false;
      // edge ahead
      const edgeS = r.s + v * 0.09 + 0.3;
      const ground = world.surfaces.groundAt(edgeS, r.d, r.y + RUN.stepUp);
      if (!ground || ground.h < r.y - 1.2) jump = true;
      // collapsing plank under foot: keep moving (no action needed)
      // low obstacle in our line
      for (const o of world.obstacles) {
        if (o.hit || o.kind !== 'low') continue;
        const ds = o.s - r.s;
        if (ds < v * 0.2 || ds > v * 0.34) continue;
        if (Math.abs(o.d - r.d) < o.hw + 0.45) jump = true;
      }
      // a higher pad ahead: hop up
      const up = world.surfaces.anyPadAt(r.s + v * 0.3, r.d, 0.2);
      if (up && up.y0 > r.y + RUN.stepUp && up.s0 > r.s) jump = true;
      if (jump && (skill >= 1 || rng() > (1 - skill) * 0.05)) {
        inp.jumpPressed = true;
        jumpHeld = true;
      }
      // slide under banners
      for (const o of world.obstacles) {
        if (o.hit || o.kind !== 'high') continue;
        const ds = o.s - r.s;
        if (ds < 0 || ds > v * 0.24 + 0.5) continue;
        if (Math.abs(o.d - r.d) < o.hw + 0.4) inp.slidePressed = true;
      }
    } else {
      // airborne: double jump if the arc lands in the void
      if (r.jumps < 2 && r.vy < 2.5) {
        const land = predictLanding(world);
        if (!land.landed) {
          inp.jumpPressed = true;
          jumpHeld = true;
        }
      }
      // falling onto a banner? fast-fall + slide
      for (const o of world.obstacles) {
        if (o.hit || o.kind !== 'high') continue;
        const ds = o.s - r.s;
        if (ds < 0 || ds > v * 0.2) continue;
        if (Math.abs(o.d - r.d) < o.hw + 0.4 && r.y - o.y + runnerHeight(r) > o.clear && r.y - o.y < 0.9) inp.slidePressed = true;
      }
    }
    if (!r.grounded && r.vy <= 0 && !inp.jumpPressed) jumpHeld = false;
    inp.jumpHeld = jumpHeld;
    return inp;
  }

  return { think };
}
