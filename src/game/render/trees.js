import * as THREE from 'three';
import { TILE } from './foliage';

// Trees of a Deep South campus, built from bark-textured limbs and
// alpha-tested foliage cards. `K` is the chunk's material kit: K.bark is a
// Builder (triplanar bark), K.cards collects foliage cards.

const _c = new THREE.Color();
const tint = (hex, rnd, j = 0.12) => {
  _c.set(hex);
  const k = 1 + (rnd.next() - 0.5) * j;
  return _c.clone().multiplyScalar(k);
};

// a tapered tube along a curve, merged into the bark builder
function limb(K, points, r0, r1, color, seg = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, seg, 1, 7, false);
  // taper the radius from r0 at the base to r1 at the tip
  const pos = tube.attributes.position;
  const n = tube.parameters.tubularSegments;
  const radial = tube.parameters.radialSegments;
  const center = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPointAt(t, center);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  tube.computeVertexNormals();
  K.bark.add(tube, { color, jitter: 0.05 });
  return curve;
}

// Live oak: short trunk, long low limbs reaching out, wide canopy, moss
export function liveOak(K, x, y, z, rnd, size = 1) {
  const bark = tint('#8a7a6a', rnd);
  const trunkH = 2.2 * size;
  const base = new THREE.Vector3(x, y, z);
  limb(K, [base.clone().add(new THREE.Vector3(0, -0.3, 0)), base.clone().add(new THREE.Vector3(0.1, trunkH * 0.5, 0.05)), base.clone().add(new THREE.Vector3(0, trunkH, 0))], 0.62 * size, 0.48 * size, bark, 4);
  const limbs = rnd.int(4, 6);
  const leaf = new THREE.Color();
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rnd.range(-0.4, 0.4);
    const reach = rnd.range(4.5, 7.5) * size;
    // limbs climb high enough to arch over the walk above the camera
    const lift = rnd.range(2.8, 4.4) * size;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = base.clone().add(new THREE.Vector3(0, trunkH * rnd.range(0.75, 1), 0));
    const mid = start.clone().addScaledVector(dir, reach * 0.5).add(new THREE.Vector3(0, lift, 0));
    const end = start.clone().addScaledVector(dir, reach).add(new THREE.Vector3(0, lift * rnd.range(0.75, 1.05), 0));
    const curve = limb(K, [start, mid, end], 0.34 * size, 0.08 * size, bark, 10);
    // leaf clusters along the outer two thirds and over the top
    // fewer, fuller clusters: same canopy, far less overdraw
    const clusters = rnd.int(6, 8);
    for (let k = 0; k < clusters; k++) {
      const t = rnd.range(0.3, 1);
      const p = curve.getPointAt(t).add(new THREE.Vector3(rnd.range(-1.2, 1.2), rnd.range(0.2, 1.6), rnd.range(-1.2, 1.2)).multiplyScalar(size));
      leaf.set('#6e8c3e').offsetHSL(rnd.range(-0.03, 0.03), rnd.range(-0.05, 0.05), rnd.range(-0.06, 0.05));
      const sz = rnd.range(2.8, 4.0) * size;
      K.cards.flat(p, sz, TILE.oak, leaf, 1, rnd.range(0, 6.28), rnd.range(0.15, 0.6));
      if (rnd.chance(0.4)) K.cards.cross(p.clone().add(new THREE.Vector3(0, 0.3, 0)), sz * 0.85, sz * 0.7, TILE.oak, leaf, 1, rnd.range(0, 6.28));
    }
    // Spanish moss hanging from the limb
    const moss = rnd.int(2, 4);
    for (let k = 0; k < moss; k++) {
      const p = curve.getPointAt(rnd.range(0.35, 0.9));
      const h = rnd.range(1.0, 1.8) * size;
      p.y -= h / 2;
      K.cards.cross(p, rnd.range(0.7, 1.1) * size, h, TILE.moss, tint('#a8b090', rnd, 0.2), 0.6, rnd.range(0, 6.28));
    }
  }
  // crown on top
  for (let k = 0; k < 4; k++) {
    const p = base.clone().add(new THREE.Vector3(rnd.range(-2.5, 2.5), trunkH + rnd.range(3.6, 5.2), rnd.range(-2.5, 2.5)).multiplyScalar(size));
    leaf.set('#78963f').offsetHSL(rnd.range(-0.03, 0.03), 0, rnd.range(-0.05, 0.06));
    K.cards.flat(p, rnd.range(3.2, 4.4) * size, TILE.oak, leaf, 1, rnd.range(0, 6.28), rnd.range(0.05, 0.4));
  }
}

