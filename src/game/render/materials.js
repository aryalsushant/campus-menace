import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// Shared materials. Uniforms (time, night) are driven from Atmosphere.
export const shared = {
  uTime: { value: 0 },
  uNight: { value: 0 },
};

// --- procedural paving texture (warm stone pavers, running bond)
function paverTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b9a58e';
  g.fillRect(0, 0, 256, 256);
  const rows = 8;
  const h = 256 / rows;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 32 : 0;
    for (let x = -64; x < 256; x += 64) {
      const l = 196 + rnd() * 34;
      g.fillStyle = `rgb(${l},${l * 0.9},${l * 0.78})`;
      g.fillRect(x + off + 2, r * h + 2, 60, h - 4);
      // subtle speckle
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(90,70,50,${0.05 + rnd() * 0.06})`;
        g.fillRect(x + off + 4 + rnd() * 52, r * h + 4 + rnd() * (h - 8), 3, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}


// ---------------------------------------------------------------------------
// World-space surface detail. Geometry is merged and has no UVs, so patterns
// (brick courses, shingles, leaves, grain) are computed from world position.
const DETAIL = {
  brick: /* glsl */ `
    vec2 bp = abs(vWN.x) > abs(vWN.z) ? vWP.zy : vWP.xy;
    bp *= vec2(1.0 / 0.44, 1.0 / 0.17);
    float row = floor(bp.y);
    bp.x += mod(row, 2.0) * 0.5;
    vec2 bf = fract(bp);
    float mortar = 1.0 - smoothstep(0.0, 0.05, min(min(bf.x, 1.0 - bf.x) * 0.6, min(bf.y, 1.0 - bf.y)));
    float bn = dHash(floor(bp));
    float vertical = 1.0 - smoothstep(0.4, 0.7, abs(vWN.y));
    vec3 brickCol = diffuseColor.rgb * (0.82 + 0.32 * bn) * (0.94 + 0.12 * dNoise(vWP.xy * 3.0 + vWP.zy * 3.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(brickCol, vec3(0.74, 0.7, 0.64), mortar), vertical);
  `,
  roof: /* glsl */ `
    vec2 rp = vec2(vWP.x + vWP.z, vWP.y) * vec2(1.0 / 0.5, 1.0 / 0.32);
    rp.x += mod(floor(rp.y), 2.0) * 0.5;
    vec2 rf = fract(rp);
    float edge = smoothstep(0.0, 0.12, rf.y) * smoothstep(0.0, 0.06, min(rf.x, 1.0 - rf.x));
    diffuseColor.rgb *= (0.72 + 0.28 * edge) * (0.9 + 0.2 * dHash(floor(rp)));
  `,
  leaf: /* glsl */ `
    float l1 = dNoise(vWP.xz * 4.0 + vWP.y * 3.0);
    float l2 = dNoise(vWP.xy * 7.0 + vWP.zx * 5.0);
    diffuseColor.rgb *= 0.72 + 0.42 * l1 + 0.18 * l2;
    diffuseColor.rgb += vec3(0.04, 0.07, 0.0) * smoothstep(0.6, 1.0, vWN.y);
  `,
  grain: /* glsl */ `
    diffuseColor.rgb *= 0.93 + 0.12 * dNoise(vWP.xz * 2.5 + vWP.y * 1.7);
  `,
};

const DETAIL_COMMON = /* glsl */ `
  varying vec3 vWP; varying vec3 vWN;
  float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float dNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1, 0)), u.x), mix(dHash(i + vec2(0, 1)), dHash(i + vec2(1, 1)), u.x), u.y);
  }
`;

export function withDetail(material, kind, extra) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DETAIL_COMMON)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + DETAIL[kind] + (extra || ''));
  };
  const prevDetailKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => `${prevDetailKey()}|detail-${kind}`;
  return material;
}

// Rim light: a fresnel glow on the silhouette so characters pop off the
// background (the "hero" look of stylized action games).
export function withRim(material, color = '#ffe6c8', strength = 0.55, power = 2.6) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uRimColor = { value: new THREE.Color(color) };
    sh.uniforms.uRimStrength = { value: strength };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStrength;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(2)});
        totalEmissiveRadiance += uRimColor * rim * uRimStrength;`
      );
  };
  // colour and strength are uniforms: one program per exponent is enough
  const prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => `${prevKey()}|rim-${power}`;
  return material;
}

