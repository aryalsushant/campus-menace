import { setGame } from './store';

// The first-run tutorial. Each lesson places one obstacle ahead, freezes the
// game just before it and waits for the right move; the move then plays out
// (with a little help so it always clears). A miss repeats the lesson.

const LESSONS = [
  // freezeAt: distance (m) to the obstacle when the game stops
  { id: 'steer', freezeAt: 11 },
  { id: 'jump', freezeAt: 3.9 },
  { id: 'slide', freezeAt: 3.7 },
  { id: 'throw', freezeAt: 22 },
];

const LEAD = 42; // how far ahead each lesson's obstacle appears
const RIDER_LEAD = 55;

export const lessonCount = LESSONS.length;

// what each lesson asks for, by device
export function lessonPrompt(id, { touch, tilt }) {
  if (!touch) {
    return {
      steer: { title: 'Dodge', text: 'Press ← or → to move out of the way.', keys: ['←', '→'] },
      jump: { title: 'Jump', text: 'Press ↑ to jump over it.', keys: ['↑'] },
      slide: { title: 'Duck', text: 'Press ↓ to duck under it.', keys: ['↓'] },
      throw: { title: 'Attack', text: 'Scooter riders take you out on contact. Press Space to throw a can at them.', keys: ['Space'] },
    }[id];
  }
  return {
    steer: tilt
      ? { title: 'Dodge', text: 'Tilt your phone left or right to move out of the way.', gesture: 'tilt' }
      : { title: 'Dodge', text: 'Drag your thumb left or right to move out of the way.', gesture: 'drag' },
    jump: { title: 'Jump', text: 'Swipe up to jump over it.', gesture: 'up' },
    slide: { title: 'Duck', text: 'Swipe down to duck under it.', gesture: 'down' },
    throw: { title: 'Attack', text: 'Scooter riders take you out on contact. Tap the rider to throw a can at them.', gesture: 'tap' },
  }[id];
}

export function createTutorial({ touch }) {
  const T = {
    hold: false,
    step: 0,
    phase: 'gap', // gap → approach → hold → go → (nice | retry) → … → done
    until: 0, // world time the current gap / feedback ends
    lesson: null,
    pending: null, // the input that released the hold, replayed on the next step
    dir: 0,
    jumpHoldUntil: 0,
    missHint: false,
  };

  const show = patch => setGame({ tutorial: { step: T.step, total: LESSONS.length, ...patch } });

  function spawn(w) {
    const L = LESSONS[T.step];
    const r = w.runner;
    let s = r.s + (L.id === 'throw' ? RIDER_LEAD : LEAD);
    // keep lessons on the wide paths, not on a bridge
    for (const seg of w.segments) {
      if (seg.kind === 'crossing' && s > seg.s0 - 14 && s < seg.s1 + 14) {
        const next = w.segments.find(x => x.kind === 'section' && x.s0 >= seg.s1);
        if (next) s = next.s0 + 16;
      }
    }
    if (L.id === 'throw' && s - r.s > RIDER_LEAD + 4) {
      // the rider only appears once we're close: wait and spawn it later
      T.until = w.t + 0.2;
      return;
    }
    if (L.id === 'throw') w.canCount = Math.max(w.canCount, 3);
    const placed = w.gen.lesson(w, L.id, s, r.d);
    T.lesson = { ...L, s, ...placed };
    T.phase = 'approach';
    T.missHint = false;
    show({ status: 'run' });
  }

  const rider = w => T.lesson && w.riders.find(rd => rd.id === T.lesson.riderId);
  const target = w => {
    if (T.lesson.id !== 'throw') return T.lesson.s;
    const rd = rider(w);
    return rd ? rd.s : null;
  };

  function freeze(missed) {
    T.hold = true;
    T.phase = 'hold';
    T.missHint = !!missed;
    show({ status: 'hold', lesson: T.lesson.id, missed: !!missed });
  }

  function feedback(ok, w) {
    T.phase = ok ? 'nice' : 'retry';
    T.until = w.t + (ok ? 0.9 : 1.3);
    if (ok) T.step++;
    show({ status: ok ? 'nice' : 'retry' });
  }

  // called every frame while frozen with that frame's input
  T.poll = inp => {
    const id = T.lesson.id;
    let ok = false;
    if (id === 'steer') ok = Math.abs(inp.steer) > 0.4 || !!inp.steerTap;
    else if (id === 'jump') ok = inp.jumpPressed;
    else if (id === 'slide') ok = inp.slidePressed;
    else if (id === 'throw') {
      ok = inp.throwPressed && (!touch || inp.throwTarget === T.lesson.riderId);
      if (inp.throwPressed && !ok && !T.missHint) {
        T.missHint = true;
        show({ status: 'hold', lesson: id, missed: true });
      }
    }
    if (!ok) return;
    T.hold = false;
    T.phase = 'go';
    T.pending = { ...inp };
    if (id === 'throw' && !touch) T.pending.throwTarget = T.lesson.riderId;
    T.dir = Math.sign(inp.steer) || inp.steerTap || 0;
    T.jumpHoldUntil = -1; // set on the first step
    show({ status: 'go' });
  };

  // shapes the input of every simulation step
  T.filter = (inp, w) => {
    if (T.pending) {
      inp = { ...inp, ...T.pending, steer: inp.steer || T.pending.steer };
      T.pending = null;
    }
    if (T.phase !== 'go' || !T.lesson) return inp;
    const r = w.runner;
    const id = T.lesson.id;
    if (id === 'steer') {
      // keep moving until clear of the bins, even after a quick tap
      const clear = r.d < T.lesson.from - 0.45 || r.d > T.lesson.to + 0.45;
      if (!clear && r.s < T.lesson.s + 1) inp = { ...inp, steer: T.dir };
    } else if (id === 'jump') {
      if (T.jumpHoldUntil < 0) T.jumpHoldUntil = w.t + 0.35;
      // a full-height jump even if the key was only tapped
      if (w.t < T.jumpHoldUntil) inp = { ...inp, jumpHeld: true };
    }
    return inp;
  };

  // runs after every simulation step
  T.update = w => {
    const r = w.runner;
    if (T.phase === 'done') return;
    if (T.phase === 'gap' || T.phase === 'nice' || T.phase === 'retry') {
      if (w.t < T.until) return;
      if (T.step >= LESSONS.length) {
        T.phase = 'done';
        T.lesson = null;
        show({ status: 'done' });
        return;
      }
      spawn(w);
      return;
    }
    const L = T.lesson;
    if (T.phase === 'approach') {
      const s = target(w);
      if (s != null && s - r.s <= L.freezeAt) freeze(false);
      return;
    }
    if (T.phase !== 'go') return;
    if (L.id === 'throw') {
      const rd = rider(w);
      if (!rd) return feedback(false, w);
      if (rd.state === 'down') return feedback(rd.how === 'can', w);
      // the can missed and the rider is still coming: try again
      if (!w.cans.length && w.canCd <= 0 && rd.s - r.s > 7) {
        freeze(true);
        return;
      }
      if (rd.s < r.s - 1) feedback(false, w);
      return;
    }
    if (L.obstacles.some(o => o.hit)) return feedback(false, w);
    const far = Math.max(...L.obstacles.map(o => o.s + o.hd));
    if (r.s > far + RUN_CLEAR) feedback(true, w);
  };

  T.start = w => {
    T.until = w.t + 1.2;
    show({ status: 'intro' });
  };

  return T;
}

const RUN_CLEAR = 0.6;