// Longleaf pine: tall straight trunk, needle tufts at the top
export function longleafPine(K, x, y, z, rnd, size = 1) {
  const H = rnd.range(12, 17) * size;
  const lean = new THREE.Vector3(rnd.range(-0.4, 0.4), 0, rnd.range(-0.4, 0.4));
  const base = new THREE.Vector3(x, y, z);
  const top = base.clone().add(new THREE.Vector3(0, H, 0)).add(lean);
  const trunk = limb(K, [base.clone().add(new THREE.Vector3(0, -0.3, 0)), base.clone().add(new THREE.Vector3(0, H * 0.5, 0)).addScaledVector(lean, 0.4), top], 0.32 * size, 0.1 * size, tint('#7a5a44', rnd), 8);
  const green = new THREE.Color();
  const branches = rnd.int(5, 7);
  for (let i = 0; i < branches; i++) {
    const t = rnd.range(0.62, 0.97);
    const p = trunk.getPointAt(t);
    const a = rnd.range(0, 6.28);
    const len = rnd.range(1.2, 2.6) * size * (1.2 - t);
    const tip = p.clone().add(new THREE.Vector3(Math.cos(a) * len, rnd.range(0.2, 0.8), Math.sin(a) * len));
    limb(K, [p, p.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.2, 0)), tip], 0.08 * size, 0.03 * size, tint('#6a4a36', rnd), 4);
    green.set('#5e8034').offsetHSL(rnd.range(-0.03, 0.03), 0, rnd.range(-0.05, 0.05));
    K.cards.cross(tip, rnd.range(1.6, 2.4) * size, rnd.range(1.4, 2) * size, TILE.pine, green, 0.8, rnd.range(0, 6.28));
    K.cards.flat(tip.clone().add(new THREE.Vector3(0, 0.2, 0)), rnd.range(1.6, 2.2) * size, TILE.pine, green, 0.8, rnd.range(0, 6.28), 0.2);
  }
  green.set('#638638');
  K.cards.cross(top.clone().add(new THREE.Vector3(0, 0.6, 0)), 2.2 * size, 2.4 * size, TILE.pine, green, 0.8, rnd.range(0, 6.28));
}

// Southern magnolia: dense dark cone with white blossoms
export function magnolia(K, x, y, z, rnd, size = 1) {
  const base = new THREE.Vector3(x, y, z);
  const H = rnd.range(6, 8) * size;
  limb(K, [base.clone().add(new THREE.Vector3(0, -0.3, 0)), base.clone().add(new THREE.Vector3(0, H * 0.45, 0))], 0.28 * size, 0.18 * size, tint('#6e6458', rnd), 3);
  const green = new THREE.Color();
  const layers = 5;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const r = (1 - t * 0.85) * 2.3 * size;
    const yy = y + 1.2 * size + t * (H - 1.4 * size);
    const n = Math.max(3, Math.round(5 * (1 - t * 0.5)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + l;
      const p = new THREE.Vector3(x + Math.cos(a) * r * 0.6, yy, z + Math.sin(a) * r * 0.6);
      green.set('#46663a').offsetHSL(rnd.range(-0.02, 0.02), 0, rnd.range(-0.04, 0.05));
      K.cards.cross(p, r * 1.3, r * 1.15, TILE.magnolia, green, 0.5, a);
    }
  }
}

// Azalea mound: low flowering shrub
export function azalea(K, x, y, z, rnd, size = 1) {
  const n = rnd.int(3, 5);
  const c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    const p = new THREE.Vector3(x + rnd.range(-0.6, 0.6) * size, y + 0.45 * size, z + rnd.range(-0.6, 0.6) * size);
    c.set('#ffffff').multiplyScalar(rnd.range(0.85, 1.05));
    K.cards.cross(p, rnd.range(1.1, 1.6) * size, rnd.range(0.9, 1.2) * size, TILE.azalea, c, 0.3, rnd.range(0, 6.28));
  }
}

// small grass tuft (crossed cards) for lawn edges and planters
export function tuft(K, x, y, z, rnd, size = 1) {
  const c = new THREE.Color('#ffffff').multiplyScalar(rnd.range(0.8, 1.05));
  K.cards.cross(new THREE.Vector3(x, y + 0.25 * size, z), 0.7 * size, 0.5 * size, TILE.tuft, c, 0.6, rnd.range(0, 6.28));
}
