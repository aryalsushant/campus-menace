// Quality tiers. 'auto' starts from a device guess and adapts to frame rate.
export const TIERS = {
  // render scale range; dynamic resolution moves within it. Above ~1.5x the
  // extra pixels are invisible next to SMAA but cost up to 1.8x more.
  low: { dpr: [0.7, 1], shadows: false, shadowSize: 1024 },
  medium: { dpr: [0.85, 1.25], shadows: true, shadowSize: 1024 },
  high: { dpr: [1, 1.5], shadows: true, shadowSize: 2048 },
};

export function guessTier() {
  if (typeof navigator === 'undefined') return 'medium';
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (touch) return cores >= 6 && mem >= 4 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export const tierDown = t => (t === 'high' ? 'medium' : 'low');
export const tierUp = t => (t === 'low' ? 'medium' : 'high');