let _mats = null;
export function materials() {
  if (_mats) return _mats;
  const terrain = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  const props = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.04 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.55 });

  const paver = paverTexture();
  const path = new THREE.MeshStandardMaterial({ map: paver, bumpMap: paver, bumpScale: 2.2, roughness: 0.82, metalness: 0 });
  const brick = withDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }), 'brick');
  const roof = withDetail(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.05 }), 'roof');
  const leaf = withDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }), 'leaf');
  withDetail(props, 'grain');
  withDetail(terrain, 'grain');

  // mowed lawn stripes along the path direction (uv.y = s)
  const lawn = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  lawn.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 auv;\nvarying vec2 vAuv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAuv = auv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAuv;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float stripe = step(0.5, fract(vAuv.x / 6.0));
        float n = fract(sin(dot(floor(vAuv * 1.5), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb *= 0.9 + stripe * 0.12 + n * 0.05;`
      );
  };

  // tree canopies sway as whole blobs
  const canopy = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  canopy.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = position.x * 0.21 + position.z * 0.17;
        transformed.x += sin(uTime * 1.4 + ph) * 0.09;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * 0.07;`
      );
  };

  withDetail(canopy, 'leaf');

  // lamps, windows, deck lights: brighter at night
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glow.onBeforeCompile = sh => {
    sh.uniforms.uNight = shared.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.55, 2.4, uNight);');
  };
  const windows = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  windows.onBeforeCompile = sh => {
    sh.uniforms.uNight = shared.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.32, 1.9, uNight);');
  };

  const water = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uNight: shared.uNight },
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uNight; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main() {
        vec2 p = vW.xz * 0.35;
        float w = sin(p.x * 2.1 + uTime * 1.6) * 0.5 + sin(p.y * 1.7 - uTime * 1.2) * 0.5;
        vec3 deep = mix(vec3(0.12, 0.38, 0.52), vec3(0.04, 0.08, 0.2), uNight);
        vec3 lite = mix(vec3(0.42, 0.78, 0.86), vec3(0.2, 0.3, 0.6), uNight);
        vec3 col = mix(deep, lite, 0.5 + 0.25 * w);
        float sp = step(0.985, h(floor(p * 6.0) + floor(uTime * 3.0)));
        col += sp * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  _mats = { terrain, props, metal, path, lawn, canopy, glow, windows, water, brick, roof, leaf };
  return _mats;
}

// ---------------------------------------------------------------------------
// Triplanar PBR: real CC0 textures (Poly Haven) projected in world space,
// so merged geometry without UVs still gets brick courses, slate, bark…
// Vertex colours tint the result (white = the texture's own colour).
const texLoader = new THREE.TextureLoader();
const texCache = new Map();
const setup = (t, srgb) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
function tex(path, srgb) {
  if (!texCache.has(path)) texCache.set(path, setup(texLoader.load(path), srgb));
  return texCache.get(path);
}
const TEX_DIR = '/assets/textures';
const TEX_KEYS = ['path', 'brick', 'plaster', 'sandstone', 'slate', 'concrete', 'grass', 'mud', 'bark', 'planks', 'marble', 'metal'];
export const texSet = key => ({
  diff: tex(`${TEX_DIR}/${key}_diff.webp`, true),
  nor: tex(`${TEX_DIR}/${key}_nor.webp`, false),
  rough: tex(`${TEX_DIR}/${key}_rough.webp`, false),
});

