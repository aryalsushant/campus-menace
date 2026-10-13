import { RUN, POWER, speedAt } from './tune';

export function createRunner(s = 4) {
  return {
    s,
    d: 0,
    y: 0,
    vy: 0,
    vd: 0,
    speed: speedAt(s),
    grounded: true,
    pad: null,
    groundH: 0,
    coyote: 0,
    buffer: 0,
    jumps: 0,
    canCut: false,
    slideT: 0,
    slideCd: 0,
    slideQueued: false,
    stumbleT: 0,
    shakenT: 0,
    invT: 0,
    graceT: 0,
    scrapeT: 0,
    scrapeSide: 0,
    airT: 0,
    dead: false,
    cause: null,
    prevS: s,
    prevD: 0,
    prevY: 0,
  };
}

const approach = (v, target, max) => (v < target ? Math.min(target, v + max) : Math.max(target, v - max));

// One fixed step. `inp` = { steer -1..1, jumpPressed, jumpHeld, slidePressed, sprint }.
// `w` provides surfaces, time, power-up timers and the event sink.
export function stepRunner(r, inp, w, dt) {
  if (r.dead) return;
  const { surfaces, emit } = w;
  r.prevS = r.s;
  r.prevD = r.d;
  r.prevY = r.y;

  r.slideCd = Math.max(0, r.slideCd - dt);
  r.stumbleT = Math.max(0, r.stumbleT - dt);
  r.shakenT = Math.max(0, r.shakenT - dt);
  r.invT = Math.max(0, r.invT - dt);
  r.graceT = Math.max(0, (r.graceT || 0) - dt);
  r.scrapeT = Math.max(0, r.scrapeT - dt);
  r.buffer = Math.max(0, r.buffer - dt);
  if (r.slideT > 0) {
    r.slideT -= dt;
    if (r.slideT <= 0) {
      r.slideT = 0;
      r.slideCd = RUN.slideCooldown;
    }
  }

  // ---- forward speed
  const base = speedAt(r.s);
  let target = base * (inp.sprint ? RUN.sprintMul : 1);
  if (w.power.coffee > 0) target *= POWER.coffeeMul;
  if (r.stumbleT > 0) target *= RUN.stumbleMul;
  if (r.scrapeT > 0) target *= RUN.scrapeMul;
  r.speed = approach(r.speed, target, (target > r.speed ? RUN.speedAccel : 30) * dt);

  // ---- lateral steering
  const steer = Math.max(-1, Math.min(1, inp.steer || 0));
  const latMax = RUN.latMax(base);
  r.vd = approach(r.vd, steer * latMax, (r.grounded ? RUN.latAccelGround : RUN.latAccelAir) * dt);

  // ---- jump / double jump / buffer
  if (r.grounded) r.coyote = RUN.coyote;
  else r.coyote = Math.max(0, r.coyote - dt);

  const groundJump = () => {
    r.vy = RUN.jumpV;
    r.grounded = false;
    r.coyote = 0;
    r.jumps = 1;
    r.canCut = true;
    r.buffer = 0;
    r.slideT = 0;
    r.slideQueued = false;
    r.airT = 0;
    emit('jump', { s: r.s, d: r.d, y: r.y });
  };

  if (inp.jumpPressed) {
    if ((r.grounded || r.coyote > 0) && r.jumps === 0) groundJump();
    else if (r.jumps < 2) {
      r.vy = Math.max(r.vy, RUN.doubleJumpV);
      r.jumps = 2;
      r.canCut = true;
      r.slideQueued = false;
      emit('doubleJump', { s: r.s, d: r.d, y: r.y });
    } else r.buffer = RUN.buffer;
  }
  if (!inp.jumpHeld && r.canCut && r.vy > 3) {
    r.vy *= RUN.jumpCut;
    r.canCut = false;
  }
  if (r.vy <= 0) r.canCut = false;

  // ---- slide (in the air it becomes a fast fall that slides on landing)
  if (inp.slidePressed) {
    if (r.grounded) {
      if (r.slideCd <= 0 && r.slideT <= 0) {
        r.slideT = RUN.slideTime;
        emit('slide', { s: r.s, d: r.d });
      }
    } else {
      r.vy = Math.min(r.vy, RUN.fastFallV);
      r.slideQueued = true;
      r.canCut = false;
    }
  }

  // ---- integrate
  r.s += r.speed * dt;
  r.d += r.vd * dt;
  if (!r.grounded) {
    r.vy -= RUN.gravity * dt;
    r.y += r.vy * dt;
    r.airT += dt;
  }

  // ---- soft walls: scrape along hedges / railings
  const wall = surfaces.wallAt(r.s);
  if (wall) {
    const lo = wall.dl + RUN.radius;
    const hi = wall.dr - RUN.radius;
    let side = 0;
    if (r.d < lo) {
      r.d = lo;
      if (r.vd < 0) r.vd = 0;
      if (steer < -0.25) side = -1;
    } else if (r.d > hi) {
      r.d = hi;
      if (r.vd > 0) r.vd = 0;
      if (steer > 0.25) side = 1;
    }
    if (side) {
      if (r.scrapeT <= 0) emit('scrape', { s: r.s, d: r.d, side });
      r.scrapeT = 0.12;
      r.scrapeSide = side;
    }
  }

  // ---- ledge faces: running into the side of a higher pad bonks you back
  for (const p of surfaces.pads) {
    if (p.gone || p.s0 <= r.prevS || p.s0 > r.s) continue;
    if (r.d < p.dl || r.d > p.dr) continue;
    if (p.y0 > r.y + RUN.stepUp) {
      // only counts if nothing else holds you up at this point
      const under = surfaces.groundAt(r.s, r.d, r.y + RUN.stepUp);
      if (!under || under.pad === p) {
        r.s = p.s0 - 0.02;
        r.speed *= 0.35;
        emit('bonk', { s: r.s, d: r.d });
      }
    }
  }

  // ---- ground
  if (r.grounded) {
    const g = surfaces.groundAt(r.s, r.d, r.y + RUN.stepUp);
    if (g && r.y - g.h <= RUN.snapDown) {
      r.y = g.h;
      r.pad = g.pad;
      r.groundH = g.h;
    } else {
      r.grounded = false;
      r.vy = Math.min(r.vy, 0);
      r.airT = 0;
      r.pad = null;
    }
  } else {
    const top = Math.max(r.prevY, r.y) + 0.05;
    const g = surfaces.groundAt(r.s, r.d, top);
    if (g && r.y <= g.h && r.vy <= 0) {
      const impact = -r.vy;
      r.y = g.h;
      r.vy = 0;
      r.grounded = true;
      r.jumps = 0;
      r.pad = g.pad;
      r.groundH = g.h;
      emit('land', { s: r.s, d: r.d, y: r.y, impact, air: r.airT });
      r.airT = 0;
      if (r.buffer > 0) groundJump();
      else if (r.slideQueued) {
        r.slideQueued = false;
        r.slideT = RUN.slideTime;
        emit('slide', { s: r.s, d: r.d });
      }
    }
  }

  // ---- special pads
  if (r.grounded && r.pad) {
    const p = r.pad;
    if (p.kind === 'collapse' && p.touchedAt < 0) {
      p.touchedAt = w.t;
      emit('crumble', { padId: p.id });
    } else if (p.kind === 'bounce') {
      r.vy = p.launch;
      r.grounded = false;
      r.jumps = 1;
      r.canCut = false;
      r.slideT = 0;
      r.airT = 0;
      r.pad = null;
      emit('bounce', { s: r.s, d: r.d, y: r.y });
    }
  }

  // ---- fell into the void
  if (!r.grounded && r.y < surfaces.floorNear(r.s) - 7) {
    r.dead = true;
    r.cause = 'fall';
    emit('death', { cause: 'fall' });
  }
}

export const runnerHeight = r => (r.slideT > 0 ? RUN.heightSlide : RUN.heightStand);
