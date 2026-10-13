import * as THREE from 'three';

// Deep South campus architecture: red-brick Colonial Revival halls with
// stone quoins, white porticos and hipped slate roofs; a domed rotunda
// landmark with four porticos and a fountain; a brick gateway with urns;
// a bronze eagle; a stadium bowl. All generic, nothing named.
//
// Every function draws in a local frame `M` (+z faces the path) into the
// chunk's material kit `K` (brick, plaster, stone, slate, concrete, metal,
// marble, bronze, glow, windows, props).

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function put(b, M, geo, pos, color, rot = [0, 0, 0], scale = 1, jitter = 0.04) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _v.set(pos[0], pos[1], pos[2]);
  if (typeof scale === 'number') _s.setScalar(scale);
  else _s.set(scale[0], scale[1], scale[2]);
  const m = new THREE.Matrix4().compose(_v, _q, _s);
  b.addMatrix(geo, M.clone().multiply(m), color, jitter);
}

// hipped roof: four slopes up to a ridge along x (w >= d)
export function hipRoofGeometry(w, d, h) {
  const a = w / 2;
  const b = d / 2;
  const r = Math.max(0, a - b);
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const c = [P(-a, 0, -b), P(a, 0, -b), P(a, 0, b), P(-a, 0, b)];
  const ridge = [P(-r, h, 0), P(r, h, 0)];
  const tris = [
    [c[3], c[2], ridge[1]],
    [c[3], ridge[1], ridge[0]],
    [c[1], c[0], ridge[0]],
    [c[1], ridge[0], ridge[1]],
    [c[2], c[1], ridge[1]],
    [c[0], c[3], ridge[0]],
  ];
  const pos = [];
  for (const t of tris) for (const p of t) pos.push(p.x, p.y, p.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function gable(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

// cast-stone urn (lathe)
let urnGeo = null;
function urn() {
  if (urnGeo) return urnGeo;
  const pts = [
    [0, 0],
    [0.22, 0],
    [0.22, 0.08],
    [0.12, 0.14],
    [0.1, 0.24],
    [0.3, 0.42],
    [0.34, 0.62],
    [0.26, 0.8],
    [0.3, 0.84],
    [0, 0.86],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  urnGeo = new THREE.LatheGeometry(pts, 14);
  return urnGeo;
}

const WHITE = '#f4efe6';
const STONE = '#e8dcc6';

// a classical column with base and capital
function column(K, M, x, y, z, h, r = 0.3) {
  put(K.stone, M, new THREE.BoxGeometry(r * 2.6, 0.3, r * 2.6), [x, y + 0.15, z], STONE);
  put(K.plaster, M, new THREE.CylinderGeometry(r * 0.88, r, h - 0.7, 16), [x, y + 0.3 + (h - 0.7) / 2, z], WHITE, [0, 0, 0], 1, 0);
  put(K.plaster, M, new THREE.CylinderGeometry(r * 1.2, r * 0.9, 0.22, 16), [x, y + h - 0.3, z], WHITE);
  put(K.stone, M, new THREE.BoxGeometry(r * 2.8, 0.18, r * 2.8), [x, y + h - 0.1, z], STONE);
}

// a classical portico: columns, entablature, pediment, steps
export function portico(K, M, { x = 0, z, w, h, cols = 4, depth = 2.6, y = 0 }) {
  const step = w / (cols - 1);
  for (let i = 0; i < cols; i++) column(K, M, x - w / 2 + i * step, y, z + depth - 0.5, h);
  put(K.plaster, M, new THREE.BoxGeometry(w + 1.4, 0.75, depth + 0.6), [x, y + h + 0.37, z + depth / 2 - 0.2], WHITE);
  put(K.plaster, M, gable(w + 1.6, 1.8, depth + 0.7), [x, y + h + 0.74, z + depth / 2 - 0.2], WHITE);
  put(K.stone, M, new THREE.BoxGeometry(w + 1.6, 0.12, depth + 0.8), [x, y + h + 0.8, z + depth / 2 - 0.2], STONE);
  // steps
  for (let k = 0; k < 4; k++) put(K.concrete, M, new THREE.BoxGeometry(w + 1.4 - k * 0.2, 0.18, depth + 1.6 - k * 0.45), [x, y + 0.09 + k * 0.18 - 0.7, z + depth / 2 + 0.6 - k * 0.22], '#d8d2c6', [0, 0, 0], 1, 0.01);
  // door with a fanlight
  put(K.props, M, new THREE.BoxGeometry(1.8, 2.8, 0.12), [x, y + 1.4, z + 0.05], '#3a2a24');
  put(K.windows, M, new THREE.CircleGeometry(0.9, 16, 0, Math.PI), [x, y + 2.82, z + 0.12], '#ffd78a', [0, 0, 0], 1, 0);
}

// multi-pane sash window with white frame, stone lintel + keystone and sill
function sashWindow(K, M, x, y, z, ww = 1.1, wh = 1.9, lit = 0.6) {
  put(K.plaster, M, new THREE.BoxGeometry(ww + 0.22, wh + 0.22, 0.1), [x, y, z], WHITE, [0, 0, 0], 1, 0);
  const glass = lit > 0.35 ? new THREE.Color('#ffd78a').multiplyScalar(0.7 + lit * 0.5) : new THREE.Color('#4a5a78');
  put(K.windows, M, new THREE.PlaneGeometry(ww, wh), [x, y, z + 0.055], glass, [0, 0, 0], 1, 0);
  // muntins: 6-over-6
  for (const dx of [-ww / 6, ww / 6]) put(K.plaster, M, new THREE.BoxGeometry(0.04, wh, 0.03), [x + dx, y, z + 0.07], WHITE, [0, 0, 0], 1, 0);
  for (const dy of [-wh / 4, 0, wh / 4]) put(K.plaster, M, new THREE.BoxGeometry(ww, dy === 0 ? 0.08 : 0.04, 0.03), [x, y + dy, z + 0.07], WHITE, [0, 0, 0], 1, 0);
  put(K.stone, M, new THREE.BoxGeometry(ww + 0.5, 0.22, 0.16), [x, y + wh / 2 + 0.22, z + 0.02], STONE);
  put(K.stone, M, new THREE.BoxGeometry(0.26, 0.32, 0.2), [x, y + wh / 2 + 0.27, z + 0.04], STONE);
  put(K.stone, M, new THREE.BoxGeometry(ww + 0.35, 0.1, 0.22), [x, y - wh / 2 - 0.16, z + 0.05], STONE);
}

// stone quoins up a corner, alternating long and short on both faces
function quoins(K, M, x, z, h, base, sx, sz) {
  for (let y = base; y < base + h - 0.3; y += 0.62) {
    const long = Math.round((y - base) / 0.62) % 2 === 0;
    put(K.stone, M, new THREE.BoxGeometry(long ? 0.7 : 0.42, 0.3, 0.1), [x - sx * (long ? 0.35 : 0.21), y + 0.15, z + sz * 0.04], STONE);
    put(K.stone, M, new THREE.BoxGeometry(0.1, 0.3, long ? 0.42 : 0.7), [x + sx * 0.04, y + 0.15, z - sz * (long ? 0.21 : 0.35)], STONE);
  }
}

// A Colonial Revival hall. Front face (+z) toward the path.
export function hall(K, M, rnd, { w = 20, d = 13, floors = 3, brick = '#b8584a', cupola = false, rotunda = false, wings = false } = {}) {
  const fh = 3.6;
  const base = 1.0;
  const H = floors * fh;
  put(K.stone, M, new THREE.BoxGeometry(w + 0.4, base, d + 0.4), [0, base / 2, 0], STONE);
  put(K.brick, M, new THREE.BoxGeometry(w, H, d), [0, base + H / 2, 0], brick, [0, 0, 0], 1, 0.03);
  // belt course and cornice
  put(K.stone, M, new THREE.BoxGeometry(w + 0.2, 0.26, d + 0.2), [0, base + fh + 0.13, 0], STONE);
  put(K.plaster, M, new THREE.BoxGeometry(w + 0.7, 0.7, d + 0.7), [0, base + H + 0.35, 0], WHITE);
  for (let x = -w / 2; x <= w / 2; x += 0.5) put(K.plaster, M, new THREE.BoxGeometry(0.16, 0.14, 0.16), [x, base + H - 0.02, d / 2 + 0.3], WHITE, [0, 0, 0], 1, 0);
  // corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) quoins(K, M, sx * w / 2, sz * d / 2, H, base, sx, sz);
  // hipped slate roof
  put(K.slate, M, hipRoofGeometry(w + 1, d + 1, Math.min(4.5, d * 0.32)), [0, base + H + 0.7, 0], '#8a8f98', [0, 0, 0], 1, 0.03);
  // chimneys
  for (const sx of [-1, 1]) put(K.brick, M, new THREE.BoxGeometry(0.9, 2.4, 0.9), [sx * (w / 2 - 1.6), base + H + 2.2, -d * 0.15], brick);
  // windows on the front face
  const porticoW = Math.min(8, w * 0.36);
  const cols = Math.max(3, Math.floor(w / 2.6));
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + 1.6 + (c * (w - 3.2)) / (cols - 1);
      if (Math.abs(x) < porticoW / 2 + 0.4 && f === 0) continue;
      sashWindow(K, M, x, base + f * fh + 1.85, d / 2 + 0.02, 1.15, 2.0, rnd.next());
    }
  }
  // side windows (seen at an angle)
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < Math.max(2, Math.floor(d / 3)); c++) {
      const z = -d / 2 + 2 + c * ((d - 4) / Math.max(1, Math.floor(d / 3) - 1));
      for (const sx of [-1, 1]) {
        const m = M.clone().multiply(new THREE.Matrix4().makeRotationY((sx * Math.PI) / 2));
        sashWindow(K, m, -z * sx, base + f * fh + 1.85, w / 2 + 0.02, 1.1, 1.9, rnd.next());
      }
    }
  }
  portico(K, M, { z: d / 2, w: porticoW, h: Math.min(H - 0.6, fh * 2), cols: porticoW > 6 ? 6 : 4, y: base });
  if (cupola) {
    const cy = base + H + 0.7 + Math.min(4.5, d * 0.32) - 0.6;
    put(K.plaster, M, new THREE.CylinderGeometry(1.4, 1.5, 2.2, 8), [0, cy + 1.1, 0], WHITE);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      put(K.windows, M, new THREE.PlaneGeometry(0.5, 1.2), [Math.sin(a) * 1.43, cy + 1.2, Math.cos(a) * 1.43], '#ffd78a', [0, a, 0], 1, 0);
    }
    put(K.metal, M, new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, cy + 2.2, 0], '#7fa894', [0, 0, 0], [1, 1.2, 1]);
    put(K.metal, M, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), [0, cy + 4.2, 0], '#c9a94a');
  }
  if (rotunda) {
    const ry = base + H + 0.7;
    put(K.plaster, M, new THREE.CylinderGeometry(4.2, 4.4, 2.6, 24), [0, ry + 1.3, 0], WHITE);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      column(K, M, Math.sin(a) * 4.4, ry, Math.cos(a) * 4.4, 2.6, 0.18);
    }
    put(K.metal, M, new THREE.SphereGeometry(4.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, ry + 2.6, 0], '#9aa6a0');
    put(K.plaster, M, new THREE.CylinderGeometry(0.6, 0.7, 1.4, 8), [0, ry + 7.2, 0], WHITE);
  }
  if (wings) {
    for (const sx of [-1, 1]) {
      const ww = w * 0.45;
      const x = sx * (w / 2 + ww / 2 - 0.2);
      put(K.stone, M, new THREE.BoxGeometry(ww, base, d * 0.75 + 0.3), [x, base / 2, -d * 0.12], STONE);
      put(K.brick, M, new THREE.BoxGeometry(ww, H - fh, d * 0.75), [x, base + (H - fh) / 2, -d * 0.12], brick);
      put(K.plaster, M, new THREE.BoxGeometry(ww + 0.4, 0.5, d * 0.75 + 0.4), [x, base + H - fh + 0.25, -d * 0.12], WHITE);
      put(K.slate, M, hipRoofGeometry(ww + 0.6, d * 0.75 + 0.6, 2.6), [x, base + H - fh + 0.5, -d * 0.12], '#8a8f98');
      for (let f = 0; f < floors - 1; f++) for (let c = 0; c < 3; c++) sashWindow(K, M, x - ww / 2 + 1.4 + c * ((ww - 2.8) / 2), base + f * fh + 1.85, d * 0.25 + 0.02, 1.0, 1.8, rnd.next());
    }
  }
}