// Colour and roughness maps ship as KTX2 (Basis) and stay compressed on the
// GPU. They're loaded up front and stored under the webp path, so texSet()
// stays synchronous; any file that fails to transcode falls back to its webp.
let texturesReady = null;
export function loadTextures(gl) {
  if (texturesReady) return texturesReady;
  const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl);
  const jobs = [];
  for (const key of TEX_KEYS)
    for (const [map, srgb] of [['diff', true], ['rough', false]]) {
      const webp = `${TEX_DIR}/${key}_${map}.webp`;
      jobs.push(
        ktx2
          .loadAsync(`${TEX_DIR}/ktx2/${key}_${map}.ktx2`)
          .then(t => texCache.set(webp, setup(t, srgb)))
          .catch(() => tex(webp, srgb))
      );
    }
  texturesReady = Promise.all(jobs).then(() => ktx2.dispose());
  return texturesReady;
}

const pbrCache = new Map();
export function pbr(key, { scale = 1, normal = 1, rough = 1, vertexColors = true, top = false, extraVertex = '', extraUniforms = null } = {}) {
  const id = `${key}-${scale}-${normal}-${rough}-${vertexColors}-${top}-${extraVertex ? 'x' : ''}`;
  if (pbrCache.has(id)) return pbrCache.get(id);
  const T = texSet(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors, flatShading: false, roughness: 1, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tDiff: { value: T.diff }, tNor: { value: T.nor }, tRough: { value: T.rough }, uTriScale: { value: scale }, uTriNormal: { value: normal }, uTriRough: { value: rough } }, extraUniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriP; varying vec3 vTriN;\n' + (extraUniforms ? 'uniform float uTime;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + extraVertex)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTriP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTriN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${top ? '#define TRI_TOP' : ''}
        varying vec3 vTriP; varying vec3 vTriN;
        uniform sampler2D tDiff; uniform sampler2D tNor; uniform sampler2D tRough;
        uniform float uTriScale; uniform float uTriNormal; uniform float uTriRough;
        vec2 axisUV(int a) { return (a == 0 ? vTriP.zy : a == 1 ? vTriP.xz : vTriP.xy) * uTriScale; }`
      )
      .replace(
        '#include <map_fragment>',
        `// Biplanar mapping (Inigo Quilez): only the two strongest projections
        // are sampled for colour, the strongest one for roughness and normals.
        vec3 nA = abs(normalize(vTriN));
        #ifdef TRI_TOP
          int ma = 1;
          vec2 uvA = axisUV(1);
          vec3 albedo = texture2D(tDiff, uvA).rgb;
        #else
          int ma = nA.x > nA.y ? (nA.x > nA.z ? 0 : 2) : (nA.y > nA.z ? 1 : 2);
          int mi = nA.x < nA.y ? (nA.x < nA.z ? 0 : 2) : (nA.y < nA.z ? 1 : 2);
          int me = 3 - ma - mi;
          vec2 uvA = axisUV(ma);
          vec2 bw = clamp((vec2(nA[ma], nA[me]) - 0.5773) / (1.0 - 0.5773), 0.0, 1.0);
          vec3 albedo = (texture2D(tDiff, uvA).rgb * bw.x + texture2D(tDiff, axisUV(me)).rgb * bw.y) / (bw.x + bw.y + 1e-4);
        #endif
        diffuseColor.rgb *= albedo;`
      )
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * uTriRough * texture2D(tRough, uvA).g;`)
      .replace(
        '#include <normal_fragment_maps>',
        `// UDN-blended normal map on the dominant projection, skipped far away
        if (length(vViewPosition) < 45.0) {
          vec3 nW = normalize(vTriN);
          vec3 tn = texture2D(tNor, uvA).xyz * 2.0 - 1.0;
          vec3 wn = ma == 0 ? vec3(tn.xy * uTriNormal + nW.zy, nW.x).zyx : ma == 1 ? vec3(tn.xy * uTriNormal + nW.xz, nW.y).xzy : vec3(tn.xy * uTriNormal + nW.xy, nW.z);
          normal = normalize((viewMatrix * vec4(normalize(wn), 0.0)).xyz);
        }`
      );
  };
  // textures and scales are uniforms, so triplanar materials share programs
  m.customProgramCacheKey = () => `pbr-${vertexColors ? 'vc' : 'n'}-${top ? 't' : 'b'}-${extraVertex ? 'x' : ''}`;
  pbrCache.set(id, m);
  return m;
}
