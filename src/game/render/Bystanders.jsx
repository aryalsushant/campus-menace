import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, runnerLerp, toWorld } from '../core/runtime';
import { on } from '../core/bus';
import { useGame } from '../core/store';
import { createRng } from '../sim/rng';
import { sectionHeight } from './campus';
import { loadPeople, makePerson, randomLook } from './people';

// Students on the lawns: small groups chatting, people strolling. They
// celebrate when you take a rider down near them. A small pool of rigged
// people is moved to spots ahead of the player as the campus scrolls by.

function spotsFor(seg) {
  const rnd = createRng(seg.seed ^ 0x51ed);
  const H = sectionHeight(seg);
  const out = [];
  if (seg.stage === 1) return out;
  const n = Math.round((seg.s1 - seg.s0) / 26);
  for (let i = 0; i < n; i++) {
    const s = seg.s0 + 10 + rnd.next() * (seg.s1 - seg.s0 - 20);
    const side = rnd.sign();
    const d = side * (seg.w + rnd.range(6, 10));
    const kind = rnd.chance(0.65) ? 'group' : 'stroll';
    const size = kind === 'group' ? rnd.int(2, 3) : 1;
    for (let k = 0; k < size; k++) {
      const a = (k / size) * Math.PI * 2 + rnd.next();
      out.push({ s: s + Math.cos(a) * 0.7, d: d + Math.sin(a) * 0.7, y: H(s), face: a + Math.PI, kind, seed: seg.seed + i * 13 + k });
    }
  }
  return out;
}

export default function Bystanders({ count = 9 }) {
  const segVersion = useGame(s => s.segVersion);
  const group = useRef();
  const pool = useRef([]);
  const cheerT = useRef(0);
  const spots = useMemo(() => {
    const w = runtime.world;
    if (!w) return [];
    return w.segments.filter(s => s.kind === 'section').flatMap(spotsFor);
  }, [segVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    loadPeople().then(() => {
      if (!live || !group.current) return;
      for (let i = 0; i < count; i++) {
        const look = randomLook(i * 977 + 3);
        const p = makePerson({ ...look, castShadow: false });
        p.root.visible = false;
        group.current.add(p.root);
        pool.current.push({ p, spot: null });
      }
    });
    const off = on('takedown', () => (cheerT.current = 2.5));
    return () => {
      live = false;
      off();
    };
  }, [count]);

  const q = useMemo(() => ({}), []);
  const w = useMemo(() => ({}), []);
  useFrame((_, rawDt) => {
    const world = runtime.world;
    if (!world || !pool.current.length) return;
    const dt = Math.min(rawDt, 0.05);
    cheerT.current = Math.max(0, cheerT.current - dt);
    runnerLerp(q);
    // the nearest spots ahead get people
    const ahead = spots.filter(sp => sp.s > q.s - 8 && sp.s < q.s + 110).slice(0, pool.current.length);
    const used = new Set();
    for (const slot of pool.current) {
      if (slot.spot && ahead.includes(slot.spot)) used.add(slot.spot);
      else slot.spot = null;
    }
    for (const slot of pool.current) {
      if (slot.spot) continue;
      const sp = ahead.find(a => !used.has(a));
      if (!sp) continue;
      used.add(sp);
      slot.spot = sp;
      slot.walk = 0;
    }
    for (const slot of pool.current) {
      const { p, spot } = slot;
      p.root.visible = !!spot;
      if (!spot) continue;
      let s = spot.s;
      if (spot.kind === 'stroll') {
        slot.walk += dt * 1.3;
        s += slot.walk;
      }
      const h = toWorld(s, spot.d, spot.y, w);
      p.root.position.set(w.x, w.y, w.z);
      p.root.rotation.y = spot.kind === 'stroll' ? -h : -h + spot.face;
      const near = Math.abs(spot.s - q.s) < 30;
      if (cheerT.current > 0 && near) p.play('Dance_Loop', { fade: 0.2 });
      else p.play(spot.kind === 'stroll' ? 'Walk_Loop' : 'Idle_Talking_Loop', { fade: 0.3 });
      p.mixer.update(dt);
    }
  });
  return <group ref={group} />;
}