// The domed rotunda: an octagonal core with four porticos (a Greek cross)
// and a fountain out front. The campus's signature landmark.
export function rotundaLandmark(K, M, rnd) {
  const base = 1.2;
  put(K.stone, M, new THREE.CylinderGeometry(10.6, 10.8, base, 8), [0, base / 2, 0], STONE, [0, Math.PI / 8, 0]);
  put(K.brick, M, new THREE.CylinderGeometry(9.4, 9.4, 9, 8), [0, base + 4.5, 0], '#b25444', [0, Math.PI / 8, 0]);
  put(K.plaster, M, new THREE.CylinderGeometry(9.9, 9.9, 0.8, 8), [0, base + 9.4, 0], WHITE, [0, Math.PI / 8, 0]);
  // four arms with porticos
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const arm = M.clone().multiply(new THREE.Matrix4().makeRotationY(a));
    put(K.brick, arm, new THREE.BoxGeometry(10, 9, 6), [0, base + 4.5, 9.8], '#b25444');
    put(K.plaster, arm, new THREE.BoxGeometry(10.5, 0.8, 6.5), [0, base + 9.4, 9.8], WHITE);
    portico(K, arm, { z: 12.8, w: 7.5, h: 8, cols: 4, depth: 3, y: base });
    for (const sx of [-1, 1]) {
      sashWindow(K, arm, sx * 3.6, base + 2.2, 12.82, 1.1, 2.1, rnd.next());
      sashWindow(K, arm, sx * 3.6, base + 6, 12.82, 1.1, 2.1, rnd.next());
    }
    // urns on the parapet corners
    for (const sx of [-1, 1]) put(K.stone, arm, urn(), [sx * 4.8, base + 9.8, 12.5], STONE, [0, 0, 0], 1.3);
  }
  // drum and dome with a lantern
  put(K.plaster, M, new THREE.CylinderGeometry(6.6, 6.8, 3.4, 24), [0, base + 11.5, 0], WHITE);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    put(K.windows, M, new THREE.PlaneGeometry(0.8, 1.8), [Math.sin(a) * 6.82, base + 11.5, Math.cos(a) * 6.82], '#ffd78a', [0, a, 0], 1, 0);
  }
  put(K.metal, M, new THREE.SphereGeometry(6.9, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), [0, base + 13.2, 0], '#a9b3ad', [0, 0, 0], [1, 0.85, 1]);
  put(K.plaster, M, new THREE.CylinderGeometry(1.2, 1.3, 2, 8), [0, base + 19.6, 0], WHITE);
  put(K.metal, M, new THREE.SphereGeometry(1.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, base + 20.6, 0], '#a9b3ad');
  put(K.glow, M, new THREE.SphereGeometry(0.3, 8, 6), [0, base + 22.2, 0], '#fff2cf');
  // fountain in front, toward the path
  fountain(K, M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 22)));
}

