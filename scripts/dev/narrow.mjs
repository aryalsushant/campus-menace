import { createWorld, stepWorld, drainEvents } from '../../src/game/sim/world.js';
import { createBot } from '../../src/game/sim/bot.js';
const seed = +process.argv[2] || 34;
const w = createWorld(seed); const bot = createBot();
while (!w.over && w.runner.s < 5000) {
  stepWorld(w, bot.think(w));
  for (const e of drainEvents(w)) if (['throw', 'canHit', 'canMiss', 'death', 'riderSpawn'].includes(e.type) && w.runner.s > 380) {
    const rd = w.riders.find(x => x.state === 'ride');
    console.log(e.type.padEnd(10), `s=${w.runner.s.toFixed(1)} d=${w.runner.d.toFixed(2)}`, rd ? `rider s=${rd.s.toFixed(1)} d=${rd.d.toFixed(2)} y=${rd.y?.toFixed(2)} ry=${w.runner.y.toFixed(2)}` : '', JSON.stringify({ ...e, t: undefined, type: undefined }));
  }
}
