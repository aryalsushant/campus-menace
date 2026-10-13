// lists the earliest bot deaths with what was around at the moment of death
import { createWorld, stepWorld } from '../../src/game/sim/world.js';
import { createBot } from '../../src/game/sim/bot.js';
const out = [];
for (let seed = 1; seed <= 40; seed++) {
  const w = createWorld(seed); const bot = createBot();
  while (!w.over && w.runner.s < 5000) stepWorld(w, bot.think(w));
  const r = w.runner;
  const near = w.riders.filter(x => x.state === 'ride' && Math.abs(x.s - r.s) < 3).map(x => `${x.kind} d=${x.d.toFixed(1)}`);
  const others = w.riders.filter(x => x.state === 'ride' && x.s - r.s > 0 && x.s - r.s < 30).length;
  const wall = w.surfaces.wallAt(r.s);
  out.push({ seed, s: Math.round(r.s), cause: r.cause, d: r.d.toFixed(1), w: wall ? (wall.dr).toFixed(1) : 'none', near, ahead: others, cans: w.canCount, seg: (w.segments.find(g => r.s >= g.s0 && r.s <= g.s1) || {}).type || 'section' });
}
out.sort((a, b) => a.s - b.s).slice(0, 8).forEach(o => console.log(JSON.stringify(o)));
