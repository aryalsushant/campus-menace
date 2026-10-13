import { createWorld, stepWorld, drainEvents } from '../../src/game/sim/world.js';
import { createBot } from '../../src/game/sim/bot.js';
const seed = +process.argv[2] || 1;
const w = createWorld(seed); const bot = createBot();
const log = [];
while (!w.over && w.runner.s < 4000) {
  const inp = bot.think(w); stepWorld(w, inp);
  const r = w.runner;
  log.push(`t=${w.t.toFixed(2)} s=${r.s.toFixed(2)} d=${r.d.toFixed(2)} y=${r.y.toFixed(2)} vy=${r.vy.toFixed(1)} v=${r.speed.toFixed(1)} g=${r.grounded} j=${r.jumps} in=${inp.jumpPressed?'J':''}${inp.slidePressed?'S':''} ev=${drainEvents(w).map(e=>e.type).join(',')}`);
  if (log.length > 140) log.shift();
}
const s = w.runner.s;
const seg = w.segments.filter(g => g.s1 > s - 60 && g.s0 < s + 20).map(g => `${g.kind}/${g.type||''} [${g.s0.toFixed(1)}-${g.s1.toFixed(1)}] y0=${(g.y0??g.parts?.[0].y0)?.toFixed(2)} y1=${(g.y1??g.yEnd)?.toFixed(2)} dh=${g.dh?.toFixed(2)} w=${g.w?.toFixed(2)}`);
console.log(seg.join('\n'));
console.log(log.filter((_, i) => i % 3 === 0 || /bonk|jump|land|death/.test(_)).slice(-45).join('\n'));
