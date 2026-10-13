import { runtime, startWorld } from '../game/core/runtime';
import { getGame, setGame } from '../game/core/store';
import { on } from '../game/core/bus';
import { readInput, clearInput, enableTilt, calibrateTilt } from '../game/input/controls';
import { initAudio, setMuted, startMusic, sfx } from '../game/audio/sound';
import { randomSeed } from '../game/sim/rng';
import { api } from '../lib/api';

// Starting, ending and restarting runs.

let runToken = null; // { id, promise }
let overTimer = null;

export async function startRun() {
  const g = getGame();
  if (g.phase === 'playing' || !g.profile) return;
  initAudio();
  setMuted(g.muted);
  sfx.start();
  startMusic();
  if (g.touch && g.steerMode === 'tilt') {
    const ok = await enableTilt();
    if (!ok) setGame({ steerMode: 'drag' });
  }
  clearTimeout(overTimer);
  clearInput();
  const seed = randomSeed() & 0x7fffffff;
  startWorld('play', seed);
  runtime.input = readInput;
  // the run token comes from the server; the run starts immediately regardless
  const p = api.startRun(seed).catch(e => {
    console.warn('start_run failed', e.message);
    return null;
  });
  runToken = { id: null, promise: p };
  p.then(id => runToken && runToken.promise === p && (runToken.id = id));
  setGame({ phase: 'playing', paused: false, result: null, runCount: (g.runCount || 0) + 1 });
  // the angle you hold the phone at right now counts as straight
  setTimeout(calibrateTilt, 120);
}

export function backToMenu() {
  clearTimeout(overTimer);
  runtime.input = null;
  startWorld('attract');
  setGame({ phase: 'landing', paused: false, result: null });
}

export function togglePause() {
  const g = getGame();
  if (g.phase !== 'playing') return;
  if (!g.paused) clearInput();
  setGame({ paused: !g.paused });
  if (g.paused) setTimeout(calibrateTilt, 80);
}

export function wireFlow() {
  return on('death', e => {
    if (runtime.mode !== 'play') return;
    const w = runtime.world;
    const result = {
      score: w.score,
      distance: Math.round(w.runner.s),
      takedowns: w.stats.takedowns,
      closeCalls: w.stats.closeCalls,
      maxCombo: w.stats.maxCombo,
      thrown: w.stats.thrown,
      cause: e.cause,
      model: e.model,
      stage: w.stage,
      durationMs: Math.round(w.t * 1000),
      submit: 'pending',
    };
    clearTimeout(overTimer);
    overTimer = setTimeout(() => setGame({ phase: 'over', result: { ...result, ...(getGame().result || {}) } }), 1400);
    submit(result);
  });
}

async function submit(result) {
  const token = runToken;
  runToken = null;
  try {
    const id = token && (token.id || (await token.promise));
    if (!id) throw new Error('no run token');
    const res = await api.finishRun(id, result);
    const cur = getGame().result;
    setGame({ result: { ...(cur || result), ...res, submit: res.status === 'done' ? 'saved' : 'rejected' } });
    if (res.status === 'done') setGame({ stats: null }); // refresh on next view
  } catch (err) {
    const cur = getGame().result;
    setGame({ result: { ...(cur || result), submit: 'failed', error: err.message } });
  }
}

export { clearInput };
