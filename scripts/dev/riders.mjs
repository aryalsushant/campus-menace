import { createWorld } from '../../src/game/sim/world.js';
for (let i = 0; i < 25; i++) {
  const w = createWorld(1000 + i); w.gen.generateUntil(w, 4500);
  for (const r of w.plannedRiders) {
    const g = w.surfaces.groundAt(r.s, r.d, 1e9);
    if (!g || (g.pad.kind !== 'path' && g.pad.kind !== 'bridge')) {
      const seg = w.segments.find(s => r.s >= s.s0 && r.s <= s.s1);
      console.log(i, r.kind, r.s.toFixed(1), r.d.toFixed(2), g && g.pad.kind, seg && `${seg.kind}/${seg.type} ${seg.s0.toFixed(1)}-${seg.s1.toFixed(1)}`);
    }
  }
}
