import { createWorld, stepWorld } from '../../src/game/sim/world.js';
import { createBot } from '../../src/game/sim/bot.js';
for (let seed = 1; seed <= 40; seed++) {
  const w = createWorld(seed); const bot = createBot();
  while (!w.over && w.runner.s < 5000) stepWorld(w, bot.think(w));
  if (w.runner.cause !== 'fall') continue;
  const s = w.runner.s;
  const g = w.segments.filter(x => x.kind === 'crossing' && x.s0 < s + 2).pop();
  console.log(seed, Math.round(s), g && `${g.type} len=${(g.s1 - g.s0).toFixed(1)} dh=${g.dh?.toFixed(1)} s0=${g.s0.toFixed(0)}`, 'v=', w.runner.speed.toFixed(1), 'stumbled', w.runner.stumbleT > 0);
}
