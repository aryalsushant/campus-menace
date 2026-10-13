import { on } from '../core/bus';
import { runtime } from '../core/runtime';
import { sfx, setIntensity, setAmbience } from './sound';
import { SKY } from '../render/Atmosphere';

// Map simulation events to sounds. Silent while the attract run plays.
// Pan follows where things happen relative to the student.
export function wireAudio() {
  const live = fn => e => {
    if (runtime.mode === 'play') fn(e);
  };
  const panOf = d => {
    const w = runtime.world;
    return w ? Math.max(-0.9, Math.min(0.9, (d - w.runner.d) / 5)) : 0;
  };
  const offs = [
    on('step', live(e => sfx.step(e.foot * 0.15))),
    on('jump', live(() => sfx.jump())),
    on('doubleJump', live(() => sfx.doubleJump())),
    on('land', live(e => e.impact > 4 && sfx.land(e.impact))),
    on('slide', live(() => sfx.slide())),
    on('pizza', live(() => sfx.pizza())),
    on('throw', live(() => sfx.throw())),
    on('canHit', live(e => sfx.canHit(panOf(e.d)))),
    on('canMiss', live(() => sfx.canMiss())),
    on('takedown', live(e => sfx.takedown(panOf(e.d)))),
    on('closeCall', live(e => sfx.closeCall(panOf(e.d)))),
    on('riderPass', live(e => e.near >= 1.3 && sfx.whoosh(Math.sign(e.d) * 0.7))),
    on('comboBonus', live(e => sfx.combo(e.combo))),
    on('stumble', live(() => sfx.stumble())),
    on('scrape', live(() => sfx.scrape())),
    on('bonk', live(() => sfx.bonk())),
    on('goose', live(e => sfx.honk(panOf(e.d)))),
    on('death', live(() => sfx.death())),
    on('restock', live(e => e.added > 0 && sfx.restock())),
    on('noCans', live(() => sfx.noCans())),
    on('powerup', live(() => sfx.powerup())),
    on('golden', live(() => sfx.golden())),
    on('passedBest', live(() => sfx.record())),
    on('shieldBreak', live(() => sfx.shieldBreak())),
    on('riderSpawn', live(e => {
      if (e.kind === 'weaver') return;
      const rd = runtime.world.riders.find(r => r.id === e.id);
      sfx.bell(rd ? panOf(rd.d) : 0);
    })),
    on('bounce', live(() => sfx.bounce())),
    on('crumble', live(() => sfx.crumble())),
    on('stage', live(() => sfx.stage())),
  ];
  // music builds with distance; wind follows speed; birds by day
  const id = setInterval(() => {
    const w = runtime.world;
    if (!w) return;
    const playing = runtime.mode === 'play' && !w.over;
    setIntensity(playing ? Math.min(1, 0.12 + w.runner.s / 2200) : 0.2);
    setAmbience({ speed: w.runner.speed, day: w.stage === 0 ? 1 - SKY.night : 0, playing });
  }, 250);
  return () => {
    offs.forEach(f => f());
    clearInterval(id);
  };
}
