// Seeded PRNG (mulberry32). Everything random in the simulation goes through
// one of these so a seed always produces the same run.
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: p => next() < p,
    pick: list => list[Math.floor(next() * list.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    // weighted pick from [[item, weight], ...]; zero/negative weights are skipped
    weighted: entries => {
      let total = 0;
      for (const [, w] of entries) if (w > 0) total += w;
      if (total <= 0) return null;
      let r = next() * total;
      for (const [item, w] of entries) {
        if (w <= 0) continue;
        r -= w;
        if (r <= 0) return item;
      }
      return entries[entries.length - 1][0];
    },
    fork: salt => createRng((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0),
  };
  return rng;
}

export const randomSeed = () => (Math.random() * 4294967296) >>> 0;
