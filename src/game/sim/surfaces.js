// Walkable surfaces in track space.
//
// A pad covers s ∈ [s0, s1], d ∈ [dl, dr] at a height that varies linearly
// from y0 (at s0) to y1 (at s1). Kinds change behaviour:
//   'collapse' drops `delay` seconds after first touch
//   'bounce'   launches the runner with `launch` m/s
// Walls are separate corridors: inside [s0, s1] the runner is kept within
// [dl, dr] and scrapes along the sides. Gaps and stepping stones have no walls.

export function createSurfaces() {
  const pads = [];
  const walls = [];
  let nextId = 1;

  const addPad = p => {
    const pad = { id: nextId++, kind: 'path', y1: p.y0, touchedAt: -1, gone: false, ...p };
    pads.push(pad);
    return pad;
  };
  const addWall = w => {
    walls.push({ ...w });
  };

  const heightOf = (p, s) => {
    const len = p.s1 - p.s0;
    return len <= 0 ? p.y0 : p.y0 + (p.y1 - p.y0) * ((s - p.s0) / len);
  };

  // Highest pad surface at (s, d) that is at or below `yMax`.
  // Returns { pad, h } or null.
  const groundAt = (s, d, yMax, r = 0) => {
    let best = null;
    let bestH = -Infinity;
    for (let i = pads.length - 1; i >= 0; i--) {
      const p = pads[i];
      if (p.gone || s < p.s0 - r || s > p.s1 + r || d < p.dl - r || d > p.dr + r) continue;
      const h = heightOf(p, Math.min(Math.max(s, p.s0), p.s1));
      if (h <= yMax && h > bestH) {
        bestH = h;
        best = p;
      }
    }
    return best ? { pad: best, h: bestH } : null;
  };

  // Any pad at s within [d - r, d + r] regardless of height (used by the bot / generator checks)
  const anyPadAt = (s, d = 0, r = 50) => {
    for (const p of pads) if (!p.gone && s >= p.s0 && s <= p.s1 && d + r >= p.dl && d - r <= p.dr) return p;
    return null;
  };

  const wallAt = s => {
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i];
      if (s >= w.s0 && s <= w.s1) return w;
    }
    return null;
  };

  // lowest surface near s, for the kill plane
  const floorNear = (s, span = 60) => {
    let lo = Infinity;
    for (const p of pads) {
      if (p.s1 < s - span || p.s0 > s + span) continue;
      lo = Math.min(lo, p.y0, p.y1);
    }
    return lo === Infinity ? 0 : lo;
  };

  const update = t => {
    for (const p of pads) {
      if (p.kind === 'collapse' && !p.gone && p.touchedAt >= 0 && t - p.touchedAt >= p.delay) p.gone = true;
    }
  };

  const prune = s => {
    for (let i = pads.length - 1; i >= 0; i--) if (pads[i].s1 < s) pads.splice(i, 1);
    for (let i = walls.length - 1; i >= 0; i--) if (walls[i].s1 < s) walls.splice(i, 1);
  };

  return { pads, walls, addPad, addWall, heightOf, groundAt, anyPadAt, wallAt, floorNear, update, prune };
}
