import { on } from '../core/bus';
import { runtime } from '../core/runtime';
import { sfx, setIntensity } from './sound';

// Map simulation events to sounds. Silent while the attract run plays.
export function wireAudio() {
  const live = fn => e => {
    if (runtime.mode === 'play') fn(e);
  };
  const offs = [
    on('jump', live(() => sfx.jump())),
    on('doubleJump', live(() => sfx.doubleJump())),
    on('land', live(e => e.impact > 4 && sfx.land(e.impact))),
    on('slide', live(() => sfx.slide())),
    on('pizza', live(() => sfx.pizza())),
    on('throw', live(() => sfx.throw())),
    on('canHit', live(() => sfx.canHit())),
    on('canMiss', live(() => sfx.canMiss())),
    on('takedown', live(e => e.how !== 'can' && sfx.takedown())),
    on('closeCall', live(() => sfx.closeCall())),
    on('comboBonus', live(e => sfx.combo(e.combo))),
    on('stumble', live(() => sfx.stumble())),
    on('scrape', live(() => sfx.scrape())),
    on('bonk', live(() => sfx.bonk())),
    on('death', live(() => sfx.death())),
    on('restock', live(e => e.added > 0 && sfx.restock())),
    on('noCans', live(() => sfx.noCans())),
    on('powerup', live(() => sfx.powerup())),
    on('golden', live(() => sfx.golden())),
    on('passedBest', live(() => sfx.record())),
    on('shieldBreak', live(() => sfx.shieldBreak())),
    on('riderSpawn', live(e => e.kind !== 'weaver' && sfx.bell())),
    on('bounce', live(() => sfx.bounce())),
    on('crumble', live(() => sfx.crumble())),
    on('stage', live(() => sfx.stage())),
  ];
  // music builds with distance
  const id = setInterval(() => {
    const w = runtime.world;
    if (!w) return;
    setIntensity(runtime.mode === 'play' ? Math.min(1, w.runner.s / 2600) : 0.2);
  }, 500);
  return () => {
    offs.forEach(f => f());
    clearInterval(id);
  };
}
