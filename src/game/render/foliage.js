import * as THREE from 'three';
import { shared } from './materials';

// Foliage cards: textured, alpha-tested quads (the way game studios build
// real-time trees). The atlas is painted once on a canvas.
//
// Atlas tiles (2x3): 0 oak leaves, 1 pine needles, 2 Spanish moss,
//                    3 magnolia leaves + blossoms, 4 azalea blossoms, 5 grass tuft

export const TILE = { oak: 0, pine: 1, moss: 2, magnolia: 3, azalea: 4, tuft: 5 };
const COLS = 2;
const ROWS = 3;

let atlas = null;
function paintAtlas() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S * COLS;
  c.height = S * ROWS;
  const g = c.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tile = (i, fn) => {
    g.save();
    g.translate((i % COLS) * S, Math.floor(i / COLS) * S);
    g.beginPath();
    g.rect(0, 0, S, S);
    g.clip();
    fn();
    g.restore();
  };
  const leaf = (x, y, len, wid, ang, fill, vein) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(wid, len * 0.45, 0, len);
    g.quadraticCurveTo(-wid, len * 0.45, 0, 0);
    g.fillStyle = fill;
    g.fill();
    if (vein) {
      g.strokeStyle = vein;
      g.lineWidth = Math.max(1, wid * 0.12);
      g.beginPath();
      g.moveTo(0, len * 0.05);
      g.lineTo(0, len * 0.92);
      g.stroke();
    }
    g.restore();
  };
  const shade = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

  // live oak: dense small glossy leaves in a round cluster
  tile(0, () => {
    for (let k = 0; k < 420; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.7) * S * 0.46;
      leaf(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 26 + rnd() * 16, 9 + rnd() * 5, rnd() * Math.PI * 2, shade(95 + rnd() * 25, 35 + rnd() * 20, 18 + rnd() * 22), shade(100, 30, 12));
    }
  });
  // longleaf pine: long needles bursting from a tuft
  tile(1, () => {
    g.lineCap = 'round';
    for (let k = 0; k < 520; k++) {
      const a = rnd() * Math.PI * 2;
      const len = S * (0.18 + rnd() * 0.3);
      g.strokeStyle = shade(100 + rnd() * 20, 40, 18 + rnd() * 20);
      g.lineWidth = 2 + rnd() * 2;
      g.beginPath();
      g.moveTo(S / 2, S / 2);
      g.quadraticCurveTo(S / 2 + Math.cos(a) * len * 0.5, S / 2 + Math.sin(a) * len * 0.5 - 10, S / 2 + Math.cos(a) * len, S / 2 + Math.sin(a) * len);
      g.stroke();
    }
  });
  // Spanish moss: grey-green strands hanging down
  tile(2, () => {
    g.lineCap = 'round';
    for (let k = 0; k < 160; k++) {
      const x = S * 0.15 + rnd() * S * 0.7;
      const len = S * (0.35 + rnd() * 0.6);
      g.strokeStyle = shade(85 + rnd() * 20, 12 + rnd() * 10, 48 + rnd() * 18);
      g.lineWidth = 1.5 + rnd() * 2.5;
      g.beginPath();
      g.moveTo(x, 0);
      let px = x;
      for (let y = 0; y < len; y += 18) {
        px += (rnd() - 0.5) * 10;
        g.lineTo(px, y);
      }
      g.stroke();
    }
  });
  // magnolia: big glossy dark leaves with a few white blossoms
  tile(3, () => {
    for (let k = 0; k < 130; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.6) * S * 0.44;
      leaf(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 70 + rnd() * 30, 22 + rnd() * 8, rnd() * Math.PI * 2, shade(120 + rnd() * 15, 40, 12 + rnd() * 14), shade(110, 25, 30));
    }
    for (let k = 0; k < 5; k++) {
      const x = S * (0.25 + rnd() * 0.5);
      const y = S * (0.25 + rnd() * 0.5);
      for (let p = 0; p < 6; p++) leaf(x, y, 36, 16, (p / 6) * Math.PI * 2, '#f6f1e4', '#e0d6c0');
      g.fillStyle = '#d8c070';
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
  // azalea: a mound of pink and magenta blossoms over leaves
  tile(4, () => {
    for (let k = 0; k < 260; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.6) * S * 0.46;
      leaf(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 22, 8, rnd() * 6.28, shade(110, 35, 20 + rnd() * 12));
    }
    for (let k = 0; k < 120; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.8) * S * 0.42;
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r;
      const hue = rnd() < 0.6 ? 330 + rnd() * 15 : 300 + rnd() * 20;
      for (let p = 0; p < 5; p++) leaf(x, y, 14, 9, (p / 5) * Math.PI * 2, shade(hue, 70, 62 + rnd() * 14));
    }
  });
  // grass tuft
  tile(5, () => {
    g.lineCap = 'round';
    for (let k = 0; k < 200; k++) {
      const x = S * 0.1 + rnd() * S * 0.8;
      const h = S * (0.3 + rnd() * 0.6);
      g.strokeStyle = shade(95 + rnd() * 20, 45, 22 + rnd() * 20);
      g.lineWidth = 3 + rnd() * 3;
      g.beginPath();
      g.moveTo(x, S);
      g.quadraticCurveTo(x + (rnd() - 0.5) * 40, S - h * 0.6, x + (rnd() - 0.5) * 80, S - h);
      g.stroke();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

let mat = null;
export function foliageMaterial() {
  if (mat) return mat;
  atlas = paintAtlas();
  mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = position.x * 0.17 + position.z * 0.13;
        transformed.x += sin(uTime * 1.6 + ph) * 0.12 * sway;
        transformed.z += cos(uTime * 1.3 + ph * 1.4) * 0.09 * sway;
        transformed.y += sin(uTime * 2.1 + ph * 2.0) * 0.03 * sway;`
      )
      // leaves light from above, not as flat cards
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.65));');
    // dissolve foliage right in front of the camera (dithered, no sorting)
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#include <alphatest_fragment>
      float camDist = length(vViewPosition);
      float keep = smoothstep(5.0, 11.0, camDist);
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (dither > keep) discard;`
    );
  };
  mat.customProgramCacheKey = () => 'foliage-cards';
  return mat;
}

// Collects card quads (with UVs into the atlas) for one chunk.
export class Cards {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.sway = [];
  }
  // a quad centred at `c`, spanned by unit vectors `r` (right) and `u` (up)
  quad(c, r, u, w, h, tile, color, sway = 1, flipU = false) {
    const tx = (tile % COLS) / COLS;
    const ty = 1 - (Math.floor(tile / COLS) + 1) / ROWS;
    const u0 = flipU ? tx + 1 / COLS : tx;
    const u1 = flipU ? tx : tx + 1 / COLS;
    const v0 = ty;
    const v1 = ty + 1 / ROWS;
    const hw = w / 2;
    const hh = h / 2;
    const P = (sx, sy) => [c.x + r.x * sx * hw + u.x * sy * hh, c.y + r.y * sx * hw + u.y * sy * hh, c.z + r.z * sx * hw + u.z * sy * hh];
    const a = P(-1, -1);
    const b = P(1, -1);
    const cc = P(1, 1);
    const d = P(-1, 1);
    this.pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    const k = [0, 0, 1, 0, 1, 1];
    for (let i = 0; i < 6; i++) {
      this.col.push(color.r, color.g, color.b);
      this.sway.push(sway * (0.4 + 0.6 * k[i]));
    }
  }
  // a crossed pair of cards (looks full from every angle)
  cross(c, w, h, tile, color, sway, rot = 0) {
    const r1 = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot));
    const r2 = new THREE.Vector3(-Math.sin(rot), 0, Math.cos(rot));
    const up = new THREE.Vector3(0, 1, 0);
    this.quad(c, r1, up, w, h, tile, color, sway);
    this.quad(c, r2, up, w, h, tile, color, sway, true);
  }
  // a card lying roughly flat, tilted (canopy layers)
  flat(c, size, tile, color, sway, rot, tilt) {
    const r = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot));
    const f = new THREE.Vector3(-Math.sin(rot), 0, Math.cos(rot));
    const u = f.clone().multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0)).normalize();
    this.quad(c, r, u, size, size, tile, color, sway);
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// shadow caster that respects the leaf cut-outs
let depthMat = null;
export function foliageDepthMaterial() {
  if (depthMat) return depthMat;
  foliageMaterial();
  depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.42 });
  return depthMat;
}
