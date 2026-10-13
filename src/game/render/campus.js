import * as THREE from 'three';
import { Builder, color } from './geo';
import { Cards } from './foliage';
import { hall, rotundaLandmark, gateway, eagleStatue, stadium } from './architecture';
import { liveOak, longleafPine, magnolia, azalea, tuft } from './trees';
import { createRng } from '../sim/rng';

// Geometry for one section or crossing, built once when it is generated.
// Everything is in world space (meshes sit at the origin).

const UP = new THREE.Vector3(0, 1, 0);
const _p = {};

export function sampleS(s0, s1, step) {
  const out = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) out.push(s0 + ((s1 - s0) * i) / n);
  return out;
}

export function sectionHeight(seg) {
  return s => {
    for (const p of seg.parts) {
      if (s >= p.s0 - 1e-6 && s <= p.s1 + 1e-6) return p.y0 + (p.y1 - p.y0) * ((s - p.s0) / Math.max(1e-6, p.s1 - p.s0));
    }
    return s < seg.parts[0].s0 ? seg.parts[0].y0 : seg.parts[seg.parts.length - 1].y1;
  };
}

const wp = (track, s, d, y) => {
  track.pose(s, d, _p);
  return new THREE.Vector3(_p.x, y, _p.z);
};

// a local frame at (s, d) whose +z faces the path centre
export function frame(track, s, d, y, side, out = new THREE.Matrix4()) {
  track.pose(s, d, _p);
  const h = _p.h;
  const F = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
  const R = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
  const X = side < 0 ? F : F.clone().negate();
  const Z = side < 0 ? R : R.clone().negate();
  out.makeBasis(X, UP, Z);
  out.setPosition(_p.x, y, _p.z);
  return out;
}

// heading-aligned frame (+z = backward along the path, +x = right)
export function alongFrame(track, s, d, y, out = new THREE.Matrix4()) {
  track.pose(s, d, _p);
  const h = _p.h;
  out.makeRotationY(-h);
  out.setPosition(_p.x, y, _p.z);
  return out;
}

// --- triangle soup helpers with orientation control
class Soup {
  constructor() {
    this.pos = [];
    this.col = [];
  }
  tri(a, b, c, colr, want) {
    if (want) {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.dot(want) < 0) [b, c] = [c, b];
    }
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.col.push(colr);
  }
  quad(a, b, c, d, colr, want) {
    this.tri(a, b, c, colr, want);
    this.tri(a, c, d, colr, want);
  }
  into(builder) {
    if (this.pos.length) builder.tris(this.pos, this.col);
  }
}

const THEMES = [
  {
    // main campus: autumn
    lawn: '#a8e070',
    lawn2: '#93d05e',
    curb: '#d9d2c4',
    hedge: '#3f7f3a',
    earth: '#6b4a34',
    rock: '#7a6250',
    trees: ['#e3842f', '#d2552c', '#e8b63a', '#5f9a3e', '#c9472f', '#f0a23b'],
    bricks: ['#a24a38', '#b55a40', '#8e3d32', '#c06a4a', '#d9c9a6'],
    roof: ['#3f4654', '#4d5566', '#5b3c33'],
    outer: 48,
    depth: 7,
  },
  {
    // construction zone
    lawn: '#9a8a64',
    lawn2: '#8b7a55',
    curb: '#cfcac0',
    hedge: '#e26a2c',
    earth: '#6a5040',
    rock: '#6d5a4c',
    trees: ['#c9672f', '#a8562f', '#d9a03a', '#6d8a3e'],
    bricks: ['#9a4a3a', '#a8a39a', '#8a8a86', '#b8653f'],
    roof: ['#4a4f5a', '#5a5f6a'],
    outer: 20,
    depth: 16,
  },
  {
    // sky campus: floating islands
    lawn: '#8bcf6a',
    lawn2: '#79bd5a',
    curb: '#e8e2d6',
    hedge: '#cfc7b6',
    earth: '#6b4a5a',
    rock: '#5b4468',
    trees: ['#f29bb8', '#e86f9a', '#ffd06b', '#9fd36a', '#c08cf0'],
    bricks: ['#d9c9a6', '#e6d7b8', '#c8b48e'],
    roof: ['#5b6fb0', '#6a4fa0'],
    outer: 9,
    depth: 18,
  },
];
export const themeOf = stage => THEMES[stage];

// ----------------------------------------------------------------- material kit
// One Builder per material; Segments maps each key to a material.
export const KIT_KEYS = ['brick', 'plaster', 'stone', 'slate', 'concrete', 'grass', 'earth', 'leaf', 'bark', 'planks', 'marble', 'bronze', 'metal', 'props', 'glow', 'windows', 'water', 'spray'];
export function makeKit(rnd) {
  const K = {};
  for (const k of KIT_KEYS) K[k] = new Builder(rnd.next);
  K.cards = new Cards();
  K.wincards = new Cards();
  // aliases used by older helpers
  K.roof = K.slate;
  K.canopy = K.leaf;
  K.build = () => {
    const out = {};
    for (const k of KIT_KEYS) out[k] = K[k].build();
    out.cards = K.cards.build();
    out.wincards = K.wincards.build();
    return out;
  };
  return K;
}

