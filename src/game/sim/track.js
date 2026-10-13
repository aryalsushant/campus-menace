// The path's centreline in the XZ plane, built from constant-curvature
// pieces (straights and arcs) so positions have a closed form.
//
// Conventions:
//   heading θ = 0 faces -Z. Forward F(θ) = (sin θ, -cos θ), right R(θ) = (cos θ, sin θ).
//   curvature k > 0 turns right. s is arc length along the centreline,
//   d is lateral offset (positive = right).

export function createTrack() {
  const pieces = [];
  const end = { s: 0, x: 0, z: 0, h: 0 };

  function add(len, k = 0) {
    const p = { s0: end.s, len, k, x0: end.x, z0: end.z, h0: end.h };
    pieces.push(p);
    const e = local(p, len);
    end.s += len;
    end.x = e.x;
    end.z = e.z;
    end.h = e.h;
    return p;
  }

  function local(p, u) {
    const h = p.h0 + p.k * u;
    if (Math.abs(p.k) < 1e-6) {
      return { x: p.x0 + u * Math.sin(p.h0), z: p.z0 - u * Math.cos(p.h0), h };
    }
    return {
      x: p.x0 + (Math.cos(p.h0) - Math.cos(h)) / p.k,
      z: p.z0 - (Math.sin(h) - Math.sin(p.h0)) / p.k,
      h,
    };
  }

  // binary search with a cached last index (queries are mostly monotonic)
  let last = 0;
  function pieceAt(s) {
    if (!pieces.length) return null;
    let p = pieces[last];
    if (p && s >= p.s0 && s < p.s0 + p.len) return p;
    let lo = 0;
    let hi = pieces.length - 1;
    if (s <= pieces[0].s0) {
      last = 0;
      return pieces[0];
    }
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    last = lo;
    return pieces[lo];
  }

  // world pose at (s, d); writes into `out` to avoid garbage
  function pose(s, d = 0, out = {}) {
    const p = pieceAt(s);
    if (!p) {
      out.x = d;
      out.z = -s;
      out.h = 0;
      return out;
    }
    const u = Math.min(Math.max(s - p.s0, 0), p.len + 50);
    const c = local(p, u);
    out.x = c.x + d * Math.cos(c.h);
    out.z = c.z + d * Math.sin(c.h);
    out.h = c.h;
    return out;
  }

  function curvatureAt(s) {
    const p = pieceAt(s);
    return p ? p.k : 0;
  }

  // forget pieces entirely behind `s`
  function prune(s) {
    let n = 0;
    while (n < pieces.length - 1 && pieces[n].s0 + pieces[n].len < s) n++;
    if (n > 0) {
      pieces.splice(0, n);
      last = 0;
    }
  }

  return { pieces, end, add, pose, pieceAt, curvatureAt, prune };
}
