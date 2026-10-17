import { runtime, startWorld, prepareWorld, prepareTutorialWorld } from '../game/core/runtime';
import { createTutorial } from '../game/core/tutorial';
import { prebuildWorld } from '../game/render/chunks';
import { getGame, setGame } from '../game/core/store';
import { on } from '../game/core/bus';
import { readInput, clearInput, enableTilt, calibrateTilt, tiltAvailable } from '../game/input/controls';
import { initAudio, setMuted, startMusic, sfx } from '../game/audio/sound';
import { randomSeed } from '../game/sim/rng';
import { api } from '../lib/api';

// Starting, ending and restarting runs.

let runToken = null; // { id, promise }
let overTimer = null;

// New players (no runs yet, tutorial never finished or skipped) learn the
// controls first. Players with a username need their stats loaded so
// returning players never see it; without one they've never run.
export function needsTutorial(g = getGame()) {
  if (!g.session || g.tutorialDone) return false;
  const meta = g.session.user && g.session.user.user_metadata;
  if (meta && meta.tutorial_done) return false;
  if (!g.profile) return true;
  if (!g.stats) return false;
  return !(g.stats.total_runs > 0);
}

export async function startRun(opts = {}) {
  const g = getGame();
  if (g.phase === 'playing' && !opts.fromTutorial) return;
  if (!opts.fromTutorial && needsTutorial(g)) return startTutorial();
  if (!g.profile) return; // a username comes first
  runtime.tutorial = null;
  if (getGame().tutorial) setGame({ tutorial: null });
  await beginPlay(g);
  // use the world prepared in the background, if there is one
  const seed = runtime.nextWorld ? runtime.nextWorld.seed : randomSeed() & 0x7fffffff;
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

// A practice world nothing can end; nothing is submitted.
export async function startTutorial() {
  const g = getGame();
  if (!g.session) return;
  await beginPlay(g);
  startWorld('play', undefined, { tutorial: true });
  const tut = createTutorial({ touch: g.touch });
  runtime.tutorial = tut;
  runtime.input = readInput;
  runToken = null;
  setGame({ phase: 'playing', paused: false, result: null });
  tut.start(runtime.world);
  setTimeout(calibrateTilt, 120);
}

// Finish or skip the tutorial: remember it, then start a real run or go back.
export function endTutorial(next) {
  if (!getGame().tutorialDone) {
    setGame({ tutorialDone: true });
    api.markTutorialDone().catch(() => {});
  }
  runtime.tutorial = null;
  setGame({ tutorial: null });
  // new players pick their username on the start screen first
  if (next === 'run' && getGame().profile) startRun({ fromTutorial: true });
  else backToMenu();
}

// steering label for touch: tilt only if the phone actually reports it
export const usesTilt = () => getGame().steerMode === 'tilt' && tiltAvailable();

async function beginPlay(g) {
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
  // Space throws now: make sure no button keeps focus during the run
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

export function backToMenu() {
  clearTimeout(overTimer);
  runtime.tutorial = null;
  if (getGame().tutorial) setGame({ tutorial: null });
  runtime.input = null;
  startWorld('attract');
  prepareNextRun();
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
    // build the next run's world while the game-over screen shows
    setTimeout(prepareNextRun, 600);
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
    if (res.status === 'done') api.myStats().then(st => setGame({ stats: st })).catch(() => {});
  } catch (err) {
    const cur = getGame().result;
    setGame({ result: { ...(cur || result), submit: 'failed', error: err.message } });
  }
}

export function prepareNextRun() {
  if (!runtime.nextWorld) prebuildWorld(prepareWorld());
}

// build the tutorial's campus ahead so it starts without pop-in
export function prepareTutorial() {
  if (!runtime.nextTutorial) prebuildWorld(prepareTutorialWorld());
}

export { clearInput };
