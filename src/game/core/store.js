import { guessTier } from './quality';
import { create } from 'zustand';

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(`cm:${k}`);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(`cm:${k}`, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

// UI-facing state. The simulation itself lives in `runtime` (mutable, per
// frame); only values the DOM shows are mirrored here, and only on change.
export const useGame = create(set => ({
  // 'landing' (attract run + sign in) | 'ready' | 'playing' | 'over'
  phase: 'landing',
  paused: false,
  score: 0,
  cans: 5,
  combo: 0,
  stage: 0,
  power: { magnet: 0, coffee: 0, hoodie: false, sixpack: 0 },
  shaken: false,
  result: null,
  touch: false,
  quality: read('quality', 'auto'),
  tier: initialTier(read('quality', 'auto')),
  muted: read('muted', false),
  tiltSensitivity: read('tilt', 1),
  steerMode: read('steerMode', 'tilt'), // phones: 'tilt' | 'drag'
  segVersion: 0,
  chunkVersion: 0,
  texReady: false,
  session: null,
  profile: null,
  authReady: false,
  tutorial: null, // { step, total, status, lesson, missed } while the tutorial runs
  tutorialDone: false,
  universityAsked: false, // the first-sign-in university picker was shown
  recovering: false, // arrived from a password-reset link
  authNotice: null, // { kind: 'good' | 'bad', text } shown on the sign-in screens
  playerNotice: null,
  stats: null,
  runCount: 0,
  objVersion: 0,
  set,
}));

// pick the tier before the first frame so the scene isn't built twice
function initialTier(q) {
  return q === 'auto' ? (typeof window === 'undefined' ? 'medium' : guessTier()) : q;
}

export const setGame = patch => useGame.setState(patch);
export const getGame = () => useGame.getState();

export function setPersisted(patch) {
  for (const [k, v] of Object.entries(patch)) {
    const key = { quality: 'quality', muted: 'muted', tiltSensitivity: 'tilt', steerMode: 'steerMode' }[k];
    if (key) write(key, v);
  }
  useGame.setState(patch);
}
