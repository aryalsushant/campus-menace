import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { withRim } from './materials';

// Rigged people (CC0 Quaternius Universal Base Characters) with
// motion-captured clips (CC0 Universal Animation Library).
//
// Bodies wear a skin-tight suit in the source, so outfits are painted per
// vertex from each vertex's bone weights: hoodie on the torso and arms,
// jeans on the legs, sneakers on the feet, skin on the head and hands.

const BASE = '/assets/characters/';
let loading = null;
let assets = null;

export function loadPeople() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const load = f => new Promise((res, rej) => loader.load(BASE + f, res, undefined, rej));
  loading = Promise.all([load('body-m.glb'), load('body-f.glb'), load('hair.glb'), load('anims.glb')]).then(([m, f, hair, anims]) => {
    // node names carry the style; meshes may be nested under them
    const hairMeshes = {};
    // bake each node's transform (exports carry unit scale) into its geometry
    hair.scene.updateMatrixWorld(true);
    hair.scene.children.forEach(n => {
      const mesh = n.isMesh ? n : n.getObjectByProperty('isMesh', true);
      if (!mesh) return;
      // quantized (normalized int16) attributes would clamp when transformed:
      // expand them to floats first
      const geometry = mesh.geometry.clone();
      for (const name of ['position', 'normal', 'uv']) {
        const a = geometry.attributes[name];
        if (!a || a.array instanceof Float32Array) continue;
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
        geometry.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
      }
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeVertexNormals();
      hairMeshes[n.name] = { geometry, material: mesh.material };
    });
    const clips = {};
    for (const c of anims.animations) clips[c.name] = c;
    assets = { bodies: { m: m.scene, f: f.scene }, hair: hairMeshes, clips, split: splitClips(clips) };
    return assets;
  });
  return loading;
}
export const peopleReady = () => assets;
if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined') window.__people = () => assets;

// --------------------------------------------------------------- clip layers
const UPPER = /^(spine_0[123]|neck_01|Head|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|hand_[lr])\./;
function splitClips(clips) {
  const out = {};
  for (const [name, c] of Object.entries(clips)) {
    const upper = c.tracks.filter(t => UPPER.test(t.name));
    const lower = c.tracks.filter(t => !UPPER.test(t.name));
    out[name] = {
      upper: new THREE.AnimationClip(`${name}_upper`, c.duration, upper),
      lower: new THREE.AnimationClip(`${name}_lower`, c.duration, lower),
    };
  }
  return out;
}

// ------------------------------------------------------------------ outfits
const REGION = name => {
  if (/^(Head|neck_01)$/.test(name) || /^hand_|^(index|middle|ring|pinky|thumb)_/.test(name)) return 'skin';
  if (/^(foot|ball)_/.test(name)) return 'shoes';
  if (/^(pelvis|thigh|calf)_?/.test(name) || name === 'root') return 'bottom';
  return 'top';
};

const _c = new THREE.Color();
function paint(mesh, outfit, toCharacter) {
  const g = mesh.geometry.clone();
  mesh.geometry = g;
  const idx = g.attributes.skinIndex;
  const wt = g.attributes.skinWeight;
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  const bones = mesh.skeleton.bones;
  const palette = {
    skin: new THREE.Color(outfit.skin),
    top: new THREE.Color(outfit.top),
    bottom: new THREE.Color(outfit.bottom),
    shoes: new THREE.Color(outfit.shoes),
  };
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // the region holding most of this vertex's weight wins (blending hoodie
    // and jeans colours at the waist would make magenta)
    const acc = { skin: 0, top: 0, bottom: 0, shoes: 0 };
    for (let k = 0; k < 4; k++) {
      const w = wt.getComponent(i, k);
      if (w <= 0) continue;
      const b = bones[idx.getComponent(i, k)];
      acc[REGION(b ? b.name : 'spine_01')] += w;
    }
    let best = 'top';
    for (const r in acc) if (acc[r] > acc[best]) best = r;
    _c.copy(palette[best]);
    // sneaker soles: the lowest band of the feet
    if (outfit.sole) {
      // height through the skinning (the raw vertex data is in the armature's frame)
      v.fromBufferAttribute(pos, i);
      mesh.applyBoneTransform(i, v);
      if (v.applyMatrix4(toCharacter).y < 0.035) _c.set(outfit.sole);
    }
    cols[i * 3] = _c.r;
    cols[i * 3 + 1] = _c.g;
    cols[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  // subtle fabric grain so clothes don't look like plastic
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nfloat fh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.94 + 0.08 * fh(floor(vObjPos * 260.0));');
  };
  mat.customProgramCacheKey = () => 'person';
  withRim(mat, outfit.rim || '#ffe6c8', outfit.rimStrength ?? 0.4);
  mesh.material = mat;
}

// character-space position of a bone in the bind pose
export function bindPosition(person, boneName) {
  const m = person.bindWorld[boneName];
  return m ? new THREE.Vector3().setFromMatrixPosition(m) : new THREE.Vector3();
}