// ----------------------------------------------------------------- sections
export function buildSection(seg, track) {
  const rnd = createRng(seg.seed);
  const T = THEMES[seg.stage];
  const H = sectionHeight(seg);
  const w = seg.w;
  const outer = w + 1.2 + (seg.stage === 0 ? T.outer : T.outer + rnd.range(0, 4));
  const ss = sampleS(seg.s0, seg.s1, 2);
  const K = makeKit(rnd);

  // ---- walkway: herringbone brick (UV-mapped, ~2 m per texture tile)
  const pathGeo = (() => {
    const pos = [];
    const uv = [];
    const idx = [];
    ss.forEach((s, i) => {
      const y = H(s) + 0.02;
      for (const d of [-w - 0.05, w + 0.05]) {
        const v = wp(track, s, d, y);
        pos.push(v.x, v.y, v.z);
        uv.push(d / 2, s / 2);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      g.setIndex(idx.map((_, k) => idx[k - (k % 3) + [0, 2, 1][k % 3]]));
      g.computeVertexNormals();
    }
    g.computeTangents && g.attributes.uv && g.index && g.computeTangents();
    g.computeBoundingSphere();
    return g;
  })();

  // ---- lawn in mowed bands, curbs, skirts and end caps
  const lawn = new Soup();
  const curb = new Soup();
  const earthS = new Soup();
  const lawnA = color(T.lawn);
  const lawnB = color(T.lawn2);
  const curbC = color(T.curb);
  const earth = color(T.earth);
  const rock = color(T.rock);
  const deep = T.depth;
  const bottomInset = seg.stage === 2 ? 0.45 : seg.stage === 1 ? 0.8 : 1;
  const band = 3;
  for (let i = 1; i < ss.length; i++) {
    const a = ss[i - 1];
    const b = ss[i];
    const ya = H(a);
    const yb = H(b);
    for (const side of [-1, 1]) {
      // mowed stripes running along the path
      let k = 0;
      for (let d0 = w + 1.15; d0 < outer - 0.01; d0 += band, k++) {
        const d1 = Math.min(outer, d0 + band);
        const c = (k % 2 ? lawnA : lawnB).clone().multiplyScalar(0.96 + 0.08 * pseudo(a * 0.3 + d0));
        lawn.quad(wp(track, a, side * d0, ya - 0.03), wp(track, b, side * d0, yb - 0.03), wp(track, b, side * d1, yb - 0.03), wp(track, a, side * d1, ya - 0.03), c, UP);
      }
      // curb between path and edge wall
      const c0 = side * (w + 0.05);
      const c1 = side * (w + 0.4);
      const ct = 0.16;
      const out = wp(track, a, side * 10, ya).sub(wp(track, a, 0, ya)).normalize();
      curb.quad(wp(track, a, c0, ya + ct), wp(track, b, c0, yb + ct), wp(track, b, c1, yb + ct), wp(track, a, c1, ya + ct), curbC, UP);
      curb.quad(wp(track, a, c0, ya), wp(track, b, c0, yb), wp(track, b, c0, yb + ct), wp(track, a, c0, ya + ct), curbC.clone().multiplyScalar(0.9), out.clone().negate());
      curb.quad(wp(track, a, c1, ya - 0.03), wp(track, b, c1, yb - 0.03), wp(track, b, side * (w + 1.15), yb - 0.03), wp(track, a, side * (w + 1.15), ya - 0.03), color('#8a7a62'), UP);
      // skirt down the outer edge, jagged and tapering for islands
      const oa = side * outer;
      const ia = side * outer * bottomInset;
      const ja = deep * (0.75 + 0.5 * pseudo(a * 0.37 + side));
      const jb = deep * (0.75 + 0.5 * pseudo(b * 0.37 + side));
      const top0 = wp(track, a, oa, ya - 0.03);
      const top1 = wp(track, b, oa, yb - 0.03);
      const bot0 = wp(track, a, ia, ya - ja);
      const bot1 = wp(track, b, ia, yb - jb);
      const mid0 = wp(track, a, side * outer * (0.5 + bottomInset * 0.5), ya - ja * 0.45);
      const mid1 = wp(track, b, side * outer * (0.5 + bottomInset * 0.5), yb - jb * 0.45);
      earthS.quad(top0, top1, mid1, mid0, earth.clone().multiplyScalar(0.92 + 0.12 * pseudo(a)), out);
      earthS.quad(mid0, mid1, bot1, bot0, rock.clone().multiplyScalar(0.85 + 0.15 * pseudo(a + 3)), out);
      if (seg.stage === 2) {
        const keel0 = wp(track, a, side * 1.5, ya - deep * 1.9 * (0.8 + 0.3 * pseudo(a * 0.5)));
        const keel1 = wp(track, b, side * 1.5, yb - deep * 1.9 * (0.8 + 0.3 * pseudo(b * 0.5)));
        earthS.quad(bot0, bot1, keel1, keel0, rock.clone().multiplyScalar(0.7), new THREE.Vector3(0, -1, 0).add(out).normalize());
      } else {
        earthS.quad(bot0, bot1, wp(track, b, 0, yb - jb), wp(track, a, 0, ya - ja), rock.clone().multiplyScalar(0.6), new THREE.Vector3(0, -1, 0));
      }
    }
  }
  // end caps: cliff faces where a crossing begins / ends
  for (const [s, dir] of [
    [seg.s0, -1],
    [seg.s1, 1],
  ]) {
    const y = H(s);
    track.pose(s, 0, _p);
    const n = new THREE.Vector3(Math.sin(_p.h) * dir, 0, -Math.cos(_p.h) * dir);
    const steps = 10;
    for (let k = 0; k < steps; k++) {
      const d0 = -outer + (2 * outer * k) / steps;
      const d1 = -outer + (2 * outer * (k + 1)) / steps;
      const j0 = deep * (0.75 + 0.5 * pseudo(d0 * 0.5 + s));
      const j1 = deep * (0.75 + 0.5 * pseudo(d1 * 0.5 + s));
      const lt = (d0 / outer) * bottomInset * outer;
      const rt = (d1 / outer) * bottomInset * outer;
      const strata = [earth, rock, rock.clone().multiplyScalar(0.8)];
      const levels = [0, 0.35, 0.7, 1];
      for (let l = 0; l < 3; l++) {
        const x0a = d0 + (lt - d0) * levels[l];
        const x0b = d0 + (lt - d0) * levels[l + 1];
        const x1a = d1 + (rt - d1) * levels[l];
        const x1b = d1 + (rt - d1) * levels[l + 1];
        earthS.quad(wp(track, s, x0a, y - 0.03 - j0 * levels[l]), wp(track, s, x1a, y - 0.03 - j1 * levels[l]), wp(track, s, x1b, y - 0.03 - j1 * levels[l + 1]), wp(track, s, x0b, y - 0.03 - j0 * levels[l + 1]), strata[l].clone().multiplyScalar(0.9 + 0.2 * pseudo(d0 + l)), n);
      }
      lawn.quad(wp(track, s, d0, y - 0.02), wp(track, s, d1, y - 0.02), wp(track, s, d1, y - 0.4), wp(track, s, d0, y - 0.4), lawnB.clone().multiplyScalar(0.8), n);
    }
  }
  lawn.into(K.grass);
  curb.into(K.concrete);
  earthS.into(K.earth);

  // ---- ramps become stone stairs
  const M = new THREE.Matrix4();
  for (const part of seg.parts) {
    if (!part.ramp) continue;
    const up = part.y1 > part.y0;
    const n = Math.round((part.s1 - part.s0) / 0.75);
    for (let k = 0; k < n; k++) {
      const s = part.s0 + ((k + 0.5) * (part.s1 - part.s0)) / n;
      const yTop = up ? part.y0 + ((k + 1) * (part.y1 - part.y0)) / n : part.y0 + (k * (part.y1 - part.y0)) / n;
      const lo = Math.min(part.y0, part.y1);
      const hgt = yTop - lo + 0.05;
      alongFrame(track, s, 0, lo + hgt / 2, M);
      K.concrete.addMatrix(new THREE.BoxGeometry(w * 2 + 0.1, hgt, (part.s1 - part.s0) / n + 0.02), M, k % 2 ? '#f0ece4' : '#e4ded2', 0.02);
    }
    for (const side of [-1, 1]) {
      const sm = (part.s0 + part.s1) / 2;
      const hi = Math.max(part.y0, part.y1);
      alongFrame(track, sm, side * (w + 0.25), (Math.min(part.y0, part.y1) + hi) / 2 + 0.4, M);
      K.stone.addMatrix(new THREE.BoxGeometry(0.5, Math.abs(part.y1 - part.y0) + 1, part.s1 - part.s0), M, '#efe6d4', 0.03);
    }
  }

  // ---- edge walls by stage
  for (let i = 1; i < ss.length; i++) {
    const a = ss[i - 1];
    const b = ss[i];
    const sm = (a + b) / 2;
    const ym = H(sm);
    const len = b - a + 0.04;
    for (const side of [-1, 1]) {
      if (seg.stage === 0) {
        // clipped boxwood hedge
        const hh = 0.82 + pseudo(sm * 0.7 + side) * 0.12;
        alongFrame(track, sm, side * (w + 0.78), ym + hh / 2, M);
        K.leaf.addMatrix(new THREE.BoxGeometry(0.72, hh, len), M, T.hedge, 0.08);
      } else if (seg.stage === 1) {
        alongFrame(track, sm, side * (w + 0.7), ym + 0.42, M);
        K.concrete.addMatrix(new THREE.BoxGeometry(0.55, 0.84, len), M, i % 3 === 0 ? '#f0f0ea' : '#e46a2a', 0.04);
      } else {
        alongFrame(track, sm, side * (w + 0.7), ym + 0.3, M);
        K.stone.addMatrix(new THREE.BoxGeometry(0.6, 0.6, len), M, '#efe6d4', 0.05);
        alongFrame(track, sm, side * (w + 0.7), ym + 0.95, M);
        K.metal.addMatrix(new THREE.BoxGeometry(0.08, 0.08, len), M, '#d8b56a', 0);
        if (i % 2 === 0) {
          alongFrame(track, a, side * (w + 0.7), ym + 0.75, M);
          K.metal.addMatrix(new THREE.BoxGeometry(0.07, 0.4, 0.07), M, '#d8b56a', 0);
        }
      }
    }
  }

  decorate(seg, track, { rnd, T, H, w, outer, K });
  return { path: pathGeo, ...K.build() };
}

function pseudo(x) {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// --------------------------------------------------------------- decoration
const BRICKS = ['#c0644f', '#b25444', '#a84e40', '#c46a52', '#b95c49'];

function decorate(seg, track, ctx) {
  const { rnd, T, H, w, outer, K } = ctx;
  const M = new THREE.Matrix4();
  const len = seg.s1 - seg.s0;
  const tree = (s, d) => {
    track.pose(s, d, _p);
    const y = H(s);
    const r = rnd.next();
    if (seg.stage === 2) (r < 0.5 ? magnolia : liveOak)(K, _p.x, y, _p.z, rnd, r < 0.5 ? 0.9 : 0.75);
    else if (r < 0.45) liveOak(K, _p.x, y, _p.z, rnd, rnd.range(0.85, 1.15));
    else if (r < 0.75) longleafPine(K, _p.x, y, _p.z, rnd, rnd.range(0.85, 1.1));
    else magnolia(K, _p.x, y, _p.z, rnd, rnd.range(0.8, 1.05));
  };

  // the opening gateway: brick piers with urns, an iron arch over the path
  if (seg.s0 < 1) {
    alongFrame(track, seg.s0 + 6, 0, H(seg.s0 + 6), M);
    gateway(K, M, w);
  }

  // lamp posts along both edges
  for (let s = seg.s0 + 6 + rnd.range(0, 4); s < seg.s1 - 4; s += rnd.range(15, 19)) {
    for (const side of [-1, 1]) {
      if (rnd.chance(0.12)) continue;
      lamp(track, s + (side > 0 ? 7 : 0), side, w + 1.55, H(s), seg.stage, K, rnd);
    }
  }
  // benches between lamps
  if (seg.stage !== 1) {
    for (let s = seg.s0 + 14; s < seg.s1 - 8; s += rnd.range(24, 40)) {
      const side = rnd.sign();
      frame(track, s, side * (w + 2.6), H(s), side, M);
      bench(M, K);
    }
  }

  if (seg.stage === 0) {
    // live oaks lining the walk so their limbs arch toward the path
    for (let s = seg.s0 + 4; s < seg.s1 - 3; s += rnd.range(9, 14)) {
      for (const side of [-1, 1]) {
        if (rnd.chance(0.2)) continue;
        track.pose(s + rnd.range(-2, 2), side * rnd.range(w + 3.4, w + 5), _p);
        liveOak(K, _p.x, H(s), _p.z, rnd, rnd.range(0.95, 1.2));
      }
    }
    // a second row of pines and magnolias further back
    for (let s = seg.s0 + 6; s < seg.s1 - 3; s += rnd.range(10, 16)) {
      for (const side of [-1, 1]) if (rnd.chance(0.7)) tree(s, side * rnd.range(w + 10, w + 15));
    }
    // azaleas and grass tufts along the hedge line
    for (let s = seg.s0 + 3; s < seg.s1 - 2; s += rnd.range(3, 6)) {
      const side = rnd.sign();
      track.pose(s, side * (w + 1.9), _p);
      if (rnd.chance(0.55)) azalea(K, _p.x, H(s), _p.z, rnd, rnd.range(0.8, 1.1));
      else tuft(K, _p.x, H(s), _p.z, rnd);
    }
    // Colonial Revival halls
    for (const side of [-1, 1]) {
      let s = seg.s0 + rnd.range(0, 8);
      while (s < seg.s1 - 10) {
        const bw = rnd.range(18, 28);
        if (s + bw > seg.s1 + 6) break;
        const depth = rnd.range(11, 15);
        const dOff = w + rnd.range(19, 24) + depth / 2;
        const cs = s + bw / 2;
        frame(track, cs, side * dOff, H(cs) - 0.1, side, M);
        hall(K, M, rnd, { w: bw, d: depth, floors: rnd.int(2, 3), brick: rnd.pick(BRICKS), cupola: rnd.chance(0.3), rotunda: rnd.chance(0.12), wings: bw > 24 && rnd.chance(0.5) });
        // foundation plantings
        for (let x = -bw / 2 + 1; x < bw / 2; x += 2.2) {
          const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, depth / 2 + 1.4));
          const p = new THREE.Vector3().setFromMatrixPosition(m);
          azalea(K, p.x, H(cs), p.z, rnd, 0.9);
        }
        s += bw + rnd.range(6, 14);
      }
    }
    // landmarks on the skyline: the domed rotunda, a stadium
    if (rnd.chance(0.32)) {
      const side = rnd.sign();
      const cs = seg.s0 + len * rnd.range(0.3, 0.7);
      frame(track, cs, side * (w + 52), H(cs) - 0.2, side, M);
      rotundaLandmark(K, M, rnd);
    } else if (rnd.chance(0.18)) {
      const side = rnd.sign();
      const cs = seg.s0 + len * 0.5;
      frame(track, cs, side * (w + 95), H(cs) - 0.5, side, M);
      stadium(K, M);
    }
    // plaza: a bronze eagle on a plinth, a food truck
    if (seg.plaza) {
      const side = rnd.sign();
      const cs = seg.s0 + len * 0.45;
      frame(track, cs, side * (w + 6), H(cs), side, M);
      eagleStatue(K, M);
      frame(track, cs + 18, -side * (w + 4.5), H(cs), -side, M);
      foodTruck(M, K, rnd);
    }
  } else if (seg.stage === 1) {
    for (let s = seg.s0 + 6; s < seg.s1 - 4; s += rnd.range(9, 16)) {
      const side = rnd.sign();
      const d = side * rnd.range(w + 2.5, Math.min(outer - 2, w + 9));
      if (rnd.chance(0.55)) {
        frame(track, s, d, H(s), side, M);
        cones(M, K, rnd);
      } else tree(s, d);
    }
    for (const side of [-1, 1]) {
      if (rnd.chance(0.35)) continue;
      const cs = seg.s0 + len * rnd.range(0.25, 0.75);
      frame(track, cs, side * (outer + 10), H(cs) - 4, side, M);
      frameBuilding(M, K, rnd);
    }
    if (rnd.chance(0.55)) {
      const side = rnd.sign();
      const cs = seg.s0 + len * rnd.range(0.2, 0.8);
      frame(track, cs, side * (outer + 26), H(cs) - 10, side, M);
      crane(M, K, rnd);
    }
  } else {
    // sky campus: magnolias and oaks on the island, floating halls and rocks
    for (let s = seg.s0 + 5; s < seg.s1 - 3; s += rnd.range(8, 13)) {
      const side = rnd.sign();
      tree(s, side * rnd.range(w + 3, outer - 1.5));
    }
    if (rnd.chance(0.5)) {
      const side = rnd.sign();
      const cs = seg.s0 + len * rnd.range(0.3, 0.7);
      frame(track, cs, side * (outer + 16), H(cs) - rnd.range(2, 8), side, M);
      floatingHall(M, K, T, rnd);
    }
    for (let k = 0; k < 6; k++) {
      const side = rnd.sign();
      const cs = seg.s0 + len * rnd.next();
      const d = side * (outer + rnd.range(6, 30));
      track.pose(cs, d, _p);
      const sz = rnd.range(1, 3.4);
      const yy = H(cs) + rnd.range(-14, 6);
      K.earth.add(new THREE.IcosahedronGeometry(sz, 0), { pos: [_p.x, yy, _p.z], rot: [rnd.next() * 3, rnd.next() * 3, 0], scale: [1, 0.6, 1], color: T.rock, jitter: 0.2 });
      K.grass.add(new THREE.CylinderGeometry(sz * 0.9, sz * 0.75, 0.3, 7), { pos: [_p.x, yy + sz * 0.4, _p.z], color: T.lawn, jitter: 0.08 });
    }
  }
}

function lamp(track, s, side, d, y, stage, K, rnd) {
  const M = frame(track, s, side * d, y, side);
  const part = (geo, pos, c, b = K.metal, rot) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    b.addMatrix(geo, M.clone().multiply(m), c, 0);
  };
  // black acorn-globe lamp post
  const pole = stage === 1 ? '#e8b028' : '#1f2224';
  part(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), [0, 0.25, 0], pole);
  part(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 10), [0, 2.1, 0], pole);
  part(new THREE.CylinderGeometry(0.16, 0.1, 0.25, 10), [0, 3.9, 0], pole);
  part(new THREE.SphereGeometry(0.26, 14, 10), [0, 4.25, 0], '#ffe2b0', K.glow);
  part(new THREE.ConeGeometry(0.12, 0.25, 10), [0, 4.62, 0], pole);
  if (stage !== 1 && rnd.chance(0.5)) {
    // banner pair in gold and black
    const c = rnd.chance(0.5) ? '#d4a82a' : '#1d1d20';
    part(new THREE.BoxGeometry(0.04, 1.1, 0.55), [0, 2.8, 0.34], c, K.props);
    part(new THREE.BoxGeometry(0.03, 0.03, 0.62), [0, 3.38, 0.3], pole);
  }
}

