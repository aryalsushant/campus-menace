// what happens in the first 15 seconds
import { createWorld } from '../../src/game/sim/world.js';
import { speedAt } from '../../src/game/sim/tune.js';
const w = createWorld(+process.argv[2] || 1);
const t = s => (s / speedAt(0)).toFixed(1) + 's';
const ev = [...w.obstacles.map(o => [o.s, o.model]), ...w.plannedRiders.map(r => [r.meet ?? r.s, 'rider:' + r.kind]), ...w.pickups.filter(p => p.kind !== 'pizza').map(p => [p.s, p.kind])].filter(e => e[0] < 200).sort((a, b) => a[0] - b[0]);
console.log(ev.map(([s, k]) => `${t(s)} ${k}`).join('\n'));