// Turn a world-space (character space) position into a bone's local frame,
// using the bind pose, so attachments stick to the bone as it animates.
export function attach(person, boneName, object, { pos = [0, 0, 0], rot = [0, 0, 0] } = {}) {
  const bone = person.bones[boneName];
  if (!bone) return;
  const inv = person.bindWorld[boneName].clone().invert();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
  m.premultiply(inv);
  m.decompose(object.position, object.quaternion, object.scale);
  bone.add(object);
}

export function makePerson({ sex = 'm', outfit, hair = 'Hair_SimpleParted', hairColor = '#2a1a12', brows = true, castShadow = true }) {
  const A = assets;
  const root = new THREE.Group();
  const body = cloneSkinned(A.bodies[sex]);
  // source faces +z; the game faces -z
  body.rotation.y = Math.PI;
  root.add(body);
  const bones = {};
  let mainMesh = null;
  body.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) {
      // bind-pose bounds padded so animated limbs never pop out of view
      o.geometry.computeBoundingSphere();
      o.geometry.boundingSphere.radius *= 1.6;
      o.frustumCulled = true;
      o.castShadow = castShadow;
      o.receiveShadow = false;
      if (/Superhero|Sphere/.test(o.name) || o.geometry.attributes.position.count > 4000) mainMesh = o;
      else if (o.material) {
        // eyes and brows: keep the textured eyes, darken brows to the hair colour
        o.material = o.material.clone();
        if (/brow/i.test(o.name) || /Face$/.test(o.name)) o.material.color = new THREE.Color(hairColor);
      }
    }
  });
  // bind pose, measured in character space (the body's own frame) before any
  // animation runs; the source armature is Z-up, so raw vertex data isn't
  body.updateMatrixWorld(true);
  const toBody = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const bindWorld = {};
  for (const [name, b] of Object.entries(bones)) bindWorld[name] = new THREE.Matrix4().multiplyMatrices(toBody, b.matrixWorld);
  if (mainMesh) {
    const toCharacter = new THREE.Matrix4().multiplyMatrices(toBody, mainMesh.matrixWorld);
    paint(mainMesh, outfit, toCharacter);
  }
  const person = { root, body, bones, bindWorld, mesh: mainMesh };
  // hair and eyebrows ride on the head bone
  const addHead = (name, color) => {
    const src = A.hair[name];
    if (!src) return;
    const m = new THREE.Mesh(src.geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.65, map: src.material.map || null }));
    m.castShadow = castShadow;
    withRim(m.material, '#ffd9a8', 0.35);
    attach(person, 'Head', m);
  };
  if (hair) addHead(hair, hairColor);
  if (brows && sex === 'm') addHead('Eyebrows_Regular', hairColor);

  // animation layers: lower body and upper body play independently
  const mixer = new THREE.AnimationMixer(body);
  const layers = { upper: {}, lower: {} };
  for (const [name, parts] of Object.entries(A.split)) {
    layers.upper[name] = mixer.clipAction(parts.upper);
    layers.lower[name] = mixer.clipAction(parts.lower);
  }
  const state = { upper: null, lower: null };
  person.mixer = mixer;
  person.play = (name, { layer = 'both', fade = 0.15, loop = true, timeScale = 1, clamp = false } = {}) => {
    for (const L of layer === 'both' ? ['upper', 'lower'] : [layer]) {
      const next = layers[L][name];
      if (!next) continue;
      next.timeScale = timeScale;
      if (state[L] === name) continue;
      const prev = state[L] && layers[L][state[L]];
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      next.clampWhenFinished = clamp || !loop;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      if (prev) prev.crossFadeTo(next, fade, false);
      state[L] = name;
    }
  };
  person.speed = (name, ts) => {
    for (const L of ['upper', 'lower']) if (state[L] === name) layers[L][name].timeScale = ts;
  };
  person.current = state;
  person.action = (layer, name) => layers[layer][name];
  return person;
}

// ------------------------------------------------------------ casting
export const SKIN_TONES = ['#f1c7a3', '#e0ac85', '#c68b62', '#9a6544', '#6e4630', '#f5d6bf'];
export const HAIR_COLORS = ['#1b1210', '#2a1a12', '#4a2a18', '#7a4a20', '#c79a52', '#1f1f22'];
export const TOPS = ['#3fb4e8', '#8f5fe8', '#e8476a', '#2fbf8f', '#f2c63a', '#ff8a3d', '#2b2f3a', '#e8e8ea', '#7a1f2b', '#1f3a5f'];
export const BOTTOMS = ['#2b3242', '#3f5f94', '#1e1e22', '#5a5048', '#3a4a3a', '#6a7a9a'];
export const STYLES = {
  m: ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Beard'],
  f: ['Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale'],
};

export function randomLook(seed) {
  let s = seed >>> 0 || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = a => a[Math.floor(r() * a.length)];
  const sex = r() < 0.5 ? 'm' : 'f';
  return {
    sex,
    hair: pick(STYLES[sex]),
    hairColor: pick(HAIR_COLORS),
    outfit: { skin: pick(SKIN_TONES), top: pick(TOPS), bottom: pick(BOTTOMS), shoes: r() < 0.5 ? '#f2f2f2' : '#1e1e22', sole: r() < 0.3 ? '#e8473f' : null },
  };
}