export function fountain(K, M) {
  put(K.marble, M, new THREE.CylinderGeometry(5, 5.2, 0.7, 32), [0, 0.35, 0], '#efe9de');
  put(K.water, M, new THREE.CylinderGeometry(4.6, 4.6, 0.1, 32), [0, 0.62, 0], '#ffffff');
  put(K.marble, M, new THREE.CylinderGeometry(1.6, 1.9, 1.2, 20), [0, 1.2, 0], '#efe9de');
  put(K.marble, M, new THREE.CylinderGeometry(0.5, 0.7, 1.6, 12), [0, 2.4, 0], '#efe9de');
  put(K.water, M, new THREE.CylinderGeometry(1.35, 1.35, 0.08, 20), [0, 1.82, 0], '#ffffff');
  // jets: soft glowing columns of spray
  put(K.spray, M, new THREE.CylinderGeometry(0.08, 0.25, 3.6, 10, 1, true), [0, 4.6, 0], '#dff4ff');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(K.spray, M, new THREE.CylinderGeometry(0.04, 0.12, 1.8, 6, 1, true), [Math.sin(a) * 3.4, 1.5, Math.cos(a) * 3.4], '#dff4ff', [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5]);
  }
}

// brick gateway piers with stone caps and urns, an iron arch over the path
export function gateway(K, M, halfW) {
  for (const sx of [-1, 1]) {
    const x = sx * (halfW + 1.2);
    put(K.stone, M, new THREE.BoxGeometry(1.8, 0.5, 1.8), [x, 0.25, 0], STONE);
    put(K.brick, M, new THREE.BoxGeometry(1.5, 3.6, 1.5), [x, 2.3, 0], '#b25444');
    for (const y of [1.4, 2.6]) put(K.stone, M, new THREE.BoxGeometry(1.6, 0.2, 1.6), [x, y, 0], STONE);
    put(K.stone, M, new THREE.BoxGeometry(1.9, 0.35, 1.9), [x, 4.25, 0], STONE);
    put(K.stone, M, urn(), [x, 4.42, 0], STONE, [0, 0, 0], 1.3);
    // iron fence running out from the piers
    for (let k = 1; k <= 8; k++) {
      put(K.metal, M, new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), [x + sx * k * 0.5, 0.9, 0], '#1d1d20');
      put(K.metal, M, new THREE.ConeGeometry(0.06, 0.18, 5), [x + sx * k * 0.5, 1.88, 0], '#c9a94a');
    }
    put(K.metal, M, new THREE.BoxGeometry(4.2, 0.06, 0.06), [x + sx * 2.3, 1.6, 0], '#1d1d20');
    put(K.metal, M, new THREE.BoxGeometry(4.2, 0.06, 0.06), [x + sx * 2.3, 0.3, 0], '#1d1d20');
    put(K.glow, M, new THREE.SphereGeometry(0.22, 10, 8), [x, 5.6, 0], '#ffd9a0');
  }
  // arch
  const span = halfW + 1.2;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-span, 4.2, 0), new THREE.Vector3(0, 7.4, 0), new THREE.Vector3(span, 4.2, 0));
  K.metal.addMatrix(new THREE.TubeGeometry(curve, 24, 0.09, 6, false), M, '#1d1d20', 0);
}

