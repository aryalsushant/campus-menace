// node: npx tsx scripts/dev/survey.mjs [seeds] [maxS]: bot survival and score stats
import { createWorld, stepWorld } from '../../src/game/sim/world.js';
import { createBot } from '../../src/game/sim/bot.js';
const N = +process.argv[2] || 40, maxS = +process.argv[3] || 5000;
const res = [];
for (let seed = 1; seed <= N; seed++) {
  const w = createWorld(seed); const bot = createBot();
  while (!w.over && w.runner.s < maxS) stepWorld(w, bot.think(w));
  res.push({ s: Math.round(w.runner.s), cause: w.runner.cause, score: w.score, td: w.stats.takedowns, cc: w.stats.closeCalls, t: Math.round(w.t) });
}
res.sort((a, b) => a.s - b.s);
const q = p => res[Math.floor(p * (res.length - 1))].s;
console.log('distance p10/p50/p90:', q(0.1), q(0.5), q(0.9));
const causes = {}; for (const r of res) causes[r.cause || 'alive'] = (causes[r.cause || 'alive'] || 0) + 1;
console.log('causes', causes);
console.log('avg score', (res.reduce((a, r) => a + r.score, 0) / N).toFixed(0), 'avg takedowns', (res.reduce((a, r) => a + r.td, 0) / N).toFixed(1), 'avg time', (res.reduce((a, r) => a + r.t, 0) / N).toFixed(0) + 's');
