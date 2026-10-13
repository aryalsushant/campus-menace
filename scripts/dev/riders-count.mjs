// riders planned per km in the first 2 km, averaged over seeds
import { createWorld } from '../../src/game/sim/world.js';
let n = 0;
for (let i = 1; i <= 20; i++) { const w = createWorld(i); w.gen.generateUntil(w, 2000); n += w.plannedRiders.filter(r => r.s < 2000).length; }
console.log('riders per km:', (n / 20 / 2).toFixed(1));