function bench(M, K) {
  const add = (geo, pos, c, b = K.planks) => b.addMatrix(geo, M.clone().multiply(new THREE.Matrix4().makeTranslation(...pos)), c, 0.03);
  for (const z of [-0.14, 0, 0.14]) add(new THREE.BoxGeometry(1.9, 0.05, 0.12), [0, 0.48, z], '#c08a5a');
  for (const y of [0.68, 0.84]) add(new THREE.BoxGeometry(1.9, 0.1, 0.04), [0, y, -0.24], '#c08a5a');
  for (const x of [-0.8, 0.8]) {
    add(new THREE.BoxGeometry(0.06, 0.48, 0.5), [x, 0.24, 0], '#1f2224', K.metal);
    add(new THREE.BoxGeometry(0.06, 0.5, 0.06), [x, 0.7, -0.24], '#1f2224', K.metal);
  }
  add(new THREE.CylinderGeometry(0.26, 0.24, 0.85, 12), [1.45, 0.42, 0], '#2f3a34', K.metal);
}

function foodTruck(M, K, rnd) {
  const add = (geo, pos, c, b = K.props) => b.addMatrix(geo, M.clone().multiply(new THREE.Matrix4().makeTranslation(...pos)), c, 0.03);
  const c = rnd.pick(['#ff8a3d', '#3fb4e8', '#f2c63a', '#e8476a']);
  add(new THREE.BoxGeometry(5.6, 2.6, 2.4), [0, 1.9, 0], c, K.metal);
  add(new THREE.BoxGeometry(1.8, 1.8, 2.3), [3.6, 1.5, 0], c, K.metal);
  add(new THREE.BoxGeometry(3, 1, 0.1), [-0.4, 2.2, 1.22], '#2a2f36');
  add(new THREE.BoxGeometry(3.4, 0.12, 0.9), [-0.4, 1.55, 1.6], '#f5f0e6', K.metal);
  add(new THREE.BoxGeometry(2.8, 0.5, 0.06), [-0.4, 3.4, 1.21], '#fff6e0', K.glow);
  for (const x of [-1.8, 1.8, 3.6]) for (const z of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), [x, 0.42, z], '#222');
}