// bronze eagle with spread wings on a tall stone plinth
export function eagleStatue(K, M) {
  put(K.stone, M, new THREE.BoxGeometry(3, 0.6, 3), [0, 0.3, 0], STONE);
  put(K.stone, M, new THREE.BoxGeometry(2.2, 4.4, 2.2), [0, 2.8, 0], STONE);
  put(K.stone, M, new THREE.BoxGeometry(2.6, 0.4, 2.6), [0, 5.2, 0], STONE);
  const B = '#7a5a34';
  const y = 5.4;
  put(K.bronze, M, new THREE.SphereGeometry(0.9, 16, 12), [0, y + 1.3, 0], B, [0.3, 0, 0], [0.8, 1.2, 0.7]);
  put(K.bronze, M, new THREE.SphereGeometry(0.45, 14, 10), [0, y + 2.65, 0.35], B);
  put(K.bronze, M, new THREE.ConeGeometry(0.16, 0.5, 8), [0, y + 2.55, 0.85], '#8a6a3a', [Math.PI / 2 + 0.4, 0, 0]);
  for (const sx of [-1, 1]) {
    // upswept wings in three feathered sections
    for (let k = 0; k < 3; k++) {
      put(K.bronze, M, new THREE.BoxGeometry(1.5, 0.12, 0.8 - k * 0.15), [sx * (0.9 + k * 1.15), y + 1.9 + k * 0.75, -0.1], B, [0, 0, sx * (0.55 + k * 0.12)]);
      for (let f = 0; f < 3; f++) put(K.bronze, M, new THREE.BoxGeometry(0.16, 0.08, 0.7), [sx * (1.2 + k * 1.15 + f * 0.32), y + 1.55 + k * 0.75, -0.55], B, [0.4, 0, sx * 0.6]);
    }
    put(K.bronze, M, new THREE.CylinderGeometry(0.1, 0.14, 0.8, 8), [sx * 0.35, y + 0.4, 0.2], B);
  }
  put(K.bronze, M, new THREE.BoxGeometry(0.9, 0.12, 0.9), [0, y + 1.1, -0.85], B, [0.5, 0, 0]);
}

