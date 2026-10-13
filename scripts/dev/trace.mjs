// node scripts/dev/trace.mjs <seed> <maxS>: plays a seed with the bot and prints notable events
import { createWorld, stepWorld, drainEvents } from '../../src/game/sim/world.js';
import { createBot } from '../../src/game/sim/bot.js';
const seed = +process.argv[2] || 1, maxS = +process.argv[3] || 1500;
const w = createWorld(seed); const bot = createBot();
const keep = new Set(['stumble','death','obstacleHit','bonk','canHit','takedown','closeCall','restock','noCans']);
while (!w.over && w.runner.s < maxS) {
  stepWorld(w, bot.think(w));
  for (const e of drainEvents(w)) if (keep.has(e.type)) {
    const r = w.runner;
    console.log(e.type.padEnd(11), `s=${r.s.toFixed(1)} d=${r.d.toFixed(2)} y=${r.y.toFixed(2)} v=${r.speed.toFixed(1)} g=${r.grounded} slide=${r.slideT>0}`, JSON.stringify({...e, t: undefined, type: undefined}));
  }
}
console.log('end', w.runner.s.toFixed(0), w.runner.cause, 'score', w.score);