function cones(M, K, rnd) {
  const n = rnd.int(2, 4);
  for (let i = 0; i < n; i++) {
    const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(rnd.range(-1.4, 1.4), 0.35, rnd.range(-1, 1)));
    K.props.addMatrix(new THREE.ConeGeometry(0.25, 0.7, 12), m, i % 2 ? '#ff7a2a' : '#ff9a3a', 0.04);
  }
  K.earth.addMatrix(new THREE.IcosahedronGeometry(1.6, 1), M.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.6, -2.5)).multiply(new THREE.Matrix4().makeScale(1.4, 0.6, 1)), '#a08060', 0.15);
}

function frameBuilding(M, K, rnd) {
  const floors = rnd.int(3, 6);
  const W = rnd.range(14, 22);
  const D = 10;
  const add = (geo, pos, c, b = K.concrete) => b.addMatrix(geo, M.clone().multiply(new THREE.Matrix4().makeTranslation(...pos)), c, 0.05);
  for (let f = 0; f <= floors; f++) add(new THREE.BoxGeometry(W, 0.4, D), [0, f * 3.4, 0], '#d6d2ca');
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 4) for (const z of [-D / 2, D / 2]) add(new THREE.BoxGeometry(0.5, floors * 3.4, 0.5), [x, (floors * 3.4) / 2, z], '#cfcbc2');
  for (let f = 0; f < floors; f++) add(new THREE.BoxGeometry(W + 1.2, 0.08, 0.08), [0, f * 3.4 + 1.2, D / 2 + 0.6], '#e0b030', K.metal);
  add(new THREE.SphereGeometry(0.25, 6, 4), [W / 2, floors * 3.4 + 0.5, D / 2], '#ff5a3a', K.glow);
}