// stadium bowl on the horizon with floodlight towers
export function stadium(K, M) {
  const R = 46;
  const ring = (r0, r1, y, h, color, b = K.concrete) => {
    const g = new THREE.CylinderGeometry(r1, r0, h, 48, 1, true);
    put(b, M, g, [0, y + h / 2, 0], color, [0, 0, 0], [1, 1, 0.72]);
  };
  ring(R, R, 0, 22, '#cfc8bb');
  for (let k = 0; k < 6; k++) ring(R - 2 - k * 4, R - 6 - k * 4, 4 + k * 3, 1.2, k % 2 ? '#d4a82a' : '#1d1d20', K.props);
  put(K.concrete, M, new THREE.BoxGeometry(30, 6, 6), [0, 25, R * 0.72 - 2], '#cfc8bb');
  put(K.windows, M, new THREE.PlaneGeometry(28, 3), [0, 25, R * 0.72 + 1.02], '#ffd78a', [0, 0, 0], 1, 0);
  for (const [x, z] of [
    [-R * 0.8, -R * 0.5],
    [R * 0.8, -R * 0.5],
    [-R * 0.8, R * 0.5],
    [R * 0.8, R * 0.5],
  ]) {
    put(K.metal, M, new THREE.CylinderGeometry(0.6, 0.9, 42, 8), [x, 21, z], '#8a9098');
    put(K.metal, M, new THREE.BoxGeometry(8, 4, 1), [x, 43, z], '#4a4f58', [0, Math.atan2(-x, -z), 0]);
    put(K.glow, M, new THREE.PlaneGeometry(7, 3), [x - Math.sign(x) * 0.6, 43, z - Math.sign(z) * 0.6], '#fffbe8', [0, Math.atan2(-x, -z), 0], 1, 0);
  }
}
