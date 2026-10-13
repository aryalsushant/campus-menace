import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Collects flat-shaded, vertex-coloured pieces and merges them into one
// BufferGeometry, so a whole campus chunk is a handful of draw calls.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function prep(geo, color, jitter = 0, rnd = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  // per-face jitter keeps big flat areas from looking plastic
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (jitter ? (rnd() - 0.5) * jitter : 0);
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = _c.r * k;
      col[(i + j) * 3 + 1] = _c.g * k;
      col[(i + j) * 3 + 2] = _c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Builder {
  constructor(rnd = Math.random) {
    this.parts = [];
    this.rnd = rnd;
  }

  // add any geometry with a transform: pos [x,y,z], rot [x,y,z] (radians), scale
  add(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, color = '#ffffff', jitter = 0.06 } = {}) {
    const g = prep(geo, color, jitter, this.rnd);
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _v.set(pos[0], pos[1], pos[2]);
    if (typeof scale === 'number') _s.setScalar(scale);
    else _s.set(scale[0], scale[1], scale[2]);
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    this.parts.push(g);
    return this;
  }

  addMatrix(geo, matrix, color, jitter = 0.06) {
    const g = prep(geo, color, jitter, this.rnd);
    g.applyMatrix4(matrix);
    this.parts.push(g);
    return this;
  }

  box(w, h, d, opts) {
    return this.add(new THREE.BoxGeometry(w, h, d), opts);
  }

  // raw triangles already in world space: positions = flat array, colors per triangle
  tris(positions, colors) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const n = positions.length / 3;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = colors[Math.floor(i / 3)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.parts.push(g);
    return this;
  }

  build() {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

// Gabled roof prism, width along x, depth along z, peak along z axis
export function gableGeometry(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

export const color = c => new THREE.Color(c);