function crane(M, K, rnd) {
  const h = rnd.range(30, 42);
  const add = (geo, pos, c, b = K.metal) => b.addMatrix(geo, M.clone().multiply(new THREE.Matrix4().makeTranslation(...pos)), c, 0.02);
  add(new THREE.BoxGeometry(1.2, h, 1.2), [0, h / 2, 0], '#e8b020');
  add(new THREE.BoxGeometry(26, 0.9, 0.9), [7, h, 0], '#e8b020');
  add(new THREE.BoxGeometry(3, 1.6, 1.6), [-5, h - 0.6, 0], '#555a60');
  add(new THREE.BoxGeometry(0.06, 9, 0.06), [16, h - 4.5, 0], '#333');
  add(new THREE.SphereGeometry(0.3, 6, 4), [20, h + 0.6, 0], '#ff3a2a', K.glow);
}

function floatingHall(M, K, T, rnd) {
  const add = (geo, pos, c, b) => b.addMatrix(geo, M.clone().multiply(new THREE.Matrix4().makeTranslation(...pos)), c, 0.06);
  add(new THREE.CylinderGeometry(12, 3, 10, 9), [0, -5, 0], T.rock, K.earth);
  add(new THREE.CylinderGeometry(12.2, 12, 0.5, 9), [0, 0, 0], T.lawn, K.grass);
  hall(K, M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0)), rnd, { w: 14, d: 9, floors: 2, brick: rnd.pick(BRICKS), cupola: true });
  for (const x of [-9, 9]) {
    const p = new THREE.Vector3().setFromMatrixPosition(M.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0.2, 2)));
    magnolia(K, p.x, p.y, p.z, rnd, 0.7);
  }
}

// ---------------------------------------------------------------- crossings
export function buildCrossing(seg, world, prevSeg) {
  const track = world.track;
  const rnd = createRng(seg.seed);
  const T = THEMES[seg.stage];
  const K = makeKit(rnd);
  const props = K.props;
  const metal = K.metal;
  const glow = K.glow;
  const terrain = K.earth;
  const M = new THREE.Matrix4();
  const pads = seg.padIds.map(id => world.surfaces.pads.find(p => p.id === id)).filter(Boolean);
  const collapse = [];
  const y0 = seg.y0;
  const len = seg.s1 - seg.s0;
  let water = null;

  // what is below: creek (campus), pit (construction), sky (islands)
  if (seg.stage === 0) {
    const outer = 48;
    const yW = Math.min(seg.y0, seg.y1) - 5.2;
    const pos = [];
    const ss = sampleS(seg.s0 - 2, seg.s1 + 2, 2);
    ss.forEach(s => {
      for (const d of [-outer - 2, outer + 2]) {
        track.pose(s, d, _p);
        pos.push(_p.x, yW, _p.z);
      }
    });
    const idx = [];
    for (let i = 1; i < ss.length; i++) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    water = new THREE.BufferGeometry();
    water.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    water.setIndex(idx);
    water.computeBoundingSphere();
    // reeds and rocks along the creek
    for (let k = 0; k < 10; k++) {
      track.pose(seg.s0 + len * rnd.next(), rnd.range(-30, 30), _p);
      props.add(new THREE.IcosahedronGeometry(rnd.range(0.4, 1.2), 0), { pos: [_p.x, yW + 0.1, _p.z], color: '#8a8a82', jitter: 0.2, scale: [1, 0.6, 1] });
    }
  } else if (seg.stage === 1) {
    const yP = Math.min(seg.y0, seg.y1) - 13;
    for (let k = 0; k < 14; k++) {
      track.pose(seg.s0 + len * rnd.next(), rnd.range(-18, 18), _p);
      terrain.add(new THREE.IcosahedronGeometry(rnd.range(1, 3), 0), { pos: [_p.x, yP, _p.z], color: rnd.pick(['#6a5040', '#7a6a5a', '#8a8a86']), jitter: 0.2, scale: [1.4, 0.5, 1.2] });
    }
  }

  // hazard markers: a wide striped band at the edge, tall posts, and an
  // overhead gantry before it so the jump reads from far away
  const markEdge = (s, y, w, dir, gantry = true) => {
    const band = 1.8;
    alongFrame(track, s - dir * (band / 2 + 0.05), 0, y + 0.05, M);
    const stripe = 0.9;
    for (let k = -w; k < w - 0.01; k += stripe) {
      const width = Math.min(stripe, w - k);
      const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(k + width / 2, 0, 0)).multiply(new THREE.Matrix4().makeRotationY(0.5));
      props.addMatrix(new THREE.BoxGeometry(width * 0.62, 0.06, band * 1.15), m, Math.round((k + w) / stripe) % 2 ? '#1d1d1d' : '#ffd21f', 0);
    }
    alongFrame(track, s - dir * (band / 2 + 0.05), 0, y + 0.02, M);
    props.addMatrix(new THREE.BoxGeometry(w * 2, 0.04, band), M, '#1d1d1d', 0);
    for (const side of [-1, 1]) {
      alongFrame(track, s - dir * 0.4, side * (w + 0.6), y, M);
      props.addMatrix(new THREE.BoxGeometry(0.22, 1.7, 0.22), M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.85, 0)), '#ffd21f', 0);
      for (let k = 0; k < 3; k++) props.addMatrix(new THREE.BoxGeometry(0.24, 0.16, 0.24), M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.3 + k * 0.5, 0)), '#1d1d1d', 0);
      glow.addMatrix(new THREE.SphereGeometry(0.2, 8, 6), M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.85, 0)), '#ffaa1a', 0);
    }
    if (!gantry) return;
    // overhead warning board a few metres before the edge
    const gs = s - dir * 9;
    alongFrame(track, gs, 0, y, M);
    const span = w + 0.7;
    for (const side of [-1, 1]) {
      props.addMatrix(new THREE.BoxGeometry(0.24, 7.4, 0.24), M.clone().multiply(new THREE.Matrix4().makeTranslation(side * span, 3.7, 0)), '#2a2a2a', 0);
    }
    props.addMatrix(new THREE.BoxGeometry(span * 2 + 0.3, 1.2, 0.16), M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 6.9, 0)), '#ffd21f', 0);
    // chevrons pointing up: jump!
    const n = Math.max(3, Math.round(span / 1.1));
    for (let k = 0; k < n; k++) {
      const x = -span + 0.7 + (k * (span * 2 - 1.4)) / Math.max(1, n - 1);
      for (const sgn of [-1, 1]) {
        const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(x + sgn * 0.17, 6.92, 0.09)).multiply(new THREE.Matrix4().makeRotationZ(sgn * 0.75));
        props.addMatrix(new THREE.BoxGeometry(0.14, 0.62, 0.04), m, '#1d1d1d', 0);
      }
    }
    for (const side of [-1, 1]) glow.addMatrix(new THREE.SphereGeometry(0.24, 8, 6), M.clone().multiply(new THREE.Matrix4().makeTranslation(side * span, 7.65, 0)), '#ff8a1a', 0);
  };

  const plankRun = (p, style) => {
    const n = Math.max(1, Math.round((p.s1 - p.s0) / 0.9));
    const hw = (p.dr - p.dl) / 2;
    const dc = (p.dr + p.dl) / 2;
    for (let k = 0; k < n; k++) {
      const s = p.s0 + ((k + 0.5) * (p.s1 - p.s0)) / n;
      const y = p.y0 + (p.y1 - p.y0) * ((s - p.s0) / (p.s1 - p.s0));
      alongFrame(track, s, dc, y - 0.08, M);
      M.multiply(new THREE.Matrix4().makeRotationY((rnd.next() - 0.5) * 0.05));
      const c = style === 'stone' ? (k % 2 ? '#f2ece0' : '#e6dece') : style === 'steel' ? '#7b828a' : k % 2 ? '#d8b088' : '#c8a07a';
      (style === 'steel' ? metal : style === 'stone' ? K.stone : K.planks).addMatrix(new THREE.BoxGeometry(hw * 2 + 0.1, 0.16, ((p.s1 - p.s0) / n) * 0.92), M, c, 0.08);
    }
  };

  const rails = (s0, s1, hw, yA, yB, style) => {
    const step = 2.2;
    for (let s = s0; s <= s1 + 0.01; s += step) {
      const y = yA + (yB - yA) * ((s - s0) / Math.max(0.01, s1 - s0));
      for (const side of [-1, 1]) {
        alongFrame(track, s, side * (hw + 0.1), y, M);
        const post = style === 'stone' ? new THREE.BoxGeometry(0.3, 1.0, 0.3) : new THREE.CylinderGeometry(0.06, 0.07, 1.15, 6);
        (style === 'steel' ? metal : style === 'stone' ? K.stone : K.planks).addMatrix(post, M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.55, 0)), style === 'stone' ? '#d7cdbb' : style === 'steel' ? '#e0b030' : '#6a4a30', 0.05);
      }
    }
    const ss = sampleS(s0, s1, 2);
    for (let i = 1; i < ss.length; i++) {
      const a = ss[i - 1];
      const b = ss[i];
      const ya = yA + (yB - yA) * ((a - s0) / Math.max(0.01, s1 - s0));
      const yb = yA + (yB - yA) * ((b - s0) / Math.max(0.01, s1 - s0));
      for (const side of [-1, 1]) {
        alongFrame(track, (a + b) / 2, side * (hw + 0.1), (ya + yb) / 2 + 1.05, M);
        const pitch = Math.atan2(yb - ya, b - a);
        M.multiply(new THREE.Matrix4().makeRotationX(pitch));
        const thick = style === 'stone' ? 0.22 : 0.06;
        (style === 'steel' ? metal : style === 'stone' ? K.stone : props).addMatrix(new THREE.BoxGeometry(thick, thick, b - a + 0.05), M, style === 'stone' ? '#f4eee2' : style === 'steel' ? '#e0b030' : '#c9b58a', 0.02);
      }
    }
  };

  const style = seg.stage === 0 ? 'stone' : seg.stage === 1 ? 'steel' : 'rope';

  switch (seg.type) {
    case 'bridge':
    case 'narrow':
    case 'broken': {
      const hw = seg.w;
      for (const p of pads) plankRun(p, style);
      rails(seg.s0, seg.s1, hw, seg.y0, seg.y1, style);
      // supports
      const supports = Math.max(1, Math.floor(len / 14));
      for (let k = 1; k <= supports; k++) {
        const s = seg.s0 + (len * k) / (supports + 1);
        const g = world.surfaces.groundAt(s, 0, 1e9);
        if (!g) continue;
        for (const side of [-1, 1]) {
          alongFrame(track, s, side * hw * 0.8, g.h - 5, M);
          (style === 'steel' ? metal : style === 'stone' ? K.stone : K.planks).addMatrix(new THREE.BoxGeometry(0.5, 10, 0.5), M, style === 'stone' ? '#e6dece' : style === 'steel' ? '#7b828a' : '#9a7a5a', 0.05);
        }
      }
      if (seg.type === 'broken') {
        for (const h of seg.holes) {
          markEdge(h.s0, y0, hw, 1, false);
          // dangling plank
          alongFrame(track, h.s0 + 0.3, rnd.range(-hw * 0.5, hw * 0.5), y0 - 0.7, M);
          M.multiply(new THREE.Matrix4().makeRotationX(1.1));
          props.addMatrix(new THREE.BoxGeometry(hw * 1.2, 0.14, 0.8), M, '#8a5a32', 0.05);
        }
      }
      break;
    }
    case 'collapse': {
      rails(seg.s0, seg.s1, seg.w, y0, y0, style);
      for (const p of pads) {
        const b = new Builder(rnd.next);
        const sm = (p.s0 + p.s1) / 2;
        // the plank is built around its own centre so it can fall and spin
        track.pose(sm, 0, _p);
        const center = new THREE.Vector3(_p.x, y0 - 0.08, _p.z);
        const local = new THREE.Matrix4().makeRotationY(-_p.h);
        const pieces = 3;
        for (let k = 0; k < pieces; k++) {
          const sl = (p.s1 - p.s0) / pieces;
          const m = local.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -((k + 0.5) * sl - (p.s1 - p.s0) / 2)));
          b.addMatrix(new THREE.BoxGeometry(seg.w * 2 + 0.1, 0.16, sl * 0.9), m, k % 2 ? '#a07a52' : '#94704a', 0.12);
        }
        // crack lines
        b.addMatrix(new THREE.BoxGeometry(seg.w * 1.4, 0.02, 0.06), local.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.09, 0)).multiply(new THREE.Matrix4().makeRotationY(0.4)), '#3a2a1a', 0);
        collapse.push({ padId: p.id, geo: b.build(), center });
      }
      markEdge(seg.s0, y0, seg.w, 1, false);
      break;
    }
    case 'stones': {
      for (const p of pads) {
        const sm = (p.s0 + p.s1) / 2;
        const dc = (p.dl + p.dr) / 2;
        track.pose(sm, dc, _p);
        const r = Math.min((p.s1 - p.s0) / 2, (p.dr - p.dl) / 2) + 0.15;
        const scaleZ = (p.s1 - p.s0) / 2 / r;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(_p.x, y0 - 0.35, _p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -_p.h, 0)), new THREE.Vector3(1, 1, Math.max(1, scaleZ)));
        if (seg.stage === 2) {
          props.addMatrix(new THREE.CylinderGeometry(r, r * 0.95, 0.5, 9), m, T.lawn, 0.1);
          props.addMatrix(new THREE.ConeGeometry(r * 0.95, 5, 7), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -2.7, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI)), T.rock, 0.15);
        } else {
          props.addMatrix(new THREE.CylinderGeometry(r, r * 1.1, 0.7, 9), m, '#b8b0a2', 0.1);
          props.addMatrix(new THREE.CylinderGeometry(r * 1.05, r * 1.15, 6, 9), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -3.3, 0)), '#8a8478', 0.1);
        }
      }
      markEdge(seg.s0, y0, prevSeg ? prevSeg.w : 4, 1);
      break;
    }
    case 'gap':
    case 'doubleGap':
    case 'drop': {
      const w = seg.w || 4;
      markEdge(seg.s0, y0, w, 1);
      break;
    }
    case 'bounce': {
      const p = pads[0];
      if (p) {
        const hw = (p.dr - p.dl) / 2;
        alongFrame(track, (p.s0 + p.s1) / 2, 0, y0 + 0.02, M);
        props.addMatrix(new THREE.BoxGeometry(hw * 2 - 0.2, 0.12, p.s1 - p.s0), M, '#2a2f4a', 0.02);
        for (let k = -hw + 0.6; k < hw - 0.4; k += 1.2) {
          const m = M.clone().multiply(new THREE.Matrix4().makeTranslation(k, 0.08, 0)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
          glow.addMatrix(new THREE.CircleGeometry(0.42, 3), m, '#3dffb0', 0);
        }
      }
      break;
    }
    default:
      break;
  }

  return { ...K.build(), water, collapse };
}
